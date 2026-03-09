import { Platform } from "react-native";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";

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
    // ⚠️ CHANGE THIS IP to your computer's IP address!
    // Find your IP: Windows: ipconfig | Mac/Linux: ifconfig
    // Look for IPv4 Address (Windows) or inet (Mac/Linux) - should start with 192.168. or 10.
    if (isExpoGo) {
      const deviceUrl = process.env.EXPO_PUBLIC_API_URL || "http://192.168.8.151:5000"; // ✅ Updated to match backend port 5000
      console.log(`[API] Expo Go detected (real device). Using: ${deviceUrl}`);
      console.log(`[API] ⚠️ If connection fails, create .env file in frontend/ with:`);
      console.log(`[API] EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_IP:5000`);
      console.log(`[API] Find your IP: Windows: ipconfig | Mac/Linux: ifconfig`);
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
        // ✅ Updated to your IP: 192.168.8.151
        const possibleIPs = ["192.168.8.151", "192.168.1.9"]; // ✅ Your IP: 192.168.8.151
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
        return "http://192.168.1.9:5000"; // ✅ Updated to match backend port 5000
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
 * Example: http://192.168.1.9:5000
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
  timeout = 0 // 0 = no timeout (allow unlimited time)
): Promise<Response> {
  const url = `${BASE_URL}${endpoint}`;
  
  console.log(`[API] Calling: ${url}${timeout > 0 ? ` (timeout: ${timeout}ms)` : ' (no timeout)'}`);
  
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  try {
    // Only set timeout if timeout > 0
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        console.log(`[API] Timeout after ${timeout}ms for ${url}`);
        controller.abort();
      }, timeout);
    }
    
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
    
    // Check if it's an abort error (timeout or cancellation)
    if (error.name === "AbortError" || error.message?.includes("Aborted")) {
      // Check if it was a timeout or network issue
      if (retries > 0) {
        const retryDelay = Math.min(1000 * Math.pow(2, 2 - retries), 5000); // Exponential backoff
        console.log(`[API] Retrying ${url} after timeout/abort (${retries} retries left, waiting ${retryDelay}ms)...`);
        // Retry on abort (might be network issue or slow backend)
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        return apiCall(endpoint, options, retries - 1, timeout);
      }
      // Convert abort error to a more user-friendly message
      throw new Error(`Request timed out after ${timeout}ms. Backend might be slow or unreachable at ${BASE_URL}`);
    }
    
    // Handle network errors with exponential backoff
    if (error.message?.includes("Network request failed") || error.message?.includes("fetch") || error.message?.includes("Failed to fetch")) {
      if (retries > 0) {
        const retryDelay = Math.min(1000 * Math.pow(2, 2 - retries), 5000); // Exponential backoff: 1s, 2s, 4s (max 5s)
        console.log(`[API] Retrying ${url} due to network error (${retries} retries left, waiting ${retryDelay}ms)...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        return apiCall(endpoint, options, retries - 1, timeout);
      }
      const errorMsg = `Cannot connect to backend server at ${BASE_URL}.\n\n` +
        `Troubleshooting steps:\n` +
        `1. Make sure backend is running (check terminal)\n` +
        `2. Find your computer's IP address:\n` +
        `   - Windows: Open CMD and type "ipconfig"\n` +
        `   - Mac/Linux: Open Terminal and type "ifconfig"\n` +
        `3. Create .env file in frontend/ directory with:\n` +
        `   EXPO_PUBLIC_API_URL=http://YOUR_IP:5000\n` +
        `   (Replace YOUR_IP with the IP from step 2)\n` +
        `4. Restart Expo: npx expo start --clear\n` +
        `5. Make sure phone and computer are on the SAME WiFi network\n` +
        `6. Check firewall allows Node.js connections\n\n` +
        `Current URL being used: ${BASE_URL}`;
      throw new Error(errorMsg);
    }
    
    throw error;
  }
}

/**
 * Upload file with FormData
 * For React Native: saves base64 to temp file first, then uploads
 */
