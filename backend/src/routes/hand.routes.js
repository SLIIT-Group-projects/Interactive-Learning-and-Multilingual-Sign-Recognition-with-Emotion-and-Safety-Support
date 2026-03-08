import express from "express";
import multer from "multer";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
import { addHand } from "../utils/eh_sessionStore.js";
import config from "../../config/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Configure multer to save files in session-specific folders
// Note: req.body might not be fully populated in destination callback,
// so we use a temporary directory and move files in the route handler
const tempDir = join(config.UPLOAD_DIR, "hand", "_temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Use temp directory first - we'll move the files in the route handler
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage, limits: { files: 200 } });

router.post("/analyze", upload.array("frames", 200), (req, res) => {
  try {
    console.log(`[Hand] Received request - Body:`, req.body);
    console.log(`[Hand] Received files:`, req.files ? `${req.files.length} files` : "NO FILES");
    
    const { sessionId, fps = 10 } = req.body;
    if (!sessionId) {
      console.error("[Hand] Missing sessionId in request");
      // Clean up temp files if they exist
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          fs.unlink(file.path, () => {});
        });
      }
      return res.status(400).json({ error: "sessionId required" });
    }
    
    const files = req.files || [];
    if (!files.length) {
      console.warn(`[Hand] No frames received for session ${sessionId}`);
      // Store a zero sample even when no frames received
      const emptyResult = {
        hand_speed: 0.0,
        intensity: "LOW",
        level: 1,
        frames_used: 0,
        valid_steps: 0,
        fps: parseFloat(fps) || 10,
        hands_detected: false,
        message: "No frames received",
        sessionId,
        t: Date.now(),
      };
      addHand(sessionId, emptyResult);
      return res.status(400).json({ error: "frames required (field name 'frames')", stored: emptyResult });
    }
    
    // Move files from temp directory to session-specific directory
    const sessionDir = join(config.UPLOAD_DIR, "hand", sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    
    const movedFiles = files.map(file => {
      const finalPath = join(sessionDir, file.filename);
      fs.renameSync(file.path, finalPath);
      return {
        ...file,
        path: finalPath,
        destination: sessionDir
      };
    });
    
    console.log(`[Hand] Moved ${movedFiles.length} files to session directory: ${sessionDir}`);
    console.log(`[Hand] Processing ${movedFiles.length} frames for session ${sessionId}, fps=${fps}`);
    
    // Verify files exist
    const existingFiles = fs.readdirSync(sessionDir);
    console.log(`[Hand] Files in directory: ${existingFiles.length} files found`);
    if (existingFiles.length > 0) {
      console.log(`[Hand] Sample files: ${existingFiles.slice(0, 3).join(', ')}`);
    }

    // All frames are now in the same session directory
    const framesDir = sessionDir;
    const scriptPath = join(__dirname, "..", "..", "models", "hand_speed_analyze.py");
    
    console.log(`[Hand] Calling Python script: ${config.PYTHON_CMD} ${scriptPath} --frames_dir ${framesDir} --fps ${fps}`);

    const py = spawn(config.PYTHON_CMD, [
      scriptPath,
      "--frames_dir",
      framesDir,
      "--fps",
      String(fps),
    ]);

    let out = "";
    let responseSent = false;
    
    // Set timeout for Python script (60 seconds for multiple frames)
    const timeout = setTimeout(() => {
      if (!responseSent) {
        responseSent = true;
        py.kill('SIGTERM');
        console.error(`[Hand] Python script timeout for session ${sessionId}`);
        const timeoutResult = {
          hand_speed: 0.0,
          intensity: "LOW",
          level: 1,
          frames_used: movedFiles.length,
          valid_steps: 0,
          fps: parseFloat(fps) || 10,
          hands_detected: false,
          message: "Python script timeout (60s)",
          error: "Timeout",
          sessionId,
          t: Date.now(),
        };
        addHand(sessionId, timeoutResult);
        return res.status(504).json({ 
          error: "Python script timeout", 
          stored: timeoutResult 
        });
      }
    }, 60000);

    py.stdout.on("data", (d) => {
      const data = d.toString();
      out += data;
      // Log debug output to console
      if (data.includes("[DEBUG]")) {
        console.log(`[Hand Script Debug] ${data.trim()}`);
      }
    });
    py.stderr.on("data", (d) => {
      const data = d.toString();
      out += data;
      // Log stderr to console for debugging
      if (data.includes("[DEBUG]") || data.trim().length > 0) {
        console.log(`[Hand Script] ${data.trim()}`);
      }
    });

    py.on("close", (code) => {
      clearTimeout(timeout);
      if (responseSent) return;
      try {
        const lines = out.trim().split(/\r?\n/).filter(Boolean);
        // Find the last line that looks like JSON (starts with {)
        let last = null;
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (line.startsWith('{') && line.endsWith('}')) {
            last = line;
            break;
          }
        }
        
        let result;
        if (!last) {
          // No JSON output found
          console.warn(`[Hand] No JSON output from script. Code: ${code}, Output: ${out.substring(0, 500)}`);
          result = {
            hand_speed: 0.0,
            intensity: "LOW",
            level: 1,
            frames_used: movedFiles.length,
            valid_steps: 0,
            fps: parseFloat(fps) || 10,
            hands_detected: false,
            message: "No output from script",
            error: "No JSON output"
          };
        } else {
          try {
            result = JSON.parse(last);
            // Ensure required fields exist
            if (typeof result.hand_speed === 'undefined') result.hand_speed = 0.0;
            if (!result.intensity) result.intensity = "LOW";
            if (typeof result.level === 'undefined') result.level = 1;
            if (typeof result.frames_used === 'undefined') result.frames_used = movedFiles.length;
            // Ensure hands_detected field exists
            if (typeof result.hands_detected === 'undefined') {
              result.hands_detected = result.hand_speed > 0 || result.valid_steps > 0;
            }
            // Log the result for debugging
            console.log(`[Hand] Script result: speed=${result.hand_speed}, hands_detected=${result.hands_detected}, frames_with_hands=${result.frames_with_hands || 0}`);
          } catch (parseErr) {
            console.error(`[Hand] Failed to parse JSON: ${parseErr.message}, Last line: ${last.substring(0, 200)}`);
            result = {
              hand_speed: 0.0,
              intensity: "LOW",
              level: 1,
              frames_used: movedFiles.length,
              valid_steps: 0,
              fps: parseFloat(fps) || 10,
              hands_detected: false,
              message: "Failed to parse script output",
              error: parseErr.message
            };
          }
        }
        
        // Add sessionId and timestamp
        const enrichedResult = {
          ...result,
          sessionId,
          t: Date.now(),
        };
        
        // Always store in session, even if script failed
        addHand(sessionId, enrichedResult);
        console.log(`[Hand] Stored sample for session ${sessionId}: speed=${enrichedResult.hand_speed}, intensity=${enrichedResult.intensity}, frames=${enrichedResult.frames_used}`);
        
        // CRITICAL: Return 200 even if Python script failed (exit code !== 0)
        // The stored data is valid and should be used by frontend
        // This prevents frontend from seeing errors when Python crashes
        responseSent = true;
        if (code !== 0) {
          console.warn(`[Hand] ⚠️ Python script exited with code ${code} but returning stored data (200 OK)`);
        }
        return res.status(200).json(enrichedResult);
      } catch (e) {
        if (responseSent) return;
        console.error("Error parsing python output:", e);
        // Create fallback result and store it
        const fallbackResult = {
          hand_speed: 0.0,
          intensity: "LOW",
          level: 1,
          frames_used: movedFiles.length,
          valid_steps: 0,
          fps: parseFloat(fps) || 10,
          hands_detected: false,
          message: "Failed to parse script output",
          error: String(e),
          sessionId,
          t: Date.now(),
        };
        addHand(sessionId, fallbackResult);
        console.log(`[Hand] Stored fallback sample for session ${sessionId} due to parse error`);
        responseSent = true;
        // Return 200 with stored fallback data - frontend should use this
        // This prevents errors from breaking the session
        console.warn(`[Hand] ⚠️ Parse error but returning stored fallback data (200 OK)`);
        return res.status(200).json(fallbackResult);
      }
    });

    py.on("error", (err) => {
      clearTimeout(timeout);
      if (responseSent) return;
      console.error("Python spawn error:", err);
      // Store a fallback result even when spawn fails
      const errorResult = {
        hand_speed: 0.0,
        intensity: "LOW",
        level: 1,
        frames_used: movedFiles.length,
        valid_steps: 0,
        fps: parseFloat(fps) || 10,
        hands_detected: false,
        message: "Failed to spawn Python process",
        error: String(err),
        sessionId,
        t: Date.now(),
      };
      addHand(sessionId, errorResult);
      console.log(`[Hand] Stored error sample for session ${sessionId} due to spawn failure`);
      responseSent = true;
      // Return 200 with stored fallback data - frontend should use this
      // This prevents errors from breaking the session
      console.warn(`[Hand] ⚠️ Spawn error but returning stored fallback data (200 OK)`);
      return res.status(200).json(errorResult);
    });
    
    // Handle client disconnect
    req.on("close", () => {
      if (!responseSent) {
        clearTimeout(timeout);
        py.kill('SIGTERM');
        console.log(`[Hand] Client disconnected for session ${sessionId}`);
      }
    });
  } catch (err) {
    console.error("Route error:", err);
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
