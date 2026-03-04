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

const upload = multer({ storage, limits: { files: 200, fileSize: 100 * 1024 * 1024 } }); // 100MB max for video

// Process video file for hand speed analysis
function processVideo(req, res, videoFile, sessionId) {
  let responseSent = false;
  let finalVideoPath = null;
  
  try {
    const sessionDir = join(config.UPLOAD_DIR, "hand", sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    
    // Ensure video file exists and is readable
    if (!videoFile || !videoFile.path) {
      throw new Error("Video file path is missing");
    }
    
    if (!fs.existsSync(videoFile.path)) {
      throw new Error(`Video file not found at: ${videoFile.path}`);
    }
    
    finalVideoPath = join(sessionDir, videoFile.filename);
    console.log(`[Hand] Moving video from ${videoFile.path} to ${finalVideoPath}`);
    fs.renameSync(videoFile.path, finalVideoPath);
    
    if (!fs.existsSync(finalVideoPath)) {
      throw new Error(`Failed to move video file to: ${finalVideoPath}`);
    }
    
    console.log(`[Hand] Video file saved: ${finalVideoPath}, size: ${fs.statSync(finalVideoPath).size} bytes`);
  
    const framesExtractDir = join(sessionDir, "frames_extract");
    if (!fs.existsSync(framesExtractDir)) {
      fs.mkdirSync(framesExtractDir, { recursive: true });
    }
    
    const scriptPath = join(__dirname, "..", "..", "models", "hand_speed_from_video.py");
    
    const py = spawn(config.PYTHON_CMD, [
      scriptPath,
      "--video_path",
      finalVideoPath,
      "--output_dir",
      framesExtractDir,
      "--max_frames",
      "30"
    ]);
    
    let out = "";
    const timeout = setTimeout(() => {
      if (!responseSent) {
        responseSent = true;
        py.kill('SIGTERM');
        console.error(`[Hand] Video processing timeout for session ${sessionId}`);
        const timeoutResult = {
          hand_speed: 0.0,
          intensity: "IDLE",
          level: 0,
          frames_used: 0,
          valid_steps: 0,
          fps: 30.0,
          note: "Video processing timeout (60s)",
          error: "Timeout",
          sessionId,
          t: Date.now(),
        };
        addHand(sessionId, timeoutResult);
        return res.status(504).json({ 
          error: "Video processing timeout", 
          stored: timeoutResult 
        });
      }
    }, 60000);
    
    py.stdout.on("data", (d) => (out += d.toString()));
    py.stderr.on("data", (d) => (out += d.toString()));
    
    py.on("close", (code) => {
    clearTimeout(timeout);
    if (responseSent) return;
    
    // Clean up video file after processing
    try {
      fs.unlinkSync(finalVideoPath);
    } catch (e) {
      console.warn(`[Hand] Could not delete video file: ${e}`);
    }
    
    try {
      const lines = out.trim().split(/\r?\n/).filter(Boolean);
      const last = lines.pop();
      
      let result;
      if (!last || code !== 0) {
        console.warn(`[Hand] Video processing exited with code ${code}, output: ${out.substring(0, 200)}`);
        result = {
          hand_speed: 0.0,
          intensity: "IDLE",
          level: 0,
          frames_used: 0,
          valid_steps: 0,
          fps: 30.0,
          note: code !== 0 ? `Video processing failed with exit code ${code}` : "No output from script",
          error: code !== 0 ? `Exit code ${code}` : "No output"
        };
      } else {
        result = JSON.parse(last);
        if (typeof result.hand_speed === 'undefined') result.hand_speed = 0.0;
        if (!result.intensity) result.intensity = "IDLE";
        if (typeof result.level === 'undefined') result.level = 0;
      }
      
      const enrichedResult = {
        ...result,
        sessionId,
        t: Date.now(),
      };
      
      addHand(sessionId, enrichedResult);
      console.log(`[Hand] Stored video analysis for session ${sessionId}: speed=${enrichedResult.hand_speed}, intensity=${enrichedResult.intensity}`);
      
      responseSent = true;
      return res.json(enrichedResult);
    } catch (e) {
      if (responseSent) return;
      console.error("Error parsing video processing output:", e);
      const fallbackResult = {
        hand_speed: 0.0,
        intensity: "IDLE",
        level: 0,
        frames_used: 0,
        valid_steps: 0,
        fps: 30.0,
        note: "Failed to parse video processing output",
        error: String(e),
        sessionId,
        t: Date.now(),
      };
      addHand(sessionId, fallbackResult);
      responseSent = true;
      return res.status(500).json({ 
        error: "invalid video processing output", 
        raw: out.substring(0, 500), 
        parseError: String(e),
        stored: fallbackResult
      });
    }
  });
  
    py.on("error", (err) => {
      clearTimeout(timeout);
      if (responseSent) return;
      console.error("Video processing spawn error:", err);
      console.error("Python command:", config.PYTHON_CMD);
      console.error("Script path:", scriptPath);
      console.error("Video path:", finalVideoPath);
      const errorResult = {
        hand_speed: 0.0,
        intensity: "IDLE",
        level: 0,
        frames_used: 0,
        valid_steps: 0,
        fps: 30.0,
        note: "Failed to spawn video processing process",
        error: String(err),
        sessionId,
        t: Date.now(),
      };
      addHand(sessionId, errorResult);
      responseSent = true;
      return res.status(500).json({ 
        error: "failed to spawn video processing", 
        details: String(err),
        stored: errorResult
      });
    });
    
    req.on("close", () => {
      if (!responseSent) {
        clearTimeout(timeout);
        py.kill('SIGTERM');
        console.log(`[Hand] Client disconnected during video processing for session ${sessionId}`);
      }
    });
    
  } catch (err) {
    console.error(`[Hand] Error in processVideo setup:`, err);
    const errorResult = {
      hand_speed: 0.0,
      intensity: "IDLE",
      level: 0,
      frames_used: 0,
      valid_steps: 0,
      fps: 30.0,
      note: `Video processing setup error: ${err.message}`,
      error: String(err),
      sessionId,
      t: Date.now(),
    };
    addHand(sessionId, errorResult);
    if (!responseSent) {
      responseSent = true;
      return res.status(500).json({ 
        error: "Video processing setup failed", 
        details: String(err),
        stored: errorResult
      });
    }
  }
  
  req.on("close", () => {
    if (!responseSent) {
      clearTimeout(timeout);
      py.kill('SIGTERM');
      console.log(`[Hand] Client disconnected during video processing for session ${sessionId}`);
    }
  });
}

// Support both video and frames
router.post("/analyze", upload.fields([
  { name: "frames", maxCount: 200 },
  { name: "video", maxCount: 1 }
]), (req, res) => {
  try {
    console.log(`[Hand] Received request - Body:`, req.body);
    console.log(`[Hand] Received files:`, req.files);
    console.log(`[Hand] Files structure:`, {
      hasFiles: !!req.files,
      videoFiles: req.files?.video?.length || 0,
      frameFiles: req.files?.frames?.length || 0,
      allKeys: req.files ? Object.keys(req.files) : []
    });
    
    const { sessionId, fps = 10 } = req.body;
    if (!sessionId) {
      console.error("[Hand] Missing sessionId in request");
      // Clean up temp files if they exist
      if (req.files) {
        Object.values(req.files).flat().forEach(file => {
          if (file && file.path) {
            fs.unlink(file.path, () => {});
          }
        });
      }
      return res.status(400).json({ error: "sessionId required" });
    }
    
    const videoFile = req.files?.video?.[0];
    const frameFiles = req.files?.frames || [];
    
    // Prefer video if available, otherwise use frames
    if (videoFile) {
      console.log(`[Hand] Processing video file: ${videoFile.filename} for session ${sessionId}`);
      console.log(`[Hand] Video file details:`, {
        filename: videoFile.filename,
        path: videoFile.path,
        size: videoFile.size,
        mimetype: videoFile.mimetype,
        originalname: videoFile.originalname
      });
      try {
        return processVideo(req, res, videoFile, sessionId);
      } catch (err) {
        console.error(`[Hand] Error in processVideo:`, err);
        console.error(`[Hand] Error stack:`, err.stack);
        const errorResult = {
          hand_speed: 0.0,
          intensity: "IDLE",
          level: 0,
          frames_used: 0,
          valid_steps: 0,
          fps: 30.0,
          note: `Video processing error: ${err.message}`,
          error: String(err),
          sessionId,
          t: Date.now(),
        };
        addHand(sessionId, errorResult);
        return res.status(500).json({ 
          error: "Video processing failed", 
          details: String(err),
          stored: errorResult
        });
      }
    }
    
    if (!frameFiles.length) {
      console.warn(`[Hand] No video or frames received for session ${sessionId}`);
      const emptyResult = {
        hand_speed: 0.0,
        intensity: "IDLE",
        level: 0,
        frames_used: 0,
        valid_steps: 0,
        fps: parseFloat(fps) || 10,
        note: "No video or frames received",
        sessionId,
        t: Date.now(),
      };
      addHand(sessionId, emptyResult);
      return res.status(400).json({ error: "video or frames required", stored: emptyResult });
    }
    
    // Process frames (legacy method)
    const sessionDir = join(config.UPLOAD_DIR, "hand", sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    
    const movedFiles = frameFiles.map(file => {
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

    const framesDir = sessionDir;
    const scriptPath = join(__dirname, "..", "..", "models", "hand_speed_analyze.py");

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
          intensity: "IDLE",
          level: 0,
          frames_used: movedFiles.length,
          valid_steps: 0,
          fps: parseFloat(fps) || 10,
          note: "Python script timeout (60s)",
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
      // Log stderr messages (debug info from Python)
      if (data.includes("[Hand Speed]")) {
        console.log(`[Hand] Python: ${data.trim()}`);
      }
    });
    py.stderr.on("data", (d) => {
      const data = d.toString();
      out += data;
      // Log all stderr output for debugging
      console.log(`[Hand] Python stderr: ${data.trim()}`);
    });

    py.on("close", (code) => {
      clearTimeout(timeout);
      if (responseSent) return;
      try {
        const lines = out.trim().split(/\r?\n/).filter(Boolean);
        const last = lines.pop();
        
        // Log full output for debugging
        console.log(`[Hand] Python script output (last 500 chars): ${out.substring(Math.max(0, out.length - 500))}`);
        console.log(`[Hand] Python exit code: ${code}, lines: ${lines.length}`);
        
        let result;
        if (!last || code !== 0) {
          // If script failed or no output, create a fallback result
          console.warn(`[Hand] Script exited with code ${code}, full output: ${out.substring(0, 1000)}`);
          result = {
            hand_speed: 0.0,
            intensity: "IDLE",
            level: 0,
            frames_used: movedFiles.length,
            valid_steps: 0,
            fps: parseFloat(fps) || 10,
            note: code !== 0 ? `Script failed with exit code ${code}` : "No output from script",
            error: code !== 0 ? `Exit code ${code}` : "No output",
            raw_output: out.substring(0, 500)  // Include raw output for debugging
          };
        } else {
          try {
            result = JSON.parse(last);
            console.log(`[Hand] Parsed result:`, {
              hand_speed: result.hand_speed,
              intensity: result.intensity,
              valid_steps: result.valid_steps,
              hands_detected: result.hands_detected,
              detection_method: result.detection_method
            });
          } catch (parseErr) {
            console.error(`[Hand] Failed to parse JSON: ${last.substring(0, 200)}`, parseErr);
            result = {
              hand_speed: 0.0,
              intensity: "IDLE",
              level: 0,
              frames_used: movedFiles.length,
              valid_steps: 0,
              fps: parseFloat(fps) || 10,
              note: `JSON parse error: ${parseErr.message}`,
              error: "JSON parse failed",
              raw_output: last.substring(0, 500)
            };
          }
          // Ensure required fields exist
          if (typeof result.hand_speed === 'undefined') result.hand_speed = 0.0;
          if (!result.intensity) result.intensity = "IDLE";
          if (typeof result.level === 'undefined') result.level = 0;
          if (typeof result.frames_used === 'undefined') result.frames_used = movedFiles.length;
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
        
        responseSent = true;
        return res.json(enrichedResult);
      } catch (e) {
        if (responseSent) return;
        console.error("Error parsing python output:", e);
        // Create fallback result and store it
        const fallbackResult = {
          hand_speed: 0.0,
          intensity: "IDLE",
          level: 0,
          frames_used: movedFiles.length,
          valid_steps: 0,
          fps: parseFloat(fps) || 10,
          note: "Failed to parse script output",
          error: String(e),
          sessionId,
          t: Date.now(),
        };
        addHand(sessionId, fallbackResult);
        console.log(`[Hand] Stored fallback sample for session ${sessionId} due to parse error`);
        responseSent = true;
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
      clearTimeout(timeout);
      if (responseSent) return;
      console.error("Python spawn error:", err);
      // Store a fallback result even when spawn fails
      const errorResult = {
        hand_speed: 0.0,
        intensity: "IDLE",
        level: 0,
        frames_used: movedFiles.length,
        valid_steps: 0,
        fps: parseFloat(fps) || 10,
        note: "Failed to spawn Python process",
        error: String(err),
        sessionId,
        t: Date.now(),
      };
      addHand(sessionId, errorResult);
      console.log(`[Hand] Stored error sample for session ${sessionId} due to spawn failure`);
      responseSent = true;
      return res.status(500).json({ 
        error: "failed to spawn python process", 
        details: String(err),
        stored: errorResult
      });
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
    console.error("Route error stack:", err.stack);
    console.error("Request details:", {
      body: req.body,
      files: req.files,
      hasFiles: !!req.files
    });
    
    // Clean up any uploaded files
    if (req.files) {
      Object.values(req.files).flat().forEach(file => {
        if (file && file.path) {
          try {
            fs.unlink(file.path, () => {});
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      });
    }
    
    const errorResult = {
      hand_speed: 0.0,
      intensity: "IDLE",
      level: 0,
      frames_used: 0,
      valid_steps: 0,
      fps: 10.0,
      note: `Route error: ${err.message}`,
      error: String(err),
      sessionId: req.body?.sessionId || 'unknown',
      t: Date.now(),
    };
    
    if (req.body?.sessionId) {
      addHand(req.body.sessionId, errorResult);
    }
    
    return res.status(500).json({ 
      error: "Internal server error", 
      details: String(err),
      stored: errorResult
    });
  }
});

export default router;
