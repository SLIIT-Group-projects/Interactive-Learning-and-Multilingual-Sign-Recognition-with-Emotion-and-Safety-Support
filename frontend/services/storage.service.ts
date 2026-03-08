/**
 * Firebase Storage Service
 * Handles uploading audio recordings to Firebase Storage
 */

import { ref, uploadBytes, getDownloadURL, UploadResult, deleteObject } from 'firebase/storage';
import { storage } from '../utils/firebase.config';
import { authService } from './auth.service';

class StorageService {
  private readonly AUDIO_FOLDER = 'audio-recordings';

  /**
   * Upload audio recording to Firebase Storage (deprecated - use uploadAudioRecordingSimple)
   * @deprecated Use uploadAudioRecordingSimple instead
   */
  async uploadAudioRecording(
    audioUri: string,
    metadata?: {
      timestamp?: string;
      location?: { latitude?: number; longitude?: number };
      detections?: any[];
      [key: string]: any;
    }
  ): Promise<string> {
    return this.uploadAudioRecordingSimple(audioUri, metadata);
  }

  /**
   * Upload audio recording with a simpler approach (for React Native)
   * Uses FormData-compatible approach
   */
  async uploadAudioRecordingSimple(
    audioUri: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    try {
      const user = authService.getCurrentUser();
      if (!user) {
        throw new Error('User must be authenticated to upload recordings');
      }

      // Read file as blob using fetch
      const response = await fetch(audioUri);
      const blob = await response.blob();

      // Create a unique filename
      const timestamp = Date.now();
      const filename = `recording-${user.uid}-${timestamp}.wav`;
      const storagePath = `${this.AUDIO_FOLDER}/${user.uid}/${filename}`;

      // Create storage reference
      const storageRef = ref(storage, storagePath);

      // Create custom metadata
      const customMetadata: { [key: string]: string } = {
        uploadedBy: user.uid,
        uploadedAt: new Date().toISOString(),
      };

      if (metadata) {
        Object.keys(metadata).forEach(key => {
          customMetadata[key] = typeof metadata[key] === 'string' 
            ? metadata[key] 
            : JSON.stringify(metadata[key]);
        });
      }

      // Upload the file
      console.log('📤 Uploading audio to Firebase Storage...');
      const uploadResult: UploadResult = await uploadBytes(storageRef, blob, {
        customMetadata,
        contentType: 'audio/wav',
      });

      // Get download URL
      const downloadURL = await getDownloadURL(uploadResult.ref);
      console.log('✅ Audio uploaded successfully:', downloadURL);

      return downloadURL;
    } catch (error: any) {
      console.error('❌ Error uploading audio:', error);
      throw new Error(error.message || 'Failed to upload audio recording');
    }
  }

  /**
   * Delete an audio recording from Firebase Storage
   */
  async deleteAudioRecording(storagePath: string): Promise<void> {
    try {
      const storageRef = ref(storage, storagePath);
      await deleteObject(storageRef);
      console.log('✅ Audio deleted successfully');
    } catch (error: any) {
      console.error('❌ Error deleting audio:', error);
      throw new Error(error.message || 'Failed to delete audio recording');
    }
  }
}

// Export singleton instance
export const storageService = new StorageService();
export default storageService;

