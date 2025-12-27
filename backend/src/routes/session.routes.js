import { Router } from "express";

const router = Router();
const sessions = {}; // demo storage (later DB)

router.post("/start", (req, res) => {
  const { childId, storyId } = req.body;

  const sessionId = `${childId}_${storyId}_${Date.now()}`;
  sessions[sessionId] = {
    childId,
    storyId,
    startedAt: Date.now(),
    emotionPreds: [],
    handLevels: [],
  };

  res.json({ sessionId });
});

router.post("/end", (req, res) => {
  const { sessionId } = req.body;

  const session = sessions[sessionId];
  if (!session) return res.status(404).json({ error: "Invalid sessionId" });

  session.endedAt = Date.now();
  res.json({ message: "Session ended", session });
});

export default router;
