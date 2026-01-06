import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  PORT: process.env.PORT || 5000,
  UPLOAD_DIR: process.env.UPLOAD_DIR || join(__dirname, "..", "uploads"),
  PYTHON_CMD: process.env.PYTHON_CMD || "python",
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
  NODE_ENV: process.env.NODE_ENV || "development",
};
