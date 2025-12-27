import { Router } from "express";
import { spawn } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// points to: backend/models/predict_emotion.py
const PY_SCRIPT = join(__dirname, "../../models/predict_emotion.py");

router.post("/predict", (req, res) => {
  const { imageBase64 } = req.body;
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });

  const py = spawn("python", [PY_SCRIPT], { stdio: ["pipe", "pipe", "pipe"] });

  let out = "";
  let err = "";

  py.stdout.on("data", (d) => (out += d.toString()));
  py.stderr.on("data", (d) => (err += d.toString()));

  py.on("close", (code) => {
    if (code !== 0) return res.status(500).json({ error: err || "Python error" });

    try {
      return res.json(JSON.parse(out));
    } catch {
      return res.status(500).json({ error: "Python returned invalid JSON", raw: out });
    }
  });

  py.stdin.write(JSON.stringify({ imageBase64 }));
  py.stdin.end();
});

export default router;
