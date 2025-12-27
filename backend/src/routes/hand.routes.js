import express from "express";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Correct Python file path
const PYTHON_SCRIPT = join(__dirname, "../../models/hand_intensity.py");

router.get("/run", (req, res) => {
  const python = spawn("python", [PYTHON_SCRIPT]);

  let data = "";
  let error = "";

  python.stdout.on("data", (chunk) => {
    data += chunk.toString();
  });

  python.stderr.on("data", (chunk) => {
    error += chunk.toString();
  });

  python.on("close", (code) => {
    if (code !== 0 || error) {
      return res.status(500).json({ error });
    }

    try {
      const parsed = JSON.parse(data);
      res.json(parsed);
    } catch (err) {
      res.status(500).json({
        error: "Invalid JSON from Python",
        raw: data,
      });
    }
  });
});

export default router;
