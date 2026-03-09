/**
 * API Configuration
 * Set your backend URL here
 */

import { Platform } from "react-native";
import Constants from "expo-constants";

// ============================================
// CONFIGURATION: Update this for your setup
// ============================================
const ENV_API_URL = process.env.EXPO_PUBLIC_API_URL?.trim();
const ENV_USE_PHYSICAL_DEVICE = process.env.EXPO_PUBLIC_USE_PHYSICAL_DEVICE === "true";
const ENV_COMPUTER_IP = process.env.EXPO_PUBLIC_COMPUTER_IP?.trim();
const BACKEND_PORT = Number(process.env.EXPO_PUBLIC_BACKEND_PORT || "5000");
const EXTRA_API_URL = (Constants?.expoConfig?.extra?.apiUrl || "").trim();
const DEFAULT_LAN_IP = "192.168.8.151";

// ============================================

const getApiBaseUrl = () => {
  if (ENV_API_URL) {
    // Allow explicit override from .env for all platforms.
    return ENV_API_URL.replace(/\/+$/, "");
  }

  if (EXTRA_API_URL) {
    // Keep app.config.js as a secondary source of truth.
    return EXTRA_API_URL.replace(/\/+$/, "");
  }

  if (__DEV__) {
    const isPhysicalDevice =
      Boolean(Constants?.isDevice) ||
      Constants?.executionEnvironment === "storeClient" ||
      ENV_USE_PHYSICAL_DEVICE;
    const deviceIp = ENV_COMPUTER_IP || DEFAULT_LAN_IP;

    if (isPhysicalDevice) {
      return `http://${deviceIp}:${BACKEND_PORT}`;
    }

    // For emulators/simulators - auto-detect platform
    if (Platform.OS === "android") {
      // Android emulator uses 10.0.2.2 to access host machine's localhost
      return `http://10.0.2.2:${BACKEND_PORT}`;
    } else if (Platform.OS === "ios") {
      // iOS simulator can access localhost on the host machine.
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
