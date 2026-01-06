import { Platform } from "react-native";
import Constants from "expo-constants";

/**
 * Get the base URL for API calls based on the platform
 * - Android emulator: http://10.0.2.2:5000
 * - iOS simulator: http://localhost:5000
 * - Real device: http://<your-laptop-ip>:5000 (set via EXPO_PUBLIC_API_URL or default)
 * - Web: http://localhost:5000
 */
export function getBaseUrl(): string {
  // Check if custom URL is set via environment variable (highest priority)
  if (process.env.EXPO_PUBLIC_API_URL) {
    console.log(`[API] Using EXPO_PUBLIC_API_URL: ${process.env.EXPO_PUBLIC_API_URL}`);
    return process.env.EXPO_PUBLIC_API_URL;
  }

  if (__DEV__) {
    // Development mode
    const isDevice = Constants.isDevice;
    const isExpoGo = Constants.executionEnvironment === "storeClient"; // Expo Go app
    
    // Debug logging
    console.log(`[API Config] Platform: ${Platform.OS}, isDevice: ${isDevice}, isExpoGo: ${isExpoGo}`);
    console.log(`[API Config] Constants.executionEnvironment: ${Constants.executionEnvironment}`);
    
    // CRITICAL: Expo Go always runs on real devices, so always use laptop IP
    if (isExpoGo) {
      const deviceUrl = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.11:5000";
      console.log(`[API] Expo Go detected (real device). Using: ${deviceUrl}`);
      return deviceUrl;
    }
    
    if (Platform.OS === "android") {
      if (isDevice) {
        // Real Android device - needs laptop's IP address
        const deviceUrl = process.env.EXPO_PUBLIC_API_URL;
        if (deviceUrl) {
          console.log(`[API] Using custom URL for real Android device: ${deviceUrl}`);
          return deviceUrl;
        }
        // Default fallback - user should set EXPO_PUBLIC_API_URL
        console.warn(
          "⚠️ Real Android device detected but EXPO_PUBLIC_API_URL not set. " +
          "Create a .env file with: EXPO_PUBLIC_API_URL=http://<your-laptop-ip>:5000"
        );
        // Try common IPs (update if your IP is different)
        const possibleIPs = ["192.168.1.11", "192.168.1.10"];
        const selectedIP = possibleIPs[0];
        console.warn(`[API] Real Android device detected. Using laptop IP: ${selectedIP}`);
        console.warn(`[API] If connection fails, update EXPO_PUBLIC_API_URL in .env file`);
        return `http://${selectedIP}:5000`;
      } else {
        // Android emulator uses special IP to access host machine
        console.log(`[API] Android emulator detected. Using 10.0.2.2`);
        return "http://10.0.2.2:5000";
      }
    } else if (Platform.OS === "ios") {
      const isRealDevice = isDevice || isExpoGo;
      if (isRealDevice) {
        // Real iOS device - needs laptop's IP address
        const deviceUrl = process.env.EXPO_PUBLIC_API_URL;
        if (deviceUrl) {
          console.log(`[API] Using custom URL for real iOS device: ${deviceUrl}`);
          return deviceUrl;
        }
        console.warn(
          "⚠️ Real iOS device detected but EXPO_PUBLIC_API_URL not set. " +
          "Create a .env file with: EXPO_PUBLIC_API_URL=http://<your-laptop-ip>:5000"
        );
        return "http://192.168.1.11:5000";
      } else {
        // iOS simulator can use localhost
        return "http://localhost:5000";
      }
    } else {
      // Web or other platforms
      return "http://localhost:5000";
    }
  } else {
    // Production mode - use your production API URL
    return process.env.EXPO_PUBLIC_API_URL || "http://localhost:5000";
  }
}

/**
 * For real devices, you need to use your laptop's IP address
 * Example: http://192.168.1.11:5000
 * Set this via environment variable or modify the function above
 */
export function getBaseUrlForRealDevice(ipAddress?: string): string {
  if (ipAddress) {
    return `http://${ipAddress}:5000`;
  }
  // Fallback to default
  return getBaseUrl();
}

export const BASE_URL = getBaseUrl();

// Log the final URL being used (helpful for debugging)
console.log(`[API] Final BASE_URL: ${BASE_URL}`);

/**
 * API endpoints
 */
export const API_ENDPOINTS = {
  // Session management
  START_SESSION: "/api/eh/start",
  FINALIZE_SESSION: "/api/eh/finalize",
  
  // Emotion detection
  PREDICT_EMOTION: "/api/emotion/predict",
  
  // Hand movement analysis
  ANALYZE_HAND: "/api/hand/analyze",
  
  // Health check
  HEALTH: "/health",
};

/**
 * Helper function to make API calls with retry and timeout
 */
