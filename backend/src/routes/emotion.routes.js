import express from "express";
import multer from "multer";
import path from "path";
import { spawn } from "child_process";
import { ehAddEmotion } from "../utils/eh_sessionStore.js";

const router = express.Router();
const upload = multer({ dest: "uploads/emotion/" });

router.post("/predict", upload.single("image"), (req, res) => {
  const { sessionId } = req.body;
  const imgPath = req.file.path;

  const py = spawn("python", ["models/emotion_predict.py", imgPath]);

  let out = "";
  py.stdout.on("data", d => out += d.toString());

  py.on("close", () => {
    const result = JSON.parse(out);
    ehAddEmotion(sessionId, result);
    res.json(result);
  });
});

export default router;
