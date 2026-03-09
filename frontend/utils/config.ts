/**
 * API Configuration
 * Set your backend URL here
 */

import { Platform } from "react-native";

// ============================================
// CONFIGURATION: Update this for your setup
// ============================================
// Set to true if testing on a PHYSICAL DEVICE (not emulator/simulator)
const USE_PHYSICAL_DEVICE = true; // Set to true for Expo Go on physical device

// Your computer's IP address (for physical device testing)
// Find it with: Windows: ipconfig | Mac/Linux: ifconfig
const COMPUTER_IP = "192.168.1.6"; // Your current machine IP

// Backend server port
const BACKEND_PORT = 3000;

// ============================================

const getApiBaseUrl = () => {
  if (__DEV__) {
    // If using physical device, use computer's IP address
    if (USE_PHYSICAL_DEVICE) {
      return `http://${COMPUTER_IP}:${BACKEND_PORT}`;
    }

    // For emulators/simulators - auto-detect platform
    if (Platform.OS === "android") {
      // Android emulator uses 10.0.2.2 to access host machine's localhost
      return `http://10.0.2.2:${BACKEND_PORT}`;
    } else if (Platform.OS === "ios") {
      // iOS simulator on Windows - try localhost first, then 127.0.0.1
      // If neither works, set USE_PHYSICAL_DEVICE=true and use your computer's IP
      return `http://localhost:${BACKEND_PORT}`;
    } else {
      // Web or other platforms
      return `http://localhost:${BACKEND_PORT}`;
    }
  }
  // Production mode - set your production API URL
  return "https://your-production-api.com";
};

export const API_CONFIG = {
  BASE_URL: getApiBaseUrl(),
  TIMEOUT: 30000, // 30 seconds
  ENDPOINTS: {
    HEALTH: "/health",
    AUDIO_PROCESS: "/api/audio/process",
    AUDIO_SPECTROGRAM: "/api/audio/spectrogram",
    AUDIO_PREPARE_MODEL: "/api/audio/prepare-model-input",
    HAZARD_DETECT: "/api/hazard/detect",
    HAZARD_DETECT_STREAM: "/api/hazard/detect-stream",
    HAZARD_SAFETY_CHECK: "/api/hazard/safety-check",
    HAZARD_PRIORITIES: "/api/hazard/priorities",
    PLACES: "/api/places",
    SOUNDS: "/api/sounds",
  },
} as const;

export default API_CONFIG;