export async function apiCall(
  endpoint: string,
  options: RequestInit = {},
  retries = 2,
  timeout = 20000
): Promise<Response> {
  const url = `${BASE_URL}${endpoint}`;
  
  console.log(`[API] Calling: ${url}`);
  
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  try {
    timeoutId = setTimeout(() => {
      console.log(`[API] Timeout after ${timeout}ms for ${url}`);
      controller.abort();
    }, timeout);
    
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    
    if (timeoutId) clearTimeout(timeoutId);
    console.log(`[API] Response from ${url}: ${response.status} ${response.statusText}`);
    return response;
  } catch (error: any) {
    if (timeoutId) clearTimeout(timeoutId);
    
    console.error(`[API] Error calling ${url}:`, error);
    
    // Check if it's an abort error
    if (error.name === "AbortError" || error.message?.includes("Aborted")) {
      // Check if it was a timeout or network issue
      if (retries > 0) {
        console.log(`[API] Retrying ${url} (${retries} retries left)...`);
        // Retry on abort (might be network issue)
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return apiCall(endpoint, options, retries - 1, timeout);
      }
      // Convert abort error to a more user-friendly message
      throw new Error(`Request timed out after ${timeout}ms. Backend might be slow or unreachable at ${BASE_URL}`);
    }
    
    // Handle network errors
    if (error.message?.includes("Network request failed") || error.message?.includes("fetch") || error.message?.includes("Failed to fetch")) {
      if (retries > 0) {
        console.log(`[API] Retrying ${url} due to network error (${retries} retries left)...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return apiCall(endpoint, options, retries - 1, timeout);
      }
      throw new Error(`Cannot connect to backend server at ${BASE_URL}. Make sure:\n1. Backend is running\n2. Port 5000 is accessible\n3. For real devices, use your laptop's IP address`);
    }
    
    throw error;
  }
}

/**
 * Upload file with FormData
 */
export async function uploadFile(
  endpoint: string,
  file: { uri: string; type: string; name: string },
  body: Record<string, any> = {},
  retries = 2
): Promise<any> {
  console.log(`[Upload] Preparing upload - endpoint: ${endpoint}, file: ${file.name}`);
  console.log(`[Upload] URI type: ${file.uri?.startsWith('data:') ? 'base64' : file.uri?.startsWith('file://') ? 'file' : 'other'}`);
  
  const formData = new FormData();
  
  // Handle base64 data URIs - convert to Blob for web, or use file URI for native
  if (file.uri.startsWith('data:')) {
    console.log(`[Upload] Converting base64 data URI to Blob...`);
    try {
      // Extract base64 data and mime type
      const base64Data = file.uri.split(',')[1];
      const mimeType = file.uri.split(',')[0].split(':')[1].split(';')[0];
      
      // Convert base64 to binary
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Create Blob from bytes
      const blob = new Blob([bytes], { type: mimeType || file.type || "image/jpeg" });
      
      // Append Blob to FormData (works on web)
      formData.append("file", blob, file.name || "image.jpg");
      console.log(`[Upload] ✅ Converted base64 to Blob (${bytes.length} bytes, ${mimeType})`);
    } catch (err: any) {
      console.error(`[Upload] Error converting base64 to Blob:`, err);
      // Fallback: try sending as data URI (might work on some platforms)
      formData.append("file", {
        uri: file.uri,
        type: file.type || "image/jpeg",
        name: file.name || "image.jpg",
      } as any);
    }
  } else {
    // Regular file URI (native platforms)
    formData.append("file", {
      uri: file.uri,
      type: file.type || "image/jpeg",
      name: file.name || "image.jpg",
    } as any);
  }
  
  // Add other body fields
  Object.entries(body).forEach(([key, value]) => {
    console.log(`[Upload] Adding field: ${key} = ${value}`);
    formData.append(key, String(value));
  });
  
  console.log(`[Upload] Uploading to ${BASE_URL}${endpoint}...`);
  
  try {
    const response = await apiCall(
      endpoint,
      {
        method: "POST",
        body: formData,
        // CRITICAL: Don't set Content-Type header - FormData sets it automatically with boundary
      },
      retries
    );
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error(`[Upload] Upload failed with status ${response.status}: ${errorText}`);
      throw new Error(errorText || `HTTP ${response.status}`);
    }
    
    const result = await response.json();
    console.log(`[Upload] ✅ Upload successful:`, result);
    return result;
  } catch (error: any) {
    console.error("[Upload] Upload error:", error);
    throw error;
  }
}

/**
 * Upload multiple files (for hand analysis)
 */
export async function uploadFiles(
  endpoint: string,
  files: Array<{ uri: string; type: string; name: string }>,
  body: Record<string, any> = {},
  retries = 2
): Promise<any> {
  console.log(`[Upload] Preparing upload of ${files.length} files...`);
  const formData = new FormData();
  
  // Add all files with field name "frames"
  files.forEach((file, index) => {
    if (file.uri.startsWith('data:')) {
      // Convert base64 to Blob
      try {
        const base64Data = file.uri.split(',')[1];
        const mimeType = file.uri.split(',')[0].split(':')[1].split(';')[0];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mimeType || file.type || "image/jpeg" });
        formData.append("frames", blob, file.name || `frame_${index}.jpg`);
        console.log(`[Upload] Converted frame ${index + 1} from base64 to Blob`);
      } catch (err: any) {
        console.error(`[Upload] Error converting frame ${index + 1}:`, err);
        // Fallback
        formData.append("frames", {
          uri: file.uri,
          type: file.type || "image/jpeg",
          name: file.name || "frame.jpg",
        } as any);
      }
    } else {
      // Regular file URI
      formData.append("frames", {
        uri: file.uri,
        type: file.type || "image/jpeg",
        name: file.name || "frame.jpg",
      } as any);
    }
  });
  
  // Add other body fields
  Object.entries(body).forEach(([key, value]) => {
    formData.append(key, String(value));
  });
  
  try {
    const response = await apiCall(
      endpoint,
      {
        method: "POST",
        body: formData,
        // Don't set Content-Type - React Native FormData sets it automatically with boundary
      },
      retries
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error: any) {
    console.error("Upload error:", error);
    throw error;
  }
}
