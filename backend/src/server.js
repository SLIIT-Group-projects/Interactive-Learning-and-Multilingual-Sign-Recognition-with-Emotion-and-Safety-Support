import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import audioRoutes from "./routes/audio.routes.js";
import hazardRoutes from "./routes/hazard.routes.js";
// emotion and hand routes
import emotionRoutes from "./routes/emotion.routes.js";
import handRoutes from "./routes/hand.routes.js";
import ehFusionRoutes from "./routes/eh_fusion.routes.js";
import config from "../config/index.js";
import soundRoutes from "./routes/sound.routes.js";
import placeRoutes from "./routes/location.routes.js";
import notificationRoutes from "./routes/notification.routes.js";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = config.PORT;

// Middleware
app.use(
  cors({
    origin: config.CORS_ORIGIN, // Allow all origins in development
    credentials: true,
  }),
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

app.use("/api/sounds", soundRoutes);
app.use("/api/places", placeRoutes);
app.use("/api/notifications", notificationRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "Hazard Sound Detection API",
  });
});

// Test endpoint for debugging
app.get("/test", (req, res) => {
  res.json({
    message: "Backend is working!",
    timestamp: new Date().toISOString(),
    routes: {
      emotion: "/api/emotion/predict",
      hand: "/api/hand/analyze",
      startSession: "/api/eh/start",
      finalizeSession: "/api/eh/finalize",
    },
  });
});

// Request logging middleware (for debugging)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(`[Error] ${req.method} ${req.path}:`, err);
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
app
  .listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/health`);
    console.log(`🧪 Test endpoint: http://localhost:${PORT}/test`);
    console.log(
      `🌐 Network access (Android emulator): http://10.0.2.2:${PORT}/health`,
    );
    console.log(
      `🌐 Network access example: http://192.168.1.6:${PORT}/health`,
    );
    console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`📁 Upload directory: ${config.UPLOAD_DIR}`);
    console.log(`🐍 Python command: ${config.PYTHON_CMD}`);
    console.log(`\n✅ Backend is ready to accept connections!\n`);
  })
  .on("error", (err) => {
    console.error(`❌ Failed to start server:`, err);
    if (err.code === "EADDRINUSE") {
      console.error(
        `   Port ${PORT} is already in use. Please stop the other process or change the port.`,
      );
    }
    process.exit(1);
  });

export default app;
