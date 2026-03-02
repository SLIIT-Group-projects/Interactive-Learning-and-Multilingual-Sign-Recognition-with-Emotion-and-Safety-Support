import express from "express";
import multer from "multer";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
import { addEmotion } from "../utils/eh_sessionStore.js";
import config from "../../config/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Configure multer to save files in session-specific folders
// Note: req.body might not be fully populated in destination callback,
// so we use a temporary directory and move files in the route handler
const tempDir = join(config.UPLOAD_DIR, "emotion", "_temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Use temp directory first - we'll move the file in the route handler
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

router.post("/predict", upload.single("file"), (req, res) => {
  try {
    console.log(`[Emotion] Received request - Body:`, req.body);
    console.log(`[Emotion] Received file:`, req.file ? {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path
    } : "NO FILE");
    
    const { sessionId } = req.body;
    if (!sessionId) {
      console.error("[Emotion] Missing sessionId in request");
      // Clean up temp file if it exists
      if (req.file) {
        fs.unlink(req.file.path, () => {});
      }
      return res.status(400).json({ error: { message: "sessionId required in body" } });
    }
    if (!req.file) {
      console.error("[Emotion] No file received in request");
      return res.status(400).json({ error: "file required (field name 'file')" });
    }

    // Move file from temp directory to session-specific directory
    const sessionDir = join(config.UPLOAD_DIR, "emotion", sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    
    const finalPath = join(sessionDir, req.file.filename);
    fs.renameSync(req.file.path, finalPath);
    console.log(`[Emotion] Moved file from ${req.file.path} to ${finalPath}`);
    
    const imgPath = finalPath;
    console.log(`[Emotion] Processing image: ${imgPath} for session ${sessionId}`);
    const scriptPath = join(__dirname, "..", "..", "models", "eh_emotion_predict.py");
    
    const py = spawn(config.PYTHON_CMD, [scriptPath, imgPath]);

    let out = "";
    let responseSent = false;
    
    // Set timeout for Python script (30 seconds)
    const timeout = setTimeout(() => {
      if (!responseSent) {
        responseSent = true;
        py.kill('SIGTERM');
        console.error(`[Emotion] Python script timeout for session ${sessionId}`);
        const timeoutResult = {
          predicted: "neutral",
          confidence: 0.0,
          probabilities: {},
          sessionId,
          t: Date.now(),
          error: "Python script timeout (30s)",
        };
        addEmotion(sessionId, timeoutResult);
        return res.status(504).json({ 
          error: "Python script timeout", 
          stored: timeoutResult 
        });
      }
    }, 30000);

    py.stdout.on("data", (d) => (out += d.toString()));
    py.stderr.on("data", (d) => (out += d.toString()));

    py.on("close", (code) => {
      clearTimeout(timeout);
      if (responseSent) return;
      try {
        console.log(`[Emotion] Python script exited with code ${code}`);
        console.log(`[Emotion] Python output: ${out.substring(0, 500)}`);
        
        // Parse last JSON line (in case script printed warnings before final JSON)
        const lines = out.trim().split(/\r?\n/).filter(Boolean);
        const last = lines.pop();
        if (!last) {
          console.error(`[Emotion] No output from python script. Code: ${code}, Output: ${out}`);
          // Still store a fallback result
          const fallbackResult = {
            predicted: "neutral",
            confidence: 0.0,
            probabilities: {},
            sessionId,
            t: Date.now(),
            error: "No output from Python script",
            pythonCode: code
          };
          addEmotion(sessionId, fallbackResult);
          return res.status(500).json({ error: "no output from python script", raw: out.substring(0, 200), stored: fallbackResult });
        }
        
        const result = JSON.parse(last);
        console.log(`[Emotion] Parsed result:`, result);
        
        // Add sessionId and timestamp
        const enrichedResult = {
          ...result,
          sessionId,
          t: Date.now(),
        };
        
        // Store in session
        addEmotion(sessionId, enrichedResult);
        console.log(`[Emotion] ✅ Stored emotion result for session ${sessionId}:`, enrichedResult);
        
        responseSent = true;
        return res.json(enrichedResult);
      } catch (e) {
        if (responseSent) return;
        console.error("[Emotion] Error parsing python output:", e);
        // Store fallback on parse error
        const fallbackResult = {
          predicted: "neutral",
          confidence: 0.0,
          probabilities: {},
          sessionId,
          t: Date.now(),
          error: "Parse error: " + String(e)
        };
        addEmotion(sessionId, fallbackResult);
        responseSent = true;
        return res.status(500).json({ error: "invalid python output", raw: out.substring(0, 200), parseError: String(e), stored: fallbackResult });
      }
    });

    py.on("error", (err) => {
      clearTimeout(timeout);
      if (responseSent) return;
      console.error("Python spawn error:", err);
      responseSent = true;
      const errorResult = {
        predicted: "neutral",
        confidence: 0.0,
        probabilities: {},
        sessionId,
        t: Date.now(),
        error: "Spawn error: " + String(err)
      };
      addEmotion(sessionId, errorResult);
      return res.status(500).json({ error: "failed to spawn python process", details: String(err), stored: errorResult });
    });
    
    // Handle client disconnect
    req.on("close", () => {
      if (!responseSent) {
        clearTimeout(timeout);
        py.kill('SIGTERM');
        console.log(`[Emotion] Client disconnected for session ${sessionId}`);
      }
    });
  } catch (err) {
    console.error("Route error:", err);
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
