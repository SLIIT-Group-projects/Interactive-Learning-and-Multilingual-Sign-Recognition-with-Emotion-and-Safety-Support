import axios, { AxiosInstance, AxiosError } from 'axios';
import { Platform } from 'react-native';
import API_CONFIG from '../utils/config';

/**
 * API Service
 * Centralized API client for backend communication
 */

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_CONFIG.BASE_URL,
      timeout: API_CONFIG.TIMEOUT,
      // Don't set Content-Type as default - axios will set it automatically
      // For multipart/form-data, axios will set the correct Content-Type with boundary
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('❌ API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        console.log(`✅ API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error: AxiosError) => {
        console.error('❌ API Response Error:', error.response?.status, error.message);
        return Promise.reject(this.handleError(error));
      }
    );
  }

  private handleError(error: AxiosError): Error {
    if (error.response) {
      // Server responded with error status
      const message = (error.response.data as any)?.error?.message || error.message;
      const normalizedError: any = new Error(message);
      normalizedError.statusCode = error.response.status;
      normalizedError.serverErrorCode = (error.response.data as any)?.error?.code || null;
      normalizedError.retryAfterMs = (error.response.data as any)?.error?.retryAfterMs || null;
      return normalizedError;
    } else if (error.request) {
      // Request made but no response received
      const platform = require('react-native').Platform.OS;
      let helpMessage = 'No response from server. ';
      
      if (platform === 'android') {
        helpMessage += 'For Android emulator, ensure backend is running and using http://10.0.2.2:5000. ';
      } else if (platform === 'ios') {
        helpMessage += 'For iOS simulator, ensure backend is running on http://localhost:5000. ';
      }
      
      helpMessage += 'Please check: 1) Backend server is running (cd backend && npm run dev), 2) Correct URL in config.ts, 3) Firewall settings.';
      
      return new Error(helpMessage);
    } else {
      // Something else happened
      return new Error(error.message || 'An unexpected error occurred');
    }
  }

  /**
   * Health check endpoint
   */
  async checkHealth() {
    try {
      const response = await this.client.get(API_CONFIG.ENDPOINTS.HEALTH);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Detect hazards from audio file
   */
  async detectHazards(audioUri: string, context?: HazardContext) {
    try {
      console.log('🔧 Preparing audio file for upload...');
      console.log('📂 Audio URI:', audioUri);
      
      // Convert URI to file object for React Native
      const file = await this.uriToFile(audioUri);
      console.log('📦 File object:', { uri: file.uri, name: file.name, type: file.type });
      
      // Create FormData for file upload
      const formData = new FormData();
      
      // Handle file upload differently for web vs React Native
      if (Platform.OS === 'web') {
        // For web, read file as blob from the URI
        console.log('🌐 Web platform: Reading file as blob...');
        try {
          const response = await fetch(file.uri);
          if (!response.ok) {
            throw new Error(`Failed to read file: ${response.status}`);
          }
          const blob = await response.blob();
          if (blob.size === 0) {
            throw new Error('File is empty');
          }
          console.log('📦 Blob created:', { size: blob.size, type: blob.type });
          formData.append('audio', blob, file.name);
        } catch (blobError) {
          console.error('❌ Error reading file as blob:', blobError);
          throw new Error('Failed to read audio file for upload');
        }
      } else {
        // For React Native (iOS/Android), use the object format directly
        // This is the recommended approach for React Native FormData
        console.log('📱 React Native platform: Using object format');
        formData.append('audio', {
          uri: file.uri,
          name: file.name,
          type: file.type,
        } as any);
      }

      // Add context if provided
      if (context) {
        formData.append('context', JSON.stringify(context));
        console.log('📍 Context:', context);
      }

      const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.HAZARD_DETECT}`;
      console.log('🚀 Sending POST request to:', url);
      
      // Use fetch for React Native FormData compatibility
      // React Native FormData works with fetch
      // Add timeout and better error handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
      
      try {
        const response = await fetch(url, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
          // DO NOT set Content-Type header - React Native will set it automatically with boundary
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorText = await response.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { error: { message: errorText || `HTTP ${response.status}` } };
          }
          throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ Response received:', response.status);
        return data;
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('Request timeout - file upload took too long');
        }
        throw fetchError;
      }

    } catch (error: any) {
      console.error('❌ Error in detectHazards:', error.message);
      console.error('❌ Error details:', error);
      throw error;
    }
  }

  /**
   * Detect hazards from multiple audio chunks (streaming)
   */
  async detectHazardsStream(audioUris: string[], context?: HazardContext) {
    try {
      const formData = new FormData();

      // Add all audio files
      for (const uri of audioUris) {
        const file = await this.uriToFile(uri);
        formData.append('audio', file as any);
      }

      // Add context if provided
      if (context) {
        formData.append('context', JSON.stringify(context));
      }

      const response = await this.client.post(
        API_CONFIG.ENDPOINTS.HAZARD_DETECT_STREAM,
        formData
      );

      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get hazard priorities configuration
   */
  async getHazardPriorities() {
    try {
      const response = await this.client.get(API_CONFIG.ENDPOINTS.HAZARD_PRIORITIES);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Submit post-critical safety check answers from child
   */
  async submitCriticalSafetyCheck(payload: CriticalSafetyCheckPayload) {
    try {
      const response = await this.client.post(
        API_CONFIG.ENDPOINTS.HAZARD_SAFETY_CHECK,
        payload
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Process audio and get spectrogram metadata
   */
  async processAudio(audioUri: string) {
    try {
      const formData = new FormData();
      const file = await this.uriToFile(audioUri);
      formData.append('audio', file as any);

      const response = await this.client.post(
        API_CONFIG.ENDPOINTS.AUDIO_PROCESS,
        formData
      );

      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Convert URI to File/Blob for FormData
   * React Native compatible version
   */
  private async uriToFile(uri: string): Promise<{ uri: string; name: string; type: string }> {
    try {
      // Clean up the URI - handle different URI formats
      let cleanUri = uri;
      
      // Check if it's already a valid URL (blob:, http:, https:, or file:)
      const isBlobUrl = uri.startsWith('blob:');
      const isHttpUrl = uri.startsWith('http://') || uri.startsWith('https://');
      const isFileUrl = uri.startsWith('file://');
      
      // Only prepend file:// for local paths that don't have a protocol
      if (!isBlobUrl && !isHttpUrl && !isFileUrl) {
        cleanUri = `file://${uri}`;
      }
      
      // Extract filename and type from URI
      // For blob URLs, use a default filename since they don't have a real path
      let filename = 'audio.wav';
      if (isBlobUrl) {
        // Blob URLs don't have a filename, use a default
        filename = 'audio.wav';
      } else {
        filename = cleanUri.split('/').pop() || 'audio.wav';
      }
      
      const match = /\.(\w+)$/.exec(filename);
      let type = 'audio/wav'; // default
      
      if (match) {
        const ext = match[1].toLowerCase();
        // Map common audio extensions to MIME types
        const mimeTypes: { [key: string]: string } = {
          'wav': 'audio/wav',
          'wave': 'audio/wav',
          'mp3': 'audio/mpeg',
          'm4a': 'audio/mp4',
          'aac': 'audio/aac',
          'ogg': 'audio/ogg',
        };
        type = mimeTypes[ext] || `audio/${ext}`;
      }

      console.log('📄 Prepared file:', { uri: cleanUri, name: filename, type, isBlobUrl });

      // React Native FormData format
      // The format should be: { uri, name, type }
      return {
        uri: cleanUri,
        name: filename,
        type: type,
      };
    } catch (error) {
      console.error('Error converting URI to file:', error);
      throw new Error('Failed to prepare audio file for upload');
    }
  }
}

export interface HazardContext {
  location?: {
    type?: 'indoor' | 'outdoor' | 'residential' | 'school';
    latitude?: number;
    longitude?: number;
  };
  time?: string;
  [key: string]: any;
}

export interface HazardDetection {
  type: string;
  confidence: number;
  priority: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  basePriority?: number;
}

export interface HazardDetectionResponse {
  success: boolean;
  data: {
    timestamp: string;
    location: any;
    detections: HazardDetection[];
    critical: boolean;
    highestPriority: HazardDetection | null;
    metadata?: {
      sampleRate: number;
      duration: number;
      processingTime?: number;
    };
  };
}

export interface CriticalSafetyCheckPayload {
  soundId?: string | null;
  userId: string;
  hazardType?: string | null;
  childConfirmedSafe: boolean;
  responses: Array<{
    question: string;
    answer: boolean;
  }>;
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;

