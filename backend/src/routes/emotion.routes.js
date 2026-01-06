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
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { sessionId } = req.body;
    if (!sessionId) {
      return cb(new Error("sessionId required in body"));
    }
    const sessionDir = join(config.UPLOAD_DIR, "emotion", sessionId);
    // Ensure directory exists
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    cb(null, sessionDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

router.post("/predict", upload.single("file"), (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId required" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "file required (field name 'file')" });
    }

    const imgPath = req.file.path;
    const scriptPath = join(__dirname, "..", "..", "models", "eh_emotion_predict.py");
    
    const py = spawn(config.PYTHON_CMD, [scriptPath, imgPath]);

    let out = "";
    py.stdout.on("data", (d) => (out += d.toString()));
    py.stderr.on("data", (d) => (out += d.toString()));

    py.on("close", (code) => {
      try {
        // Parse last JSON line (in case script printed warnings before final JSON)
        const lines = out.trim().split(/\r?\n/).filter(Boolean);
        const last = lines.pop();
        if (!last) {
          return res.status(500).json({ error: "no output from python script", raw: out });
        }
        
        const result = JSON.parse(last);
        
        // Add sessionId and timestamp
        const enrichedResult = {
          ...result,
          sessionId,
          t: Date.now(),
        };
        
        // Store in session
        addEmotion(sessionId, enrichedResult);
        
        return res.json(enrichedResult);
      } catch (e) {
        console.error("Error parsing python output:", e);
        return res.status(500).json({ error: "invalid python output", raw: out, parseError: String(e) });
      }
    });

    py.on("error", (err) => {
      console.error("Python spawn error:", err);
      return res.status(500).json({ error: "failed to spawn python process", details: String(err) });
    });
  } catch (err) {
    console.error("Route error:", err);
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
