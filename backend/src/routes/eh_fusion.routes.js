import express from "express";
import { startSession, getSession, finalize } from "../utils/eh_sessionStore.js";
import { computeFusion } from "../utils/eh_fusion_model.js";

const router = express.Router();

/**
 * POST /api/eh/start
 * Start a new reading session
 */
router.post("/start", (req, res) => {
  try {
    console.log("[EH/Start] Received request:", req.body);
    const { sessionId } = req.body;
    
    if (!sessionId) {
      console.error("[EH/Start] Missing sessionId in request");
      return res.status(400).json({ error: "sessionId required" });
    }

    console.log(`[EH/Start] Starting session: ${sessionId}`);
    startSession(sessionId);
    
    const response = {
      success: true,
      sessionId,
      message: "Session started",
    };
    
    console.log(`[EH/Start] Session ${sessionId} started successfully`);
    res.json(response);
  } catch (err) {
    console.error("[EH/Start] Error starting session:", err);
    res.status(500).json({ error: String(err), stack: err.stack });
  }
});

/**
 * POST /api/eh/finalize
 * Finalize a session and get fused results
 */
router.post("/finalize", (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId required" });
    }

    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Compute fusion result
    const fusionResult = computeFusion(session);

    // Save final result in session
    finalize(sessionId, fusionResult);

    // Return enriched response
    const output = {
      sessionId,
      ...fusionResult,
      startedAt: session.startedAt,
      duration: Date.now() - session.startedAt,
    };

    res.json(output);
  } catch (err) {
    console.error("Finalize session error:", err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
