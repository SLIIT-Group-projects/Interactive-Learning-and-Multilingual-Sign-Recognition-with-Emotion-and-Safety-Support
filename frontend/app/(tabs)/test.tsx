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
  const isRestartingRef = useRef<boolean>(false); // Lock to prevent concurrent restarts
  const restartPromiseRef = useRef<Promise<Audio.Recording | null> | null>(null);
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
          console.warn('⚠️ No recording ref available, trying to restart...');
          // Try to restart recording if it's missing
          if (isListeningRef.current) {
            try {
              const restarted = await restartRecording();
              if (restarted) {
                setRecording(restarted);
                recordingRef.current = restarted;
                console.log('✅ Recording restarted (was missing)');
              } else {
                console.error('❌ Failed to restart missing recording');
              }
            } catch (restartError) {
              console.error('❌ Error restarting missing recording:', restartError);
            }
          }
          return;
        }
        
        // Use a ref to track listening state instead of closure
        if (!isListeningRef.current) {
          console.warn('⚠️ Not listening (ref), clearing interval');
          // Stop the interval if we're not listening anymore
          if (processingIntervalRef.current) {
            clearInterval(processingIntervalRef.current);
            processingIntervalRef.current = null;
          }
          return;
        }
        
        try {
          const status = await currentRecording.getStatusAsync();
          console.log('📊 Recording status:', { isRecording: status.isRecording, canRecord: status.canRecord });
          
          if (status.isRecording) {
            console.log('✅ Recording is active, processing chunk...');
            await processAudioChunk(currentRecording);
          } else {
            console.warn('⚠️ Recording is not active, trying to restart...');
            // Recording stopped unexpectedly - restart it instead of stopping
            try {
              const restarted = await restartRecording();
              if (restarted) {
                setRecording(restarted);
                recordingRef.current = restarted;
                console.log('✅ Recording restarted successfully');
              } else {
                console.error('❌ Failed to restart recording');
              }
            } catch (restartError) {
              console.error('❌ Error restarting recording:', restartError);
            }
          }
        } catch (error: any) {
          console.error('❌ Error checking recording status:', error);
          console.error('❌ Error details:', error.message, error.stack);
          // Don't stop the interval - try to restart recording instead
          if (isListeningRef.current) {
            try {
              console.log('🔄 Attempting to restart recording after error...');
              const restarted = await restartRecording();
              if (restarted) {
                setRecording(restarted);
                recordingRef.current = restarted;
                console.log('✅ Recording restarted after error');
              }
            } catch (restartError) {
              console.error('❌ Failed to restart recording after error:', restartError);
            }
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
        console.warn('⚠️ Recording is not active, trying to restart...');
        // CRITICAL: If recording stopped, restart it to keep listening
        if (isListeningRef.current) {
          try {
            newRecording = await restartRecording();
            if (newRecording) {
              setRecording(newRecording);
              recordingRef.current = newRecording;
              console.log('✅ Recording restarted (was not active)');
            }
          } catch (restartError) {
            console.error('❌ Failed to restart inactive recording:', restartError);
          }
        }
        return;
      }

      // Stop and unload to finalize the recording file
      await recording.stopAndUnloadAsync();
      
      // Small delay to ensure file is fully written
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const uri = recording.getURI();
      
      if (!uri) {
        console.warn('⚠️ No audio URI available after stopping recording');
        // CRITICAL: Always restart recording even if URI is missing to keep listening
        if (isListeningRef.current) {
          newRecording = await restartRecording();
          if (newRecording) {
            setRecording(newRecording);
            recordingRef.current = newRecording;
            console.log('✅ Recording restarted after missing URI');
          }
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

      // ALWAYS restart recording for the next chunk - this is critical for continuous listening
      console.log('🔄 Restarting recording for next chunk...');
      let retries = 3;
      while (retries > 0 && isListeningRef.current) {
        try {
          newRecording = await restartRecording();
          if (newRecording) {
            setRecording(newRecording);
            recordingRef.current = newRecording;
            console.log('✅ Recording restarted successfully for next chunk');
            break;
          } else {
            console.warn(`⚠️ Restart failed, ${retries - 1} retries left`);
            retries--;
            await new Promise(resolve => setTimeout(resolve, 500)); // Wait before retry
          }
        } catch (restartError: any) {
          console.error(`❌ Error restarting recording (${retries} retries left):`, restartError);
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 500)); // Wait before retry
          }
        }
      }
      
      if (!newRecording && isListeningRef.current) {
        console.error('❌ Failed to restart recording after all retries');
        setError('Failed to keep listening. Please try stopping and starting again.');
      }
    } catch (error: any) {
      console.error('❌ Error processing audio:', error);
      setError(`Processing failed: ${error.message}`);
      // CRITICAL: Always try to restart recording even on error to keep listening
      if (isListeningRef.current) {
        console.log('🔄 Attempting to restart recording after processing error...');
        let retries = 3;
        while (retries > 0 && isListeningRef.current) {
          try {
            newRecording = await restartRecording();
            if (newRecording) {
              setRecording(newRecording);
              recordingRef.current = newRecording;
              console.log('✅ Recording restarted after error');
              break;
            } else {
              retries--;
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          } catch (restartError: any) {
            console.error(`❌ Error restarting after processing error (${retries} retries left):`, restartError);
            retries--;
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        }
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const restartRecording = async (): Promise<Audio.Recording | null> => {
    // If already restarting, wait for the existing restart to complete
    if (isRestartingRef.current && restartPromiseRef.current) {
      console.log('⏳ Already restarting, waiting for existing restart...');
      try {
        return await restartPromiseRef.current;
      } catch (error) {
        // If the existing restart failed, try again
        console.log('⚠️ Existing restart failed, will try again');
      }
    }

    // Set lock to prevent concurrent restarts
    isRestartingRef.current = true;
    
    const restartPromise = (async (): Promise<Audio.Recording | null> => {
      try {
        if (!isListeningRef.current) {
          console.warn('⚠️ Cannot restart recording - not listening');
          return null;
        }

        // Clean up old recording first if it exists
        const oldRecording = recordingRef.current;
        if (oldRecording) {
          try {
            const status = await oldRecording.getStatusAsync();
            if (status.isRecording || status.canRecord) {
              console.log('🛑 Stopping old recording before restart...');
              await oldRecording.stopAndUnloadAsync();
            }
          } catch (cleanupError: any) {
            // Ignore cleanup errors (already stopped, etc.)
            if (!cleanupError.message?.includes('already been unloaded')) {
              console.warn('⚠️ Error cleaning up old recording:', cleanupError.message);
            }
          }
          // Clear the ref
          recordingRef.current = null;
        }

        // Small delay to ensure cleanup is complete
        await new Promise(resolve => setTimeout(resolve, 100));

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

        console.log('🔄 Recording restarted successfully');
        return newRec;
      } catch (error: any) {
        console.error('❌ Error restarting recording:', error);
        throw error;
      } finally {
        // Release lock
        isRestartingRef.current = false;
        restartPromiseRef.current = null;
      }
    })();

    // Store the promise so other calls can wait for it
    restartPromiseRef.current = restartPromise;
    
    return restartPromise;
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
      
      // Set listening flag to false FIRST to stop all processing
      setIsListening(false);
      isListeningRef.current = false;
      
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
    if (error) return '#FF6B6B'; // Friendly red
    if (detections?.critical) return '#FF4444'; // Bright red for danger
    if (detections?.highestPriority) {
      const urgency = detections.highestPriority.urgency;
      if (urgency === 'critical') return '#FF4444'; // Bright red
      if (urgency === 'high') return '#FF9800'; // Orange
      if (urgency === 'medium') return '#FFC107'; // Yellow/Amber
      return '#4CAF50'; // Green
    }
    if (isListening) return '#4CAF50'; // Friendly green
    return '#9E9E9E'; // Light gray
  };

  const getStatusEmoji = () => {
    if (error) return '😟';
    if (detections?.critical) return '🚨';
    if (detections?.highestPriority) {
      const urgency = detections.highestPriority.urgency;
      if (urgency === 'critical') return '🚨';
      if (urgency === 'high') return '⚠️';
      if (urgency === 'medium') return '⚡';
      return '💡';
    }
    if (isListening) return isProcessing ? '👂' : '👂';
    return '😊';
  };

  const getStatusMessage = () => {
    if (error) return 'Something went wrong';
    if (detections?.critical) return 'DANGER! Be careful!';
    if (detections?.highestPriority) {
      const urgency = detections.highestPriority.urgency;
      if (urgency === 'critical') return 'DANGER! Be careful!';
      if (urgency === 'high') return 'Watch out!';
      if (urgency === 'medium') return 'Be aware!';
      return 'Something to notice';
    }
    if (isListening) return isProcessing ? 'Listening...' : 'I\'m listening!';
    return 'Ready to listen!';
  };

  return (
    <ScrollView 
      style={styles.scrollContainer}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={true}
    >
      <Text style={styles.title}>👂 Sound Helper</Text>
      <Text style={styles.subtitle}>I help you know about sounds around you!</Text>
      
      {/* Large Status Indicator */}
      <View style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]}>
        <Text style={styles.statusEmoji}>{getStatusEmoji()}</Text>
        <Text style={styles.statusText}>{getStatusMessage()}</Text>
      </View>

      {/* Large Control Buttons */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.button, styles.startButton, isListening && styles.buttonDisabled]}
          onPress={startListening}
          disabled={isListening}
        >
          <Text style={styles.buttonEmoji}>▶️</Text>
          <Text style={styles.buttonText}>Start Listening</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.stopButton, !isListening && styles.buttonDisabled]}
          onPress={stopListening}
          disabled={!isListening}
        >
          <Text style={styles.buttonEmoji}>⏸️</Text>
          <Text style={styles.buttonText}>Stop</Text>
        </TouchableOpacity>
      </View>

      {/* Error Message - Child Friendly */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>😟</Text>
          <Text style={styles.errorText}>Oops! Something went wrong.</Text>
          <Text style={styles.errorHelpText}>Ask a grown-up for help!</Text>
        </View>
      )}

      {/* Big Alert Message - Child Friendly */}
      {alertMessage && detections?.highestPriority && (
        <Animated.View
          style={[
            styles.alertContainer,
            {
              backgroundColor: hazardAlertService.getAlertColor(detections.highestPriority.urgency),
              opacity: flashAnimation.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0.7],
              }),
            },
          ]}
        >
          <Text style={styles.alertEmoji}>
            {detections.highestPriority.urgency === 'critical' ? '🚨' :
             detections.highestPriority.urgency === 'high' ? '⚠️' :
             detections.highestPriority.urgency === 'medium' ? '⚡' : '💡'}
          </Text>
          <Text style={styles.alertText}>{alertMessage}</Text>
          <TouchableOpacity onPress={dismissAlert} style={styles.dismissButton}>
            <Text style={styles.dismissText}>✓ Got it!</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Detection Results - Simplified for Kids */}
      {detections && detections.detections.length > 0 && (
        <View style={styles.resultsContainer}>
          <Text style={styles.resultsTitle}>🔍 What I Found:</Text>
          <ScrollView 
            style={styles.detectionsList}
            nestedScrollEnabled={true}
          >
            {detections.detections.map((detection, index) => (
              <View key={index} style={styles.detectionItem}>
                <Text style={styles.detectionEmoji}>
                  {detection.urgency === 'critical' ? '🚨' :
                   detection.urgency === 'high' ? '⚠️' :
                   detection.urgency === 'medium' ? '⚡' : '💡'}
                </Text>
                <View style={styles.detectionContent}>
                  <Text style={styles.detectionType}>
                    {detection.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Text>
                  <Text style={styles.detectionUrgency}>
                    {detection.urgency === 'critical' ? 'Very Important!' :
                     detection.urgency === 'high' ? 'Important!' :
                     detection.urgency === 'medium' ? 'Notice!' : 'Info'}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Processing Indicator - Fun for Kids */}
      {isProcessing && (
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.processingText}>👂 Listening to sounds...</Text>
          <Text style={styles.processingSubtext}>This will just take a moment!</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    backgroundColor: '#F0F8FF', // Light blue background - friendly and bright
  },
  container: {
    padding: 20,
    paddingBottom: 40, // Extra padding at bottom for better scrolling
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#4A90E2', // Friendly blue
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    fontStyle: 'italic',
  },
  statusIndicator: {
    padding: 25,
    borderRadius: 20,
    marginBottom: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusEmoji: {
    fontSize: 60,
    marginBottom: 10,
  },
  statusText: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 30,
    gap: 15,
  },
  button: {
    flex: 1,
    paddingVertical: 25,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
    minHeight: 100,
  },
  startButton: {
    backgroundColor: '#4CAF50', // Friendly green
  },
  stopButton: {
    backgroundColor: '#FF6B6B', // Friendly red
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  errorContainer: {
    backgroundColor: '#FFE5E5',
    padding: 20,
    borderRadius: 15,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  errorEmoji: {
    fontSize: 50,
    marginBottom: 10,
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5,
  },
  errorHelpText: {
    color: '#666',
    fontSize: 16,
    textAlign: 'center',
  },
  alertContainer: {
    padding: 25,
    borderRadius: 20,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  alertEmoji: {
    fontSize: 60,
    marginBottom: 15,
  },
  alertText: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
  },
  dismissButton: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  dismissText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  resultsContainer: {
    maxHeight: 300,
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  resultsTitle: {
    color: '#4A90E2',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  detectionsList: {
    maxHeight: 250,
  },
  detectionItem: {
    backgroundColor: '#F5F5F5',
    padding: 15,
    borderRadius: 15,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  detectionEmoji: {
    fontSize: 40,
    marginRight: 15,
  },
  detectionContent: {
    flex: 1,
  },
  detectionType: {
    color: '#333',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  detectionUrgency: {
    color: '#666',
    fontSize: 16,
  },
  processingContainer: {
    alignItems: 'center',
    marginTop: 30,
    padding: 20,
  },
  processingText: {
    color: '#4CAF50',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 15,
  },
  processingSubtext: {
    color: '#999',
    fontSize: 16,
    marginTop: 5,
  },
});
