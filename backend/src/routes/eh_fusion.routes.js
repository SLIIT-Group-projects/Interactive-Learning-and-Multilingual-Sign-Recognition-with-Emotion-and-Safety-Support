import express from "express";
import { ehGetSession, ehEndSession } from "../utils/eh_sessionStore.js";

const router = express.Router();

router.post("/finalize", (req, res) => {
  const { sessionId } = req.body;
  const session = ehGetSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  // Simple fusion logic (can improve later)
  const happyCount = session.emotions.filter(e => e.predicted === "happy").length;
  const avgHand = session.hand.reduce((s,h)=>s+h.level,0)/(session.hand.length||1);

  let engagement = "LOW";
  if (happyCount > 3 && avgHand >= 1) engagement = "HIGH";
  else if (happyCount > 1) engagement = "MEDIUM";

  const output = {
    engagement,
    emotionSamples: session.emotions.length,
    handSamples: session.hand.length
  };

  ehEndSession(sessionId);
  res.json(output);
});

export default router;
