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
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { sessionId } = req.body;
    if (!sessionId) {
      return cb(new Error("sessionId required in body"));
    }
    const sessionDir = join(config.UPLOAD_DIR, "hand", sessionId);
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

const upload = multer({ storage, limits: { files: 200 } });

router.post("/analyze", upload.array("frames", 200), (req, res) => {
  try {
    const { sessionId, fps = 10 } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId required" });
    }
    
    const files = req.files || [];
    if (!files.length) {
      console.warn(`[Hand] No frames received for session ${sessionId}`);
      // Store a zero sample even when no frames received
      const emptyResult = {
        hand_speed: 0.0,
        intensity: "IDLE",
        level: 0,
        frames_used: 0,
        valid_steps: 0,
        fps: parseFloat(fps) || 10,
        note: "No frames received",
        sessionId,
        t: Date.now(),
      };
      addHand(sessionId, emptyResult);
      return res.status(400).json({ error: "frames required (field name 'frames')", stored: emptyResult });
    }
    
    console.log(`[Hand] Processing ${files.length} frames for session ${sessionId}, fps=${fps}`);

    // All frames are in the same session directory
    const framesDir = files[0].destination;
    const scriptPath = join(__dirname, "..", "..", "models", "hand_speed_analyze.py");

    const py = spawn(config.PYTHON_CMD, [
      scriptPath,
      "--frames_dir",
      framesDir,
      "--fps",
      String(fps),
    ]);

    let out = "";
    py.stdout.on("data", (d) => (out += d.toString()));
    py.stderr.on("data", (d) => (out += d.toString()));

    py.on("close", (code) => {
      try {
        const lines = out.trim().split(/\r?\n/).filter(Boolean);
        const last = lines.pop();
        
        let result;
        if (!last || code !== 0) {
          // If script failed or no output, create a fallback result
          console.warn(`Hand analysis script exited with code ${code}, output: ${out.substring(0, 200)}`);
          result = {
            hand_speed: 0.0,
            intensity: "IDLE",
            level: 0,
            frames_used: files.length,
            valid_steps: 0,
            fps: parseFloat(fps) || 10,
            note: code !== 0 ? `Script failed with exit code ${code}` : "No output from script",
            error: code !== 0 ? `Exit code ${code}` : "No output"
          };
        } else {
          result = JSON.parse(last);
          // Ensure required fields exist
          if (typeof result.hand_speed === 'undefined') result.hand_speed = 0.0;
          if (!result.intensity) result.intensity = "IDLE";
          if (typeof result.level === 'undefined') result.level = 0;
          if (typeof result.frames_used === 'undefined') result.frames_used = files.length;
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
        
        return res.json(enrichedResult);
      } catch (e) {
        console.error("Error parsing python output:", e);
        // Create fallback result and store it
        const fallbackResult = {
          hand_speed: 0.0,
          intensity: "IDLE",
          level: 0,
          frames_used: files.length,
          valid_steps: 0,
          fps: parseFloat(fps) || 10,
          note: "Failed to parse script output",
          error: String(e),
          sessionId,
          t: Date.now(),
        };
        addHand(sessionId, fallbackResult);
        console.log(`[Hand] Stored fallback sample for session ${sessionId} due to parse error`);
        // Still return error status but with the stored fallback data
        return res.status(500).json({ 
          error: "invalid python output", 
          raw: out.substring(0, 500), 
          parseError: String(e),
          stored: fallbackResult
        });
      }
    });

    py.on("error", (err) => {
      console.error("Python spawn error:", err);
      // Store a fallback result even when spawn fails
      const errorResult = {
        hand_speed: 0.0,
        intensity: "IDLE",
        level: 0,
        frames_used: files.length,
        valid_steps: 0,
        fps: parseFloat(fps) || 10,
        note: "Failed to spawn Python process",
        error: String(err),
        sessionId,
        t: Date.now(),
      };
      addHand(sessionId, errorResult);
      console.log(`[Hand] Stored error sample for session ${sessionId} due to spawn failure`);
      return res.status(500).json({ 
        error: "failed to spawn python process", 
        details: String(err),
        stored: errorResult
      });
    });
  } catch (err) {
    console.error("Route error:", err);
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
