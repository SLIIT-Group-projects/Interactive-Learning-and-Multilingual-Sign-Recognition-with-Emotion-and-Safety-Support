import express from "express";
import multer from "multer";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// upload to backend/uploads
const uploadDir = join(__dirname, "../../uploads");
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// POST /api/emotion/predict  (multipart/form-data: file=<image>)
router.post("/predict", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const imgPath = req.file.path;

    // IMPORTANT: use your venv python if needed
    // If you want system python, keep "python"
    const py = spawn("python", ["models/emotion_predict.py", imgPath], {
      cwd: join(__dirname, "../../"),
    });

    let out = "";
    let err = "";

    py.stdout.on("data", (d) => (out += d.toString()));
    py.stderr.on("data", (d) => (err += d.toString()));

    py.on("close", (code) => {
      if (code !== 0) {
        return res.status(500).json({ error: err || "Python failed" });
      }
      try {
        return res.json(JSON.parse(out));
      } catch {
        return res.status(500).json({ error: "Invalid python output", raw: out });
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
