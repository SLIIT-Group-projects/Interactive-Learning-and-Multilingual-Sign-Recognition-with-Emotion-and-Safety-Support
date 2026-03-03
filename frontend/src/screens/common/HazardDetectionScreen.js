import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Alert,
    ActivityIndicator,
    Animated,
    Dimensions,
    Image
} from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import apiService from '../../../services/api.service';
import hazardAlertService from '../../../services/hazardAlert.service';

const { width } = Dimensions.get('window');

const PURPLE_GRADIENT = ['#5452e6ff', '#7C3AED']; // Purple gradient
const GREEN_BUTTON = '#10B981'; // Bright green
const ORANGE_ACCENT = '#F59E0B'; // Orange for accents

export default function HazardDetectionScreen() {
    const [permissionResponse, requestPermission] = Audio.usePermissions();
    const [recording, setRecording] = useState(null);
    const [isListening, setIsListening] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [detections, setDetections] = useState(null);
    const [alertMessage, setAlertMessage] = useState(null);
    const [error, setError] = useState(null);
    const processingIntervalRef = useRef(null);
    const recordingRef = useRef(null);
    const isListeningRef = useRef(false);
    const isRestartingRef = useRef(false);
    const restartPromiseRef = useRef(null);
    const isProcessingRef = useRef(false);
    const flashAnimation = useRef(new Animated.Value(0)).current;
    const pulseAnimation = useRef(new Animated.Value(1)).current;
    const circleAnimation1 = useRef(new Animated.Value(0)).current;
    const circleAnimation2 = useRef(new Animated.Value(0)).current;
    const circleAnimation3 = useRef(new Animated.Value(0)).current;
    const soundLevelAnimation = useRef(new Animated.Value(0)).current;
    const popupAnimation = useRef(new Animated.Value(0)).current;
    const backdropOpacity = useRef(new Animated.Value(0)).current;
    const navigation = useNavigation();
  const [soundLevel, setSoundLevel] = useState(0.3); // Mock sound level (0-1)

  // Smart detection tracking with temporal smoothing
  // Track recent detections in a sliding window for better accuracy
    const detectionHistoryRef = useRef([]);
  const MAX_HISTORY_SIZE = 5; // Keep last 5 detections (20 seconds of history)
  const ALERT_COOLDOWN_MS = 8000; // Don't alert same hazard within 8 seconds
  const lastAlertTimeRef = useRef(new Map()); // Track last alert time per hazard type

    const getAlertColor = (urgency) => {
        switch (urgency) {
      case 'critical':
        return '#FF3B30'; // Red
      case 'high':
        return '#FF9500'; // Orange
      case 'medium':
        return '#FFCC00'; // Yellow
      case 'low':
        return '#34C759'; // Green
      default:
        return GREEN_BUTTON;
    }
  };

  const checkBackendHealth = async () => {
    try {
      await apiService.checkHealth();
      console.log('✅ Backend is healthy');
    } catch (error) {
      console.error('❌ Backend health check failed:', error.message);
      setError(`Backend connection failed: ${error.message}`);
    }
  };

  // Separate useEffect for animations (runs when isListening changes)
    useEffect(() => {
        if (isListening) {
      // Pulse animation for circles
            Animated.loop(
                Animated.parallel([
                    Animated.sequence([
            Animated.timing(circleAnimation1, {
              toValue: 1,
              duration: 1500,
              useNativeDriver: true,
            }),
            Animated.timing(circleAnimation1, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
                    ]),
                    Animated.sequence([
                        Animated.delay(300),
            Animated.timing(circleAnimation2, {
              toValue: 1,
              duration: 1500,
              useNativeDriver: true,
            }),
            Animated.timing(circleAnimation2, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
                    ]),
                    Animated.sequence([
                        Animated.delay(600),
            Animated.timing(circleAnimation3, {
              toValue: 1,
              duration: 1500,
              useNativeDriver: true,
            }),
            Animated.timing(circleAnimation3, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
                    ]),
                ])
            ).start();

      // Sound level animation
            Animated.loop(
                Animated.sequence([
          Animated.timing(soundLevelAnimation, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: false,
          }),
          Animated.timing(soundLevelAnimation, {
            toValue: 0.2,
            duration: 2000,
            useNativeDriver: false,
          }),
                ])
            ).start();
        } else {
            pulseAnimation.setValue(1);
            circleAnimation1.setValue(0);
            circleAnimation2.setValue(0);
            circleAnimation3.setValue(0);
            soundLevelAnimation.setValue(0);
        }
    }, [isListening]);

  // Separate useEffect for initialization and cleanup (only runs on mount/unmount)
    useEffect(() => {
        if (!permissionResponse?.granted) {
            requestPermission();
        }
    checkBackendHealth();

    // Cleanup on unmount only (not when recording changes)
        return () => {
            if (processingIntervalRef.current) {
                clearInterval(processingIntervalRef.current);
        processingIntervalRef.current = null;
            }
      // Stop any ongoing alerts
      if (hazardAlertService && typeof hazardAlertService.stopAlert === 'function') {
                hazardAlertService.stopAlert();
            }
      const currentRecording = recordingRef.current;
      if (currentRecording) {
        currentRecording.getStatusAsync()
          .then((status) => {
            if (status.isRecording || status.canRecord) {
              return currentRecording.stopAndUnloadAsync();
            }
          })
          .catch((error) => {
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
            if (!permissionResponse?.granted) {
                const { granted } = await requestPermission();
                if (!granted) {
                    Alert.alert('Permission Required', 'Microphone permission is required for hazard detection.');
                    return;
                }
            }

      console.log('🎤 Starting microphone...');

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
                staysActiveInBackground: true,
                shouldDuckAndroid: false,
            });

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

      // Process audio chunks every 4 seconds
      // Track recording start time to ensure we capture full 4-second chunks
      const CHUNK_DURATION_MS = 4000; // 4 seconds
      const MIN_CHUNK_DURATION_MS = 3500; // Minimum 3.5 seconds to account for processing delays

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
          const durationSeconds = (status.durationMillis || 0) / 1000;
          console.log('📊 Recording status:', {
            isRecording: status.isRecording,
            canRecord: status.canRecord,
            durationSeconds: durationSeconds.toFixed(2)
          });

          if (status.isRecording) {
            // Only process if recording has been running for at least MIN_CHUNK_DURATION_MS
            if (status.durationMillis && status.durationMillis >= MIN_CHUNK_DURATION_MS) {
              console.log(`✅ Recording is active (${durationSeconds.toFixed(2)}s), processing chunk...`);
              await processAudioChunk(currentRecording);
            } else {
              console.log(`⏳ Recording too short (${durationSeconds.toFixed(2)}s), waiting for ${(MIN_CHUNK_DURATION_MS / 1000).toFixed(1)}s minimum...`);
            }
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
        } catch (error) {
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
      }, CHUNK_DURATION_MS); // Process every 4 seconds

      console.log(`✅ Interval set up, will trigger every ${CHUNK_DURATION_MS / 1000} seconds`);

      // Process first chunk after 4 seconds (not 1 second) to ensure full duration
      setTimeout(async () => {
        try {
          console.log('🚀 Processing first audio chunk after 4 seconds...');
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
          const durationSeconds = (status.durationMillis || 0) / 1000;
          console.log('📊 First chunk recording status:', {
            isRecording: status.isRecording,
            canRecord: status.canRecord,
            durationSeconds: durationSeconds.toFixed(2)
          });

          if (status.isRecording && status.durationMillis && status.durationMillis >= MIN_CHUNK_DURATION_MS) {
            console.log(`✅ Recording is active (${durationSeconds.toFixed(2)}s), calling processAudioChunk...`);
            await processAudioChunk(firstRecording);
            console.log('✅ Finished processing first chunk');
          } else {
            console.warn(`⚠️ Recording not ready for first chunk (duration: ${durationSeconds.toFixed(2)}s, min: ${(MIN_CHUNK_DURATION_MS / 1000).toFixed(1)}s)`);
          }
        } catch (error) {
          console.error('❌ Error in first chunk setTimeout:', error);
          console.error('❌ Error message:', error?.message);
          console.error('❌ Error stack:', error?.stack);
          console.error('❌ Full error:', JSON.stringify(error, null, 2));
        }
      }, CHUNK_DURATION_MS); // Wait 4 seconds for full chunk

    } catch (error) {
      console.error('Error starting recording:', error);
            setError(`Failed to start recording: ${error.message}`);
      Alert.alert('Recording Error', error.message);
    }
  };

  const processAudioChunk = async (recording) => {
    let newRecording = null;
    try {
      // Get status before stopping to log duration
      const statusBeforeStop = await recording.getStatusAsync();
      const durationSeconds = (statusBeforeStop.durationMillis || 0) / 1000;
      console.log(`🎵 Processing audio chunk (duration: ${durationSeconds.toFixed(2)}s)...`);

      // Stop the current recording to access the file
      if (!statusBeforeStop.isRecording) {
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

            setIsProcessing(true);
            isProcessingRef.current = true;

      // Stop and unload to finalize the recording file
      await recording.stopAndUnloadAsync();

      // Small delay to ensure file is fully written
      await new Promise(resolve => setTimeout(resolve, 100));

      const uri = recording.getURI();

      if (!uri) {
        console.warn('⚠️ No audio URI available after stopping recording');
        setIsProcessing(false);
        isProcessingRef.current = false;
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

      // Get current context (time, location, etc.)
      const context = {
        location: {
          type: 'indoor', // TODO: Get actual location
        },
        time: new Date().toISOString(),
      };

      console.log('📤 Sending audio to backend...');
      // Send to backend for hazard detection
      const response = await apiService.detectHazards(uri, context);
      console.log('✅ Received response from backend:', response.success);

                if (response.success && response.data) {
                    setDetections(response.data);

        // Smart confidence-based alerting system
        if (response.data.highestPriority) {
          const hazard = response.data.highestPriority;
          const hazardType = hazard.type;
          // Get confidence, priority, and urgency - with fallbacks
          const confidence = hazard.confidence || 0;
          // If priority is missing, try to get it from detections array or use default
          let priority = hazard.priority;
          if (priority === undefined || priority === null) {
            // Try to find in detections array
            const detectionInArray = response.data.detections?.find((d) => d.type === hazardType);
            priority = detectionInArray?.priority || 0;
          }
          priority = priority || 0;

          let urgency = hazard.urgency;
          if (!urgency) {
            // Determine urgency from priority if not provided
            if (priority >= 9) urgency = 'critical';
            else if (priority >= 7) urgency = 'high';
            else if (priority >= 5) urgency = 'medium';
            else urgency = 'low';
          }

          const now = Date.now();

          // Debug: Log the full hazard object
          console.log('📊 Full hazard object:', JSON.stringify(hazard, null, 2));
          console.log(`📊 Extracted values: type=${hazardType}, confidence=${confidence}, priority=${priority}, urgency=${urgency}`);

          // Add to detection history
          const detection = {
            type: hazardType,
            confidence,
            priority,
            timestamp: now
          };

          detectionHistoryRef.current.push(detection);
          // Keep only recent detections (last MAX_HISTORY_SIZE)
          if (detectionHistoryRef.current.length > MAX_HISTORY_SIZE) {
            detectionHistoryRef.current.shift();
          }

          // Debug logging
          console.log(`🔍 Detection: ${hazardType}, confidence: ${(confidence * 100).toFixed(1)}%, priority: ${priority}, urgency: ${urgency}`);

          // Check cooldown - don't alert same hazard too frequently
          const lastAlertTime = lastAlertTimeRef.current.get(hazardType) || 0;
          const timeSinceLastAlert = now - lastAlertTime;
          const isOnCooldown = timeSinceLastAlert < ALERT_COOLDOWN_MS;

          if (isOnCooldown) {
            console.log(`⏳ ${hazardType} alert on cooldown (${Math.round(timeSinceLastAlert / 1000)}s ago)`);
            // Don't return - continue to check rules but skip alerting if on cooldown
          }

          // Smart alerting rules based on confidence and priority
          let shouldAlert = false;
          let alertReason = '';

          // Rule 1: Critical hazards (fire, gunshot) with high confidence - alert immediately
          if (priority >= 9 && confidence >= 0.75) {
            shouldAlert = true;
            alertReason = `Critical hazard with high confidence (${(confidence * 100).toFixed(0)}%)`;
            console.log(`✅ Rule 1 matched: priority ${priority} >= 9, confidence ${(confidence * 100).toFixed(1)}% >= 75%`);
          }
          // Rule 2: High priority hazards (siren, glass breaking) with medium-high confidence - alert immediately
          else if (priority >= 7 && confidence >= 0.70) {
            shouldAlert = true;
            alertReason = `High priority hazard with good confidence (${(confidence * 100).toFixed(0)}%)`;
            console.log(`✅ Rule 2 matched: priority ${priority} >= 7, confidence ${(confidence * 100).toFixed(1)}% >= 70%`);
          }
          // Rule 3: Medium confidence (0.6-0.7) - require 2 out of last 3 detections to be same type
          else if (confidence >= 0.60 && confidence < 0.70) {
            const recentSameType = detectionHistoryRef.current
              .filter(d => d.type === hazardType)
              .slice(-3); // Last 3 detections

            if (recentSameType.length >= 2) {
              shouldAlert = true;
              alertReason = `Confirmed by ${recentSameType.length} recent detections (confidence: ${(confidence * 100).toFixed(0)}%)`;
            } else {
              console.log(`⏳ ${hazardType} needs confirmation (${recentSameType.length}/2 detections, confidence: ${(confidence * 100).toFixed(0)}%)`);
            }
          }
          // Rule 4: Lower confidence (<0.6) - require 3 out of last 5 detections
          else if (confidence >= 0.50) {
            const recentSameType = detectionHistoryRef.current
              .filter(d => d.type === hazardType)
              .slice(-5); // Last 5 detections

            if (recentSameType.length >= 3) {
              shouldAlert = true;
              alertReason = `Confirmed by ${recentSameType.length} recent detections (confidence: ${(confidence * 100).toFixed(0)}%)`;
            } else {
              console.log(`⏳ ${hazardType} needs more confirmation (${recentSameType.length}/3 detections, confidence: ${(confidence * 100).toFixed(0)}%)`);
            }
          }
          // Rule 5: Very low confidence - don't alert
          else {
            console.log(`⏭️ Skipping ${hazardType} - confidence too low (${(confidence * 100).toFixed(0)}%)`);
          }

          // Only alert if shouldAlert is true AND not on cooldown
          if (shouldAlert && !isOnCooldown) {
            console.log(`✅ Alerting: ${hazardType} - ${alertReason}`);

            const message = hazard.type === 'fire_alarm' ? '🔥 Fire alarm detected! Evacuate immediately!' :
              hazard.type === 'smoke_alarm' ? '⚠️ Smoke alarm detected! Check for smoke or fire!' :
                hazard.type === 'siren' ? '🚨 Emergency siren detected nearby!' :
                  hazard.type === 'gun_shot' ? '🔫 Gunshot detected! Stay safe!' :
                    hazard.type === 'glass_breaking' ? '💥 Glass breaking sound detected!' :
                      hazard.type === 'car_horn' ? '🚗 Car horn detected - be careful!' :
                        hazard.type === 'dog' ? '🐕 Dog barking detected!' :
                          hazard.type === 'dog_barking' ? '🐕 Dog barking detected!' :
                            hazard.type === 'crying_baby' ? '👶 Baby crying detected!' :
                              hazard.type === 'baby_crying' ? '👶 Baby crying detected!' :
                                hazard.type === 'coughing' ? '😷 Coughing detected!' :
                                  hazard.type === 'sneezing' ? '🤧 Sneezing detected!' :
                                    hazard.type === 'train' ? '🚂 Train sound detected!' :
                                      hazard.type === 'clock_alarm' ? '⏰ Clock alarm detected!' :
                                        hazard.type === 'crackling_fire' ? '🔥 Fire crackling detected!' :
                                          hazard.type === 'door_wood_knock' ? '🚪 Door knock detected!' :
                                            hazard.type === 'footsteps' ? '👣 Footsteps detected!' :
                                              `Alert: ${hazard.type} detected`;

            setAlertMessage(message);

            // Update last alert time
            lastAlertTimeRef.current.set(hazardType, now);

            // Animate popup in
            showPopup();

            // Trigger haptic feedback
            if (hazardAlertService && typeof hazardAlertService.triggerAlert === 'function') {
              await hazardAlertService.triggerAlert(hazard);
            }

            // Visual alert animation
            triggerFlashAnimation(urgency);
          } else if (shouldAlert && isOnCooldown) {
            console.log(`⏸️ Alert suppressed due to cooldown: ${hazardType}`);
            // Keep detection in history but don't alert
          } else {
            // Don't alert yet, but keep detection in history
            console.log(`⏳ Not alerting yet: ${hazardType} (confidence: ${(confidence * 100).toFixed(1)}%, priority: ${priority})`);
            setAlertMessage(null);
          }
        } else {
          // No detection in this chunk - clear alert but keep history
          setAlertMessage(null);
        }
      } else {
        // No detection - clear alert but keep history
        setAlertMessage(null);
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
        } catch (restartError) {
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
        } catch (error) {
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
          } catch (restartError) {
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
            isProcessingRef.current = false;
        }
    };

  const restartRecording = async () => {
    if (isRestartingRef.current && restartPromiseRef.current) {
      try {
        return await restartPromiseRef.current;
      } catch (error) {
        console.log('⚠️ Existing restart failed, will try again');
      }
    }

    isRestartingRef.current = true;

    const restartPromise = (async () => {
      try {
        if (!isListeningRef.current) {
          return null;
        }

        const oldRecording = recordingRef.current;
        if (oldRecording) {
          try {
            const status = await oldRecording.getStatusAsync();
            if (status.isRecording || status.canRecord) {
              await oldRecording.stopAndUnloadAsync();
            }
          } catch (cleanupError) {
            if (!cleanupError.message?.includes('already been unloaded')) {
              console.warn('⚠️ Error cleaning up old recording:', cleanupError.message);
            }
          }
          recordingRef.current = null;
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: false,
        });

            const { recording: newRec } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );

            return newRec;
      } catch (error) {
        console.error('❌ Error restarting recording:', error);
        throw error;
      } finally {
        isRestartingRef.current = false;
        restartPromiseRef.current = null;
      }
    })();

    restartPromiseRef.current = restartPromise;
    return restartPromise;
  };

  const triggerFlashAnimation = (urgency) => {
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

  const showPopup = () => {
    Animated.parallel([
      Animated.spring(popupAnimation, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0.6,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const hidePopup = () => {
    Animated.parallel([
      Animated.timing(popupAnimation, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setAlertMessage(null);
      setDetections(null);
    });
    };

    const stopListening = async () => {
    try {
        setIsListening(false);
        isListeningRef.current = false;

        if (processingIntervalRef.current) {
            clearInterval(processingIntervalRef.current);
        processingIntervalRef.current = null;
        }

        if (recording) {
        try {
          const status = await recording.getStatusAsync();
          if (status.isRecording || status.canRecord) {
            await recording.stopAndUnloadAsync();
          }
        } catch (error) {
          if (!error.message?.includes('already been unloaded')) {
            throw error;
          }
        }
            setRecording(null);
            recordingRef.current = null;
        }

      // Stop any ongoing alerts
      if (hazardAlertService && typeof hazardAlertService.stopAlert === 'function') {
        hazardAlertService.stopAlert();
      }
      setAlertMessage(null);

      // Clear detection history when stopping
      detectionHistoryRef.current = [];
      lastAlertTimeRef.current.clear();
      setIsProcessing(false);
      isProcessingRef.current = false;
    } catch (error) {
      console.error('Error stopping recording:', error);
      setError(`Failed to stop recording: ${error.message}`);
    }
    };

    const dismissAlert = () => {
    if (hazardAlertService && typeof hazardAlertService.stopAlert === 'function') {
      hazardAlertService.stopAlert();
    }
        hidePopup();
    // Note: We keep detection history even after dismissing alert
    // This allows the system to still track patterns
  };

  const formatHazardType = (type) => {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

    return (
        <View style={styles.container}>
      {/* Main Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
                {isListening ? (
          /* Listening Screen */
                    <View style={styles.listeningContainer}>
                        <Text style={styles.shhhTitle}>Shhh...</Text>
                        <Text style={styles.listeningSubtitle}>Dino is listening!</Text>

            {/* Dinosaur with Concentric Circles */}
                        <View style={styles.dinoContainer}>
              {/* Outer Circle 3 */}
              <Animated.View
                style={[
                  styles.concentricCircle,
                  styles.circle3,
                  {
                    opacity: circleAnimation3.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 0.3],
                    }),
                    transform: [{
                      scale: circleAnimation3.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.5],
                      }),
                    }],
                  },
                ]}
              />
              {/* Middle Circle 2 */}
              <Animated.View
                style={[
                  styles.concentricCircle,
                  styles.circle2,
                  {
                    opacity: circleAnimation2.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 0.4],
                    }),
                    transform: [{
                      scale: circleAnimation2.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.3],
                      }),
                    }],
                  },
                ]}
              />
              {/* Inner Circle 1 */}
              <Animated.View
                style={[
                  styles.concentricCircle,
                  styles.circle1,
                  {
                    opacity: circleAnimation1.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 0.5],
                    }),
                    transform: [{
                      scale: circleAnimation1.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.2],
                      }),
                    }],
                  },
                ]}
              />

              {/* Dinosaur Image */}
              <View style={styles.dinoCircle}>
                <Image
                  source={require('../../../assets/images/dino-listening.png')}
                  style={styles.dinoImage}
                  resizeMode="cover"
                />
              </View>

              {/* Leaf Icons */}
              <View style={styles.leaf1}>
                <View style={styles.leafIcon}>
                  <Text style={styles.leafEmoji}>🍃</Text>
                        </View>
              </View>
              <View style={styles.leaf2}>
                <View style={styles.leafIcon}>
                  <Text style={styles.leafEmoji}>🍃</Text>
                </View>
              </View>
            </View>

            {/* Sound Level Indicator */}
            <View style={styles.soundLevelContainer}>
              <View style={styles.soundLevelHeader}>
                <Text style={styles.soundLevelLabel}>Sound Level</Text>
                <View style={styles.soundWaveIcon}>
                  <Text style={styles.soundWaveEmoji}>📊</Text>
                </View>
              </View>
              <View style={styles.soundLevelBarContainer}>
                <Animated.View
                  style={[
                    styles.soundLevelBar,
                    {
                      width: soundLevelAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['10%', '60%'],
                      }),
                    },
                  ]}
                />
              </View>
              <Text style={styles.detectingText}>DETECTING</Text>
            </View>

            {/* Stop Listening Button */}
            <TouchableOpacity
              style={styles.stopListeningButton}
              onPress={stopListening}>
              <View style={styles.stopButtonIcon}>
                <View style={styles.stopButtonInner} />
              </View>
                            <Text style={styles.stopListeningText}>Stop Listening</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
          /* Initial Screen */
                    <View style={[styles.mainSection, { backgroundColor: PURPLE_GRADIENT[0] }]}>
                        <Text style={styles.mainPrompt}>What's that sound?</Text>
            <Text style={[styles.instruction, { color: ORANGE_ACCENT }]}>Tap the green button!</Text>

            {/* Button Container with Sound Waves and Music Note */}
            <Animated.View
              style={[
                styles.buttonContainer,
                {
                  transform: [{ scale: pulseAnimation }],
                },
              ]}>
              {/* Sound Wave Bars - Left Side */}
              <View style={styles.soundWavesLeft}>
                {[1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.soundWaveBar,
                      {
                        height: 8 + i * 3,
                        backgroundColor: '#FFD700', // Yellow bars
                      },
                    ]}
                  />
                ))}
              </View>

              {/* Large Green Button */}
              <TouchableOpacity
                style={[
                  styles.mainButton,
                  isProcessing && styles.mainButtonProcessing,
                ]}
                onPress={startListening}
                disabled={isProcessing}
              >
                <Text style={styles.micIcon}>🎤</Text>
                            <Text style={styles.buttonText}>START</Text>
                        </TouchableOpacity>

              {/* Musical Note Icon - Right Side */}
              <View style={styles.musicNoteRight}>
                <Text style={styles.musicNoteEmoji}>🎵</Text>
              </View>
            </Animated.View>
                    </View>
                )}

        {/* My Sounds Section - Only show when not listening */}
        {!isListening && (
          <View style={styles.mySoundsSection}>
            <View style={styles.mySoundsHeader}>
              <View style={styles.mySoundsHeaderLeft}>
                <Text style={styles.folderIcon}>📁</Text>
                <Text style={styles.mySoundsTitle}>My Sounds</Text>
              </View>
              <TouchableOpacity style={styles.seeAllButton}>
                <Text style={styles.seeAllText}>See All</Text>
                        </TouchableOpacity>
            </View>

            {/* Detected Sounds Cards */}
            {detections && detections.detections && detections.detections.length > 0 ? (
              <View style={styles.soundsCardsContainer}>
                {detections.detections.slice(0, 2).map((detection, index) => {
                  const hazardEmoji =
                    detection.type === 'fire_alarm' ? '🔥' :
                      detection.type === 'smoke_alarm' ? '💨' :
                        detection.type === 'gun_shot' ? '🔫' :
                          detection.type === 'siren' ? '🚨' :
                            detection.type === 'glass_breaking' ? '💥' :
                              detection.type === 'car_horn' ? '🚗' :
                                detection.type === 'dog_barking' ? '🐕' :
                                  detection.type === 'baby_crying' ? '👶' : '🔊';

                  const cardColors = [
                    { bg: '#FFF5E6', border: '#FFA500' }, // Light orange
                    { bg: '#E6F3FF', border: '#4A90E2' }, // Light blue
                  ];

                  return (
                    <View
                      key={index}
                      style={[
                        styles.soundCard,
                        {
                          backgroundColor: cardColors[index % 2].bg,
                          borderColor: cardColors[index % 2].border,
                        }
                      ]}>
                      <View style={styles.soundCardImage}>
                        <Text style={styles.soundCardEmoji}>{hazardEmoji}</Text>
                      </View>
                      <Text style={styles.soundCardLabel}>
                        {formatHazardType(detection.type)}
                      </Text>
                      <View style={styles.checkmarkBadge}>
                        <Text style={styles.checkmark}>✓</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.noSoundsContainer}>
                <Text style={styles.noSoundsText}>No sounds detected yet</Text>
              </View>
            )}
          </View>
        )}

        {/* Critical Alert Full Screen Overlay */}
        {alertMessage && detections?.highestPriority && detections.highestPriority.priority >= 9 && (
          <View style={styles.criticalOverlay}>
            <Animated.View
              style={[
                styles.criticalOverlayBackground,
                {
                  opacity: flashAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1],
                  }),
                }
              ]}
            />
            <View style={styles.criticalContent}>
              <Text style={styles.criticalEmoji}>🚨</Text>
              <Text style={styles.criticalTitle}>DANGER!</Text>
              <Text style={styles.criticalMessage}>{alertMessage}</Text>
              <TouchableOpacity
                style={styles.criticalDismissButton}
                onPress={dismissAlert}
              >
                <Text style={styles.criticalDismissButtonText}>I AM SAFE</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Half-Screen Pop-up Alert for Hazards */}
        {alertMessage && detections?.highestPriority && detections.highestPriority.priority < 9 && (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {/* Backdrop */}
            <Animated.View
              style={[
                styles.popupBackdrop,
                { opacity: backdropOpacity }
              ]}
            >
              <TouchableOpacity
                activeOpacity={1}
                style={StyleSheet.absoluteFill}
                onPress={dismissAlert}
              />
            </Animated.View>

            {/* Pop-up Card */}
            <Animated.View
              style={[
                styles.popupContainer,
                {
                  transform: [{
                    translateY: popupAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [600, 0],
                    })
                  }]
                }
              ]}
            >
              <View style={styles.popupHandle} />

              <View style={styles.popupHeader}>
                <View style={[
                  styles.popupIconContainer,
                  { backgroundColor: getAlertColor(detections.highestPriority.urgency || 'medium') }
                ]}>
                  <Text style={styles.popupEmoji}>
                    {detections.highestPriority.type === 'fire_alarm' ? '🔥' :
                      detections.highestPriority.type === 'smoke_alarm' ? '💨' :
                        detections.highestPriority.type === 'siren' ? '🚨' : '⚠️'}
                  </Text>
                </View>
                <Text style={styles.popupTitle}>HAZARD DETECTED</Text>
              </View>

              <View style={styles.popupContentCard}>
                <Text style={styles.popupHazardName}>
                  {formatHazardType(detections.highestPriority.type)}
                </Text>
                <Text style={styles.popupMessage}>{alertMessage}</Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.popupActionButton,
                  { backgroundColor: getAlertColor(detections.highestPriority.urgency || 'medium') }
                ]}
                onPress={dismissAlert}
              >
                <Text style={styles.popupActionButtonText}>OK, I HEARD IT</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}

        {/* Processing Indicator */}
        {isProcessing && !isListening && (
          <View style={styles.processingIndicator}>
            <ActivityIndicator size="small" color={GREEN_BUTTON} />
            <Text style={[styles.processingText, { color: GREEN_BUTTON }]}>Listening...</Text>
          </View>
        )}

        {/* Error Message */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F3FF', // Light purple background
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
    flexGrow: 1,
  },
  mainSection: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    minHeight: 400,
  },
  listeningContainer: {
    flex: 1,
    backgroundColor: '#E8F4F8', // Light blue-gray background
    paddingHorizontal: 20,
    paddingTop: 20,
    alignItems: 'center',
    minHeight: 600,
  },
  shhhTitle: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  listeningSubtitle: {
    fontSize: 18,
    color: '#6B7280',
    marginBottom: 40,
  },
  dinoContainer: {
    width: 280,
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 30,
    position: 'relative',
  },
  concentricCircle: {
    position: 'absolute',
    borderRadius: 140,
    borderWidth: 2,
    borderColor: '#F59E0B', // Orange
  },
  circle1: {
    width: 200,
    height: 200,
  },
  circle2: {
    width: 240,
    height: 240,
  },
  circle3: {
    width: 280,
    height: 280,
  },
  dinoCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'transparent', // Transparent to show image background
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    overflow: 'visible', // Allow image to extend beyond circle if needed
  },
  dinoImage: {
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  leaf1: {
    position: 'absolute',
    top: 20,
    right: 20,
  },
  leaf2: {
    position: 'absolute',
    bottom: 20,
    left: 20,
  },
  leafIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leafEmoji: {
    fontSize: 20,
  },
  soundLevelContainer: {
    width: '100%',
    marginTop: 40,
    marginBottom: 20,
  },
  soundLevelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  soundLevelLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  soundWaveIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soundWaveEmoji: {
    fontSize: 20,
    color: ORANGE_ACCENT,
  },
  soundLevelBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  soundLevelBar: {
    height: '100%',
    backgroundColor: ORANGE_ACCENT,
    borderRadius: 4,
  },
  detectingText: {
    fontSize: 14,
    fontWeight: '600',
    color: ORANGE_ACCENT,
    textAlign: 'right',
  },
  stopListeningButton: {
    backgroundColor: ORANGE_ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  stopButtonIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: ORANGE_ACCENT,
  },
  stopListeningText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  mainPrompt: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  instruction: {
    fontSize: 18,
    color: '#F59E0B', // Orange accent color
    marginBottom: 30,
    fontWeight: '600',
  },
  buttonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 30,
    position: 'relative',
    width: 250,
    height: 250,
  },
  soundWavesLeft: {
    position: 'absolute',
    left: -40,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 40,
  },
  soundWaveBar: {
    width: 5,
    borderRadius: 2.5,
  },
  mainButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#10B981', // Green button color
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  mainButtonProcessing: {
    opacity: 0.8,
  },
  micIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  musicNoteRight: {
    position: 'absolute',
    right: -30,
    top: '50%',
    marginTop: -12,
  },
  musicNoteEmoji: {
    fontSize: 24,
    color: '#F59E0B', // Orange accent
  },
  mySoundsSection: {
    backgroundColor: '#fff',
    marginTop: -30,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    minHeight: 200,
  },
  mySoundsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  mySoundsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  folderIcon: {
    fontSize: 20,
  },
  mySoundsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    backgroundColor: PURPLE_GRADIENT[0],
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  seeAllButton: {
    backgroundColor: '#87CEEB', // Light blue
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  seeAllText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  soundsCardsContainer: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
  },
  soundCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    alignItems: 'center',
    minHeight: 140,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  soundCardImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  soundCardEmoji: {
    fontSize: 48,
  },
  soundCardLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  checkmarkBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#10B981', // Green
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  noSoundsContainer: {
    padding: 40,
    alignItems: 'center',
  },
  noSoundsText: {
    fontSize: 16,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  criticalOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  criticalOverlayBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FF3B30',
  },
  criticalContent: {
    alignItems: 'center',
    padding: 30,
    width: '90%',
  },
  criticalEmoji: {
    fontSize: 100,
    marginBottom: 20,
  },
  criticalTitle: {
    fontSize: 40,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 10,
    textAlign: 'center',
  },
  criticalMessage: {
    fontSize: 24,
    color: '#fff',
    textAlign: 'center',
    fontWeight: '700',
    marginBottom: 40,
  },
  criticalDismissButton: {
    backgroundColor: '#fff',
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 10,
  },
  criticalDismissButtonText: {
    color: '#FF3B30',
    fontSize: 20,
    fontWeight: '900',
  },
  popupBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 1000,
  },
  popupContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingBottom: 40,
    alignItems: 'center',
    zIndex: 1001,
    minHeight: '45%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 20,
  },
  popupHandle: {
    width: 60,
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    marginBottom: 24,
  },
  popupHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  popupIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  popupEmoji: {
    fontSize: 48,
  },
  popupTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#6B7280',
    letterSpacing: 2,
  },
  popupContentCard: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 24,
    borderRadius: 20,
    marginBottom: 32,
  },
  popupHazardName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  popupMessage: {
    fontSize: 18,
    color: '#4B5563',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 26,
  },
  popupActionButton: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  popupActionButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  processingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
  },
  processingText: {
    fontSize: 16,
    fontWeight: '500',
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    padding: 16,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
  },
});
