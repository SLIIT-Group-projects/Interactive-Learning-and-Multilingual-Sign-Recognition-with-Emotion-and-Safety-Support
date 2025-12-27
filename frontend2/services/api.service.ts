import axios, { AxiosInstance, AxiosError } from 'axios';
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
      return new Error(message);
    } else if (error.request) {
      // Request made but no response received
      const platform = require('react-native').Platform.OS;
      let helpMessage = 'No response from server. ';
      
      if (platform === 'android') {
        helpMessage += 'For Android emulator, ensure backend is running and using http://10.0.2.2:3000. ';
      } else if (platform === 'ios') {
        helpMessage += 'For iOS simulator, ensure backend is running on http://localhost:3000. ';
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
      
      // Create FormData for file upload
      const formData = new FormData();
      
      // Convert URI to blob/file
      const file = await this.uriToFile(audioUri);
      console.log('📦 File object:', { uri: file.uri, name: file.name, type: file.type });
      formData.append('audio', file as any);

      // Add context if provided
      if (context) {
        formData.append('context', JSON.stringify(context));
        console.log('📍 Context:', context);
      }

      console.log('🚀 Sending POST request to:', API_CONFIG.ENDPOINTS.HAZARD_DETECT);
      // Don't set Content-Type - axios will set it automatically with boundary for FormData
      const response = await this.client.post(
        API_CONFIG.ENDPOINTS.HAZARD_DETECT,
        formData
      );

      console.log('✅ Response received:', response.status);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error in detectHazards:', error.message);
      console.error('❌ Error details:', error.response?.data || error);
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
  private async uriToFile(uri: string): Promise<any> {
    try {
      // For React Native, FormData accepts file URIs directly
      // Extract filename and type from URI
      const filename = uri.split('/').pop() || 'audio.wav';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `audio/${match[1]}` : 'audio/wav';

      // React Native FormData format
      // The format should be: { uri, name, type }
      return {
        uri: uri.startsWith('file://') ? uri : `file://${uri}`,
        name: filename,
        type: type,
      } as any;
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

// Export singleton instance
export const apiService = new ApiService();
export default apiService;

