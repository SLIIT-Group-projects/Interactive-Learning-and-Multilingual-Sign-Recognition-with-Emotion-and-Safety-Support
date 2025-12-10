import React, { useEffect, useState, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  Alert,
  ActivityIndicator,
  Animated
} from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import apiService, { HazardDetectionResponse } from '../../services/api.service';
import hazardAlertService from '../../services/hazardAlert.service';

export default function HazardDetectionScreen() {
  const [permissionResponse, requestPermission] = Audio.usePermissions();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detections, setDetections] = useState<HazardDetectionResponse['data'] | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const processingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const isListeningRef = useRef<boolean>(false);
  const flashAnimation = useRef(new Animated.Value(0)).current;

  const checkBackendHealth = async () => {
    try {
      await apiService.checkHealth();
      console.log('✅ Backend is healthy');
    } catch (error: any) {
      console.error('❌ Backend health check failed:', error.message);
      setError(`Backend connection failed: ${error.message}. Please ensure the backend server is running.`);
    }
  };

  useEffect(() => {
    // Request permissions on mount
    if (!permissionResponse?.granted) {
      requestPermission();
    }

    // Check backend health on mount
    checkBackendHealth();

    // Cleanup on unmount only (not when recording changes)
    return () => {
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
        processingIntervalRef.current = null;
      }
      hazardAlertService.stopAlert();
      // Stop recording if active and not already unloaded
      const currentRecording = recordingRef.current;
      if (currentRecording) {
        currentRecording.getStatusAsync()
          .then((status) => {
            // Only stop if still recording or loaded
            if (status.isRecording || status.canRecord) {
              return currentRecording.stopAndUnloadAsync();
            }
          })
          .catch((error) => {
            // Ignore "already unloaded" errors - this is expected
            if (!error.message?.includes('already been unloaded')) {
              console.error('Error stopping recording in cleanup:', error);
            }
          });
      }
      recordingRef.current = null;
    };
  }, []); // Empty dependency array - only run on mount/unmount

  const startListening = async () => {
    try {
      // Request permission if not granted
      if (!permissionResponse?.granted) {
        const { granted } = await requestPermission();
        if (!granted) {
          Alert.alert('Permission Required', 'Microphone permission is required for hazard detection.');
          return;
        }
      }

    console.log('🎤 Starting microphone...');
      
      // Configure audio mode
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
    });

      // Start recording
      const { recording: newRecording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );

      setRecording(newRecording);
      recordingRef.current = newRecording;
      console.log('✅ Recording ref set:', recordingRef.current ? 'success' : 'failed');
      console.log('✅ Recording object:', newRecording ? 'exists' : 'null');
      setIsListening(true);
      isListeningRef.current = true;
      setError(null);
      setAlertMessage(null);
      
      // Verify ref is still set after state updates
      setTimeout(() => {
        console.log('🔍 Verifying ref after state update:', recordingRef.current ? 'exists' : 'null');
      }, 100);

      // Process audio chunks every 3 seconds
      // We need to stop recording, send the chunk, then start a new recording
      processingIntervalRef.current = setInterval(async () => {
        console.log('⏰ Interval triggered - checking recording...');
        // Check if recording is still active using ref
        const currentRecording = recordingRef.current;
        console.log('📹 Current recording:', currentRecording ? 'exists' : 'null');
        console.log('🎧 isListening state:', isListening);
        
        if (!currentRecording) {
          console.warn('⚠️ No recording ref available');
          return;
        }
        
        // Use a ref to track listening state instead of closure
        if (!isListeningRef.current) {
          console.warn('⚠️ Not listening (ref), skipping chunk processing');
          return;
        }
        
        try {
          const status = await currentRecording.getStatusAsync();
          console.log('📊 Recording status:', { isRecording: status.isRecording, canRecord: status.canRecord });
          
          if (status.isRecording) {
            console.log('✅ Recording is active, processing chunk...');
            await processAudioChunk(currentRecording);
          } else {
            console.warn('⚠️ Recording is not active, clearing interval');
            // Recording stopped, clear interval
            if (processingIntervalRef.current) {
              clearInterval(processingIntervalRef.current);
              processingIntervalRef.current = null;
            }
          }
        } catch (error: any) {
          console.error('❌ Error checking recording status:', error);
          console.error('❌ Error details:', error.message, error.stack);
          // If there's an error, stop the interval
          if (processingIntervalRef.current) {
            clearInterval(processingIntervalRef.current);
            processingIntervalRef.current = null;
          }
        }
      }, 3000);
      
      console.log('✅ Interval set up, will trigger every 3 seconds');
      
      // Process first chunk immediately after a short delay (to ensure recording has started)
      setTimeout(async () => {
        try {
          console.log('🚀 Processing first audio chunk immediately...');
          const firstRecording = recordingRef.current;
          console.log('📹 First recording ref:', firstRecording ? 'exists' : 'null');
          console.log('🎧 isListeningRef:', isListeningRef.current);
          
          if (!firstRecording) {
            console.error('❌ No recording ref available for first chunk');
            return;
          }
          
          if (!isListeningRef.current) {
            console.error('❌ Not listening, cannot process first chunk');
            return;
          }
          
          console.log('📊 Getting recording status for first chunk...');
          const status = await firstRecording.getStatusAsync();
          console.log('📊 First chunk recording status:', { 
            isRecording: status.isRecording, 
            canRecord: status.canRecord,
            durationMillis: status.durationMillis 
          });
          
          if (status.isRecording) {
            console.log('✅ Recording is active, calling processAudioChunk...');
            await processAudioChunk(firstRecording);
            console.log('✅ Finished processing first chunk');
          } else {
            console.warn('⚠️ Recording is not active for first chunk, status:', JSON.stringify(status));
          }
        } catch (error: any) {
          console.error('❌ Error in first chunk setTimeout:', error);
          console.error('❌ Error message:', error?.message);
          console.error('❌ Error stack:', error?.stack);
          console.error('❌ Full error:', JSON.stringify(error, null, 2));
        }
      }, 1000); // Wait 1 second for recording to stabilize

    } catch (error: any) {
      console.error('Error starting recording:', error);
      setError(`Failed to start recording: ${error.message}`);
      Alert.alert('Recording Error', error.message);
    }
  };

  const processAudioChunk = async (recording: Audio.Recording) => {
    let newRecording: Audio.Recording | null = null;
    try {
      console.log('🎵 Processing audio chunk...');
      
      // Stop the current recording to access the file
      const status = await recording.getStatusAsync();
      if (!status.isRecording) {
        console.warn('⚠️ Recording is not active');
        return;
      }

      // Stop and unload to finalize the recording file
      await recording.stopAndUnloadAsync();
      
      // Small delay to ensure file is fully written
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const uri = recording.getURI();
      
      if (!uri) {
        console.warn('⚠️ No audio URI available after stopping recording');
        // Restart recording
        newRecording = await restartRecording();
        if (newRecording) {
          setRecording(newRecording);
          recordingRef.current = newRecording;
        }
        return;
      }

      console.log('📁 Audio URI:', uri);
      setIsProcessing(true);

      // Get current context (time, location, etc.)
      const context = {
        location: {
          type: 'indoor' as const, // TODO: Get actual location
        },
        time: new Date().toISOString(),
      };

      console.log('📤 Sending audio to backend...');
      // Send to backend for hazard detection
      const response: HazardDetectionResponse = await apiService.detectHazards(uri, context);
      console.log('✅ Received response from backend:', response.success);

      if (response.success && response.data) {
        setDetections(response.data);

        // Trigger alerts if hazards detected
        if (response.data.highestPriority) {
          const hazard = response.data.highestPriority;
          setAlertMessage(hazardAlertService.getAlertMessage(hazard));
          
          // Trigger haptic feedback
          await hazardAlertService.triggerAlert(hazard);
          
          // Visual alert animation
          triggerFlashAnimation(hazard.urgency);
        } else {
          setAlertMessage(null);
        }
      }

      // Restart recording for the next chunk
      newRecording = await restartRecording();
      if (newRecording) {
        setRecording(newRecording);
        recordingRef.current = newRecording;
      }
    } catch (error: any) {
      console.error('❌ Error processing audio:', error);
      setError(`Processing failed: ${error.message}`);
      // Try to restart recording even on error
      try {
        newRecording = await restartRecording();
        if (newRecording) {
          setRecording(newRecording);
          recordingRef.current = newRecording;
        }
      } catch (restartError) {
        console.error('❌ Failed to restart recording:', restartError);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const restartRecording = async (): Promise<Audio.Recording | null> => {
    try {
      if (!isListeningRef.current) {
        console.warn('⚠️ Cannot restart recording - not listening');
        return null;
      }

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
      });

      // Start new recording
      const { recording: newRec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      console.log('🔄 Recording restarted');
      return newRec;
    } catch (error: any) {
      console.error('❌ Error restarting recording:', error);
      throw error;
    }
  };

  const triggerFlashAnimation = (urgency: 'low' | 'medium' | 'high' | 'critical') => {
    const color = hazardAlertService.getAlertColor(urgency);
    
    Animated.sequence([
      Animated.timing(flashAnimation, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
      }),
      Animated.timing(flashAnimation, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start();
  };

  const stopListening = async () => {
    try {
    console.log('🛑 Stopping...');
      
      // Clear processing interval
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
        processingIntervalRef.current = null;
      }

      // Stop recording
      if (recording) {
        try {
          const status = await recording.getStatusAsync();
          // Only stop if still recording or loaded
          if (status.isRecording || status.canRecord) {
            await recording.stopAndUnloadAsync();
          }
        } catch (error: any) {
          // Ignore "already unloaded" errors
          if (!error.message?.includes('already been unloaded')) {
            throw error;
          }
        }
        setRecording(null);
        recordingRef.current = null;
      }

      // Stop alerts
      hazardAlertService.stopAlert();

      setIsListening(false);
      isListeningRef.current = false;
      setAlertMessage(null);
      setIsProcessing(false);
    } catch (error: any) {
      console.error('Error stopping recording:', error);
      setError(`Failed to stop recording: ${error.message}`);
    }
  };

  const dismissAlert = () => {
    hazardAlertService.stopAlert();
    setAlertMessage(null);
    setDetections(null);
  };

  const getStatusColor = () => {
    if (error) return '#FF0000';
    if (detections?.critical) return '#FF0000';
    if (detections?.highestPriority) {
      return hazardAlertService.getAlertColor(detections.highestPriority.urgency);
    }
    if (isListening) return '#00FF00';
    return '#888888';
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🚨 Hazard Detection</Text>
      
      {/* Status Indicator */}
      <View style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]}>
        <Text style={styles.statusText}>
          {error ? '⚠️ Error' : 
           isListening ? (isProcessing ? '🔄 Processing...' : '🎤 Listening') : 
           '⏸️ Stopped'}
        </Text>
      </View>

      {/* Control Buttons */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.button, styles.startButton, isListening && styles.buttonDisabled]}
          onPress={startListening}
          disabled={isListening}
        >
          <Text style={styles.buttonText}>▶️ Start Listening</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.stopButton, !isListening && styles.buttonDisabled]}
          onPress={stopListening}
          disabled={!isListening}
        >
          <Text style={styles.buttonText}>⏹️ Stop</Text>
        </TouchableOpacity>
      </View>

      {/* Error Message */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Alert Message */}
      {alertMessage && detections?.highestPriority && (
        <Animated.View
          style={[
            styles.alertContainer,
            {
              backgroundColor: hazardAlertService.getAlertColor(detections.highestPriority.urgency),
              opacity: flashAnimation.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0.5],
              }),
            },
          ]}
        >
          <Text style={styles.alertText}>{alertMessage}</Text>
          <TouchableOpacity onPress={dismissAlert} style={styles.dismissButton}>
            <Text style={styles.dismissText}>✓ Dismiss</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Detection Results */}
      {detections && detections.detections.length > 0 && (
        <ScrollView style={styles.resultsContainer}>
          <Text style={styles.resultsTitle}>Detected Hazards:</Text>
          {detections.detections.map((detection, index) => (
            <View key={index} style={styles.detectionItem}>
              <Text style={styles.detectionType}>
                {detection.type.replace('_', ' ').toUpperCase()}
              </Text>
              <Text style={styles.detectionConfidence}>
                Confidence: {(detection.confidence * 100).toFixed(1)}%
              </Text>
              <Text style={styles.detectionUrgency}>
                Urgency: {detection.urgency.toUpperCase()} (Priority: {detection.priority}/10)
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Processing Indicator */}
      {isProcessing && (
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color="#FFD700" />
          <Text style={styles.processingText}>Analyzing audio...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#000',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  statusIndicator: {
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    alignItems: 'center',
  },
  statusText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
    minWidth: 150,
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: '#00FF00',
  },
  stopButton: {
    backgroundColor: '#FF0000',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorContainer: {
    backgroundColor: '#FF0000',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  errorText: {
    color: '#FFF',
    fontSize: 14,
  },
  alertContainer: {
    padding: 20,
    borderRadius: 10,
    marginBottom: 15,
    alignItems: 'center',
  },
  alertText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  dismissButton: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
  },
  dismissText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  resultsContainer: {
    maxHeight: 200,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  resultsTitle: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  detectionItem: {
    backgroundColor: '#2a2a2a',
    padding: 10,
    borderRadius: 5,
    marginBottom: 8,
  },
  detectionType: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  detectionConfidence: {
    color: '#FFF',
    fontSize: 12,
    marginBottom: 3,
  },
  detectionUrgency: {
    color: '#AAA',
    fontSize: 12,
  },
  processingContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  processingText: {
    color: '#FFD700',
    fontSize: 14,
    marginTop: 10,
  },
});
