import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { ehAddHand } from "../utils/eh_sessionStore.js";

const router = express.Router();
const upload = multer({ dest: "uploads/hand_sessions/" });

router.post("/analyze", upload.array("frames", 200), (req, res) => {
  const { sessionId, fps = 10 } = req.body;
  const framesDir = req.files[0].destination;

  const py = spawn("python", [
    "models/hand_speed_analyze.py",
    "--frames_dir", framesDir,
    "--fps", String(fps)
  ]);

  let out = "";
  py.stdout.on("data", d => out += d.toString());

  py.on("close", () => {
    const result = JSON.parse(out);
    ehAddHand(sessionId, result);
    res.json(result);
  });
});

export default router;