export async function uploadFile(
  endpoint: string,
  file: { uri: string; type: string; name: string },
  body: Record<string, any> = {},
  retries = 2,
  timeout = 0 // 0 = no timeout (allow unlimited time for ML operations)
): Promise<any> {
  console.log(`[Upload] Preparing upload - endpoint: ${endpoint}, file: ${file.name}`);
  console.log(`[Upload] URI type: ${file.uri?.startsWith('data:') ? 'base64' : file.uri?.startsWith('file://') ? 'file' : 'other'}`);
  
  let fileUri = file.uri;
  let shouldCleanup = false;
  
  // Handle base64 data URIs - save to temp file for React Native, use Blob for web
  if (file.uri.startsWith('data:')) {
    console.log(`[Upload] Converting base64 data URI...`);
    
    // Extract actual base64 data - handle nested data URIs
    // Format might be: data:image/jpeg;base64,data:image/png;base64,ACTUAL_BASE64
    let actualBase64Data = file.uri;
    
    // Find the last comma (in case of nested data URIs)
    if (actualBase64Data.includes(',')) {
      const lastCommaIndex = actualBase64Data.lastIndexOf(',');
      actualBase64Data = actualBase64Data.substring(lastCommaIndex + 1);
    }
    
    // If still contains data: prefix, extract again
    if (actualBase64Data.includes('base64,')) {
      actualBase64Data = actualBase64Data.split('base64,')[1] || actualBase64Data;
    }
    
    // Reconstruct a clean data URI
    const cleanDataUri = `data:image/jpeg;base64,${actualBase64Data}`;
    console.log(`[Upload] Cleaned data URI length: ${cleanDataUri.length} chars, base64 data: ${actualBase64Data.length} chars`);
    
    // Check if running on web
    if (Platform.OS === 'web') {
      // On web, use Blob directly - no need for temp file
      console.log(`[Upload] Web platform detected - using Blob directly`);
      // Use the cleaned data URI
      fileUri = cleanDataUri;
      shouldCleanup = false;
    } else {
      // Native platforms - save to temp file
      try {
        // Extract base64 data - handle nested data URIs
        // Format might be: data:image/jpeg;base64,data:image/png;base64,ACTUAL_BASE64_DATA
        // or: data:image/jpeg;base64,ACTUAL_BASE64_DATA
        let base64Data = file.uri;
        
        // Remove the data URI prefix(es)
        if (base64Data.includes(',')) {
          // Find the last comma (in case of nested data URIs)
          const lastCommaIndex = base64Data.lastIndexOf(',');
          base64Data = base64Data.substring(lastCommaIndex + 1);
        }
        
        // If still contains data: prefix, extract again
        if (base64Data.includes('base64,')) {
          base64Data = base64Data.split('base64,')[1] || base64Data;
        }
        
        console.log(`[Upload] Extracted base64 data length: ${base64Data.length} chars`);
        
        // Check cacheDirectory exists (not available on web)
        if (!FileSystem.cacheDirectory) {
          throw new Error('FileSystem.cacheDirectory is not available on this platform');
        }
        
        // Create temp file path
        const tempFilePath = `${FileSystem.cacheDirectory}${file.name || `temp_${Date.now()}.jpg`}`;
        console.log(`[Upload] Writing base64 data to: ${tempFilePath}`);
        
        // Write base64 to file using legacy API
        await FileSystem.writeAsStringAsync(tempFilePath, base64Data, {
          encoding: 'base64' as any,
        });
        console.log(`[Upload] ✅ File written successfully`);
        
        // Ensure file:// prefix for React Native
        fileUri = tempFilePath.startsWith('file://') ? tempFilePath : `file://${tempFilePath}`;
        shouldCleanup = true;
        
        // Verify file was created
        const fileInfo = await FileSystem.getInfoAsync(tempFilePath);
        if (!fileInfo.exists) {
          throw new Error(`Temp file was not created: ${tempFilePath}`);
        }
        console.log(`[Upload] ✅ Saved base64 to temp file: ${fileUri} (${fileInfo.size} bytes)`);
      } catch (err: any) {
        console.error(`[Upload] ❌ Error saving base64 to file:`, err);
        throw new Error(`Failed to prepare image file: ${err.message}`);
      }
    }
  } else if (!fileUri.startsWith('file://') && Platform.OS !== 'web') {
    // Ensure file:// prefix for existing file URIs (not on web)
    fileUri = `file://${fileUri}`;
  }
  
  const formData = new FormData();
  
  // CRITICAL: Add body fields FIRST (before file) so multer can access them in destination callback
  Object.entries(body).forEach(([key, value]) => {
    const stringValue = String(value);
    console.log(`[Upload] Adding field: ${key} = ${stringValue}`);
    formData.append(key, stringValue);
  });
  
  // Append file - different format for web vs native
  if (Platform.OS === 'web') {
    // Web: Convert data URI to Blob
    if (fileUri.startsWith('data:')) {
      const response = await fetch(fileUri);
      const blob = await response.blob();
      formData.append("file", blob, file.name || "image.jpg");
      console.log(`[Upload] Appended Blob to FormData (web)`);
    } else {
      formData.append("file", fileUri as any);
    }
  } else {
    // Native: React Native FormData format
    const fileObject = {
      uri: fileUri,
      type: file.type || "image/jpeg",
      name: file.name || "image.jpg",
    };
    
    console.log(`[Upload] File object to append:`, {
      uri: fileUri.substring(0, 100) + '...',
      type: fileObject.type,
      name: fileObject.name
    });
    
    formData.append("file", fileObject as any);
  }
  
  // Verify file exists before uploading (skip on web)
  // NOTE: On React Native, cache files might be cleaned up or paths might differ
  // So we make this non-blocking - just log a warning if file doesn't exist
  if (Platform.OS !== 'web') {
    try {
      const filePath = fileUri.replace('file://', '');
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        console.warn(`[Upload] ⚠️ File verification: File does not exist at ${filePath}`);
        console.warn(`[Upload] This might be normal if file was already uploaded or cleaned up. Continuing anyway...`);
        // Don't throw error - continue with upload attempt
        // The backend will handle missing files
      } else {
        console.log(`[Upload] ✅ File verified: ${fileInfo.size} bytes`);
      }
    } catch (verifyErr: any) {
      console.warn(`[Upload] ⚠️ File verification warning (non-blocking):`, verifyErr.message || verifyErr);
      // Continue anyway - file might still be accessible for upload
      // This is common on React Native where cache paths can be tricky
    }
  }
  
  // Debug: Try to inspect FormData (works differently on web vs native)
  if (Platform.OS === 'web') {
    // On web, we can't enumerate FormData entries, but we can log what we appended
    console.log(`[Upload] FormData prepared with ${Object.keys(body).length} body fields + 1 file`);
  } else {
    console.log(`[Upload] FormData prepared with ${Object.keys(body).length} body fields + 1 file`);
  }
  
  console.log(`[Upload] Uploading to ${BASE_URL}${endpoint}...`);
  
  try {
    const response = await apiCall(
      endpoint,
      {
        method: "POST",
        body: formData,
        // CRITICAL: Don't set Content-Type header - FormData sets it automatically with boundary
      },
      retries,
      timeout
    );
    
    // Cleanup temp file if we created one
    if (shouldCleanup && fileUri) {
      try {
        const filePath = fileUri.replace('file://', '');
        await FileSystem.deleteAsync(filePath, { idempotent: true });
        console.log(`[Upload] Cleaned up temp file: ${fileUri}`);
      } catch (cleanupErr) {
        console.warn(`[Upload] Failed to cleanup temp file:`, cleanupErr);
      }
    }
    
    if (!response.ok) {
      // Try to parse error response as JSON to check for stored fallback data
      let errorData: any = {};
      try {
        const errorText = await response.text();
        errorData = JSON.parse(errorText);
      } catch {
        // Not JSON, use as plain text
        errorData = { error: await response.text().catch(() => "Unknown error") };
      }
      
      // CRITICAL: If backend stored fallback data (Python script failed but data was stored), use it!
      // This prevents errors from breaking the session when Python crashes
      if (errorData.stored) {
        console.warn(`[Upload] ⚠️ Backend returned error but stored fallback data (Python script may have crashed):`, errorData.error?.substring(0, 100));
        console.log(`[Upload] ✅ Using stored fallback data instead of throwing error`);
        return errorData.stored; // Return stored data instead of throwing
      }
      
      // Only throw if there's no stored fallback data
      console.error(`[Upload] Upload failed with status ${response.status}:`, errorData.error || "Unknown error");
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    
    const result = await response.json();
    console.log(`[Upload] ✅ Upload successful:`, result);
    return result;
  } catch (error: any) {
    // Cleanup temp file on error too
    if (shouldCleanup && fileUri) {
      try {
        const filePath = fileUri.replace('file://', '');
        await FileSystem.deleteAsync(filePath, { idempotent: true });
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
    }
    console.error("[Upload] Upload error:", error);
    throw error;
  }
}

/**
 * Upload multiple files (for hand analysis)
 * For React Native: saves base64 to temp files first, then uploads
 */
export async function uploadFiles(
  endpoint: string,
  files: Array<{ uri: string; type: string; name: string }>,
  body: Record<string, any> = {},
  retries = 2,
  timeout = 0 // 0 = no timeout (allow unlimited time for hand analysis)
): Promise<any> {
  console.log(`[Upload] Preparing upload of ${files.length} files...`);
  const formData = new FormData();
  const tempFiles: string[] = []; // Track temp files for cleanup
  
  // CRITICAL: Add body fields FIRST (before files) so multer can access them
  Object.entries(body).forEach(([key, value]) => {
    const stringValue = String(value);
    console.log(`[Upload] Adding field: ${key} = ${stringValue}`);
    formData.append(key, stringValue);
  });
  
  try {
    // Process all files - convert base64 to temp files if needed
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      let fileUri = file.uri;
      
      if (file.uri.startsWith('data:')) {
        if (Platform.OS === 'web') {
          // Web: Clean the data URI and use it
          // Extract actual base64 data - handle nested data URIs
          let actualBase64Data = file.uri;
          if (actualBase64Data.includes(',')) {
            const lastCommaIndex = actualBase64Data.lastIndexOf(',');
            actualBase64Data = actualBase64Data.substring(lastCommaIndex + 1);
          }
          if (actualBase64Data.includes('base64,')) {
            actualBase64Data = actualBase64Data.split('base64,')[1] || actualBase64Data;
          }
          // Reconstruct clean data URI
          fileUri = `data:image/jpeg;base64,${actualBase64Data}`;
          console.log(`[Upload] Frame ${index + 1} - cleaned data URI (web), base64 length: ${actualBase64Data.length} chars`);
        } else {
          // Native: Save to temp file
          console.log(`[Upload] Converting frame ${index + 1} from base64 to temp file...`);
          try {
            // Extract base64 data - handle nested data URIs
            // Format might be: data:image/jpeg;base64,data:image/png;base64,ACTUAL_BASE64
            let base64Data = file.uri;
            
            // Find the last comma (in case of nested data URIs)
            if (base64Data.includes(',')) {
              const lastCommaIndex = base64Data.lastIndexOf(',');
              base64Data = base64Data.substring(lastCommaIndex + 1);
            }
            
            // If still contains data: prefix, extract again
            if (base64Data.includes('base64,')) {
              base64Data = base64Data.split('base64,')[1] || base64Data;
            }
            
            console.log(`[Upload] Extracted base64 data length: ${base64Data.length} chars`);
            
            if (!FileSystem.cacheDirectory) {
              throw new Error('FileSystem.cacheDirectory is not available');
            }
            
            const tempFilePath = `${FileSystem.cacheDirectory}${file.name || `frame_${Date.now()}_${index}.jpg`}`;
            console.log(`[Upload] Writing frame ${index + 1} base64 data to: ${tempFilePath}`);
            await FileSystem.writeAsStringAsync(tempFilePath, base64Data, {
              encoding: 'base64' as any,
            });
            console.log(`[Upload] ✅ Frame ${index + 1} written successfully`);
            
            fileUri = tempFilePath.startsWith('file://') ? tempFilePath : `file://${tempFilePath}`;
            tempFiles.push(fileUri);
            console.log(`[Upload] ✅ Saved frame ${index + 1} to temp file: ${fileUri}`);
          } catch (err: any) {
            console.error(`[Upload] Error saving frame ${index + 1}:`, err);
            throw new Error(`Failed to prepare frame ${index + 1}: ${err.message}`);
          }
        }
      }
      
      // Append file to FormData - different format for web vs native
      if (Platform.OS === 'web') {
        // Web: Convert data URI to Blob
        if (fileUri.startsWith('data:')) {
          try {
            // Use the cleaned data URI
            const response = await fetch(fileUri);
            const blob = await response.blob();
            formData.append("frames", blob, file.name || `frame_${index}.jpg`);
            console.log(`[Upload] ✅ Frame ${index + 1} appended as Blob, size: ${blob.size} bytes`);
          } catch (fetchErr) {
            console.error(`[Upload] ❌ Error converting data URI to Blob for frame ${index + 1}:`, fetchErr);
            // Fallback: convert base64 to Blob manually
            try {
              const base64Data = fileUri.split(',')[1];
              const binaryString = atob(base64Data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const blob = new Blob([bytes], { type: 'image/jpeg' });
              formData.append("frames", blob, file.name || `frame_${index}.jpg`);
              console.log(`[Upload] ✅ Frame ${index + 1} appended using manual conversion, size: ${blob.size} bytes`);
            } catch (manualErr: any) {
              console.error(`[Upload] ❌ Manual conversion failed for frame ${index + 1}:`, manualErr);
              throw new Error(`Failed to convert data URI to Blob for frame ${index + 1}: ${manualErr?.message || String(manualErr)}`);
            }
          }
        } else {
          formData.append("frames", fileUri as any);
        }
      } else {
        // Native: Ensure file:// prefix
        if (!fileUri.startsWith('file://')) {
          fileUri = `file://${fileUri}`;
        }
        
        // Append file to FormData - React Native format
        const fileObject = {
          uri: fileUri,
          type: file.type || "image/jpeg",
          name: file.name || `frame_${index}.jpg`,
        };
        
        console.log(`[Upload] Frame ${index + 1} object:`, {
          uri: fileUri.substring(0, 100) + '...',
          type: fileObject.type,
          name: fileObject.name
        });
        
        formData.append("frames", fileObject as any);
      }
    }
    
    console.log(`[Upload] FormData prepared with ${Object.keys(body).length} body fields + ${files.length} files`);
    console.log(`[Upload] Uploading ${files.length} files to ${BASE_URL}${endpoint}...`);
    
    const response = await apiCall(
      endpoint,
      {
        method: "POST",
        body: formData,
        // Don't set Content-Type - React Native FormData sets it automatically with boundary
      },
      retries,
      timeout
    );
    
    // Cleanup temp files
    if (tempFiles.length > 0) {
      try {
        await Promise.all(
          tempFiles.map(fileUri => {
            const filePath = fileUri.replace('file://', '');
            return FileSystem.deleteAsync(filePath, { idempotent: true });
          })
        );
        console.log(`[Upload] Cleaned up ${tempFiles.length} temp files`);
      } catch (cleanupErr) {
        console.warn(`[Upload] Failed to cleanup some temp files:`, cleanupErr);
      }
    }
    
    if (!response.ok) {
      // Try to parse error response as JSON to check for stored fallback data
      let errorData: any = {};
      try {
        const errorText = await response.text();
        errorData = JSON.parse(errorText);
      } catch {
        // Not JSON, use as plain text
        errorData = { error: await response.text().catch(() => "Unknown error") };
      }
      
      // CRITICAL: If backend stored fallback data (Python script failed but data was stored), use it!
      // This prevents errors from breaking the session when Python crashes
      if (errorData.stored) {
        console.warn(`[Upload] ⚠️ Backend returned error but stored fallback data (Python script may have crashed):`, errorData.error?.substring(0, 100));
        console.log(`[Upload] ✅ Using stored fallback data instead of throwing error`);
        return errorData.stored; // Return stored data instead of throwing
      }
      
      // Only throw if there's no stored fallback data
      console.error(`[Upload] Upload failed with status ${response.status}:`, errorData.error || "Unknown error");
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error: any) {
    // Cleanup temp files on error
    if (tempFiles.length > 0) {
      try {
        await Promise.all(
          tempFiles.map(fileUri => {
            const filePath = fileUri.replace('file://', '');
            return FileSystem.deleteAsync(filePath, { idempotent: true });
          })
        );
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
    }
    console.error("Upload error:", error);
    throw error;
  }
}
