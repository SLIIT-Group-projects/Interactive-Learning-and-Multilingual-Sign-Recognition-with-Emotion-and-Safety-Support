import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import audioRoutes from "./routes/audio.routes.js";
import hazardRoutes from "./routes/hazard.routes.js";
// emtion and routes
import emotionRoutes from "./routes/emotion.routes.js";
import handRoutes from "./routes/hand.routes.js";
import ehFusionRoutes from "./routes/eh_fusion.routes.js";


// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*", // Allow all origins in development
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/audio", audioRoutes);
app.use("/api/hazard", hazardRoutes);
// emotion and hand routes
app.use("/api/emotion", emotionRoutes);
app.use("/api/hand", handRoutes);
app.use("/api/eh", ehFusionRoutes);


// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "Hazard Sound Detection API",
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || "Internal server error",
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: "Endpoint not found",
      path: req.path,
    },
  });
});

// Start server - listen on all network interfaces (0.0.0.0) to allow access from physical devices
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Network access: http:// 192.168.1.7:${PORT}/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
});

export default app;
