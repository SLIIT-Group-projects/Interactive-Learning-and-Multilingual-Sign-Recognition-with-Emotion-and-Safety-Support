import { Router } from "express";
import { spawn } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// points to: backend/models/hand_intensity.py
const PY_SCRIPT = join(__dirname, "../../models/hand_intensity.py");

router.get("/run", (req, res) => {
  const py = spawn("python", [PY_SCRIPT]);

  let out = "";
  let err = "";

  py.stdout.on("data", (d) => (out += d.toString()));
  py.stderr.on("data", (d) => (err += d.toString()));

  py.on("close", (code) => {
    if (code !== 0) return res.status(500).json({ error: err || "Python error" });
    res.json({ output: out });
  });
});

export default router;
