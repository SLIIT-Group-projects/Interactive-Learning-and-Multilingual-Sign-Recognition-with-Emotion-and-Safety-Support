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
  Image,
  Platform,
  Vibration
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import apiService from '../../../services/api.service';
import hazardAlertService from '../../../services/hazardAlert.service';

const PURPLE_GRADIENT = ['#5452e6ff', '#7C3AED']; // Purple gradient
const GREEN_BUTTON = '#10B981'; // Bright green
const ORANGE_ACCENT = '#F59E0B'; // Orange for accents
const SAFETY_CHECK_STEPS = [
  {
    question: 'Are you safe now?',
    shortPrompt: 'SAFE NOW?',
    emoji: '🙂',
    icon: 'health-and-safety',
  },
  {
    question: 'Is there still danger around you?',
    shortPrompt: 'DANGER NEARBY?',
    emoji: '👀',
    icon: 'warning-amber',
  },
  {
    question: 'Do you need help right now?',
    shortPrompt: 'NEED HELP?',
    emoji: '🆘',
    icon: 'support-agent',
  },
];

const getCriticalVibrationProfile = (hazardType = '') => {
  const normalized = String(hazardType).toLowerCase();

  if (normalized.includes('gun') || normalized.includes('siren')) {
    return {
      initialPattern: [0, 450, 45, 450, 45, 450, 90, 1000],
      repeatPattern: [0, 340, 40, 340, 70],
      intervalMs: 240,
    };
  }

  if (normalized.includes('fire') || normalized.includes('smoke')) {
    return {
      initialPattern: [0, 1400, 60, 1400, 60, 1400],
      repeatPattern: [0, 520, 50, 520],
      intervalMs: 260,
    };
  }

  if (normalized.includes('dog') || normalized.includes('car') || normalized.includes('horn')) {
    return {
      initialPattern: [0, 900, 60, 900, 60, 900],
      repeatPattern: [0, 420, 50, 420],
      intervalMs: 260,
    };
  }

  return {
    initialPattern: [0, 1200, 60, 1200, 60, 1200],
    repeatPattern: [0, 450, 50, 450],
    intervalMs: 260,
  };
};

export default function HazardDetectionScreen() {
  const { userData } = useAuth();
  const [permissionResponse, requestPermission] = Audio.usePermissions();
  const [recording, setRecording] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detections, setDetections] = useState(null);
  const [alertMessage, setAlertMessage] = useState(null);
  const [error, setError] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [isCriticalAlert, setIsCriticalAlert] = useState(false);
  const [showSafetyCheckModal, setShowSafetyCheckModal] = useState(false);
  const [safetyQuestionIndex, setSafetyQuestionIndex] = useState(0);
  const [safetyResponses, setSafetyResponses] = useState([]);
  const [isSubmittingSafetyCheck, setIsSubmittingSafetyCheck] = useState(false);
  const [isIconOnlyMode, setIsIconOnlyMode] = useState(true);
  const processingIntervalRef = useRef(null);
  const recordingRef = useRef(null);
  const isListeningRef = useRef(false);
  const isRestartingRef = useRef(false);
  const restartPromiseRef = useRef(null);
  const isProcessingRef = useRef(false);
  const vibrationIntervalRef = useRef(null);
  const hapticPulseIntervalRef = useRef(null);
  const rapidVibrationIntervalRef = useRef(null);
  const flashAnimation = useRef(new Animated.Value(0)).current;
  const pulseAnimation = useRef(new Animated.Value(1)).current;
  const circleAnimation1 = useRef(new Animated.Value(0)).current;
  const circleAnimation2 = useRef(new Animated.Value(0)).current;
  const circleAnimation3 = useRef(new Animated.Value(0)).current;
  const soundLevelAnimation = useRef(new Animated.Value(0)).current;
  const popupAnimation = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const criticalPulseAnimation = useRef(new Animated.Value(1)).current;
  const criticalScaleAnimation = useRef(new Animated.Value(1)).current;
  const navigation = useNavigation();
  const [soundLevel, setSoundLevel] = useState(0.3); // Mock sound level (0-1)

  // Smart detection tracking with temporal smoothing
  // Track recent detections in a sliding window for better accuracy
  const detectionHistoryRef = useRef([]);
  const MAX_HISTORY_SIZE = 5; // Keep last 5 detections (20 seconds of history)
  const ALERT_COOLDOWN_MS = 8000; // Don't alert same hazard within 8 seconds
  const lastAlertTimeRef = useRef(new Map()); // Track last alert time per hazard type
  // CRITICAL: Use refs to persistently track critical alert state (survives React state updates)
  const criticalAlertRef = useRef(false); // Track if critical alert is active
  const currentAlertPriorityRef = useRef(0); // Track current alert priority
  const currentAlertMessageRef = useRef(null); // Track current alert message
  const lastLocationFetchRef = useRef(0);
  const criticalSoundIdRef = useRef(null);
  const criticalHazardTypeRef = useRef(null);
  const safetyCheckTimeoutRef = useRef(null);
  const LOCATION_FETCH_COOLDOWN_MS = 60 * 1000;

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

  const getAnimatedIcon = (type) => {
    switch (type) {
      case 'fire_alarm': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/512.gif'; // Fire
      case 'smoke_alarm': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f4a8/512.gif'; // Dash/Smoke
      case 'siren': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f6a8/512.gif'; // Police car light
      case 'glass_breaking': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f4a5/512.gif'; // Collision/Bang
      case 'dog_barking': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f415/512.gif'; // Dog
      case 'baby_crying': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f476/512.gif'; // Baby
      case 'car_horn': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f697/512.gif'; // Automobile
      case 'gun_shot': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f50a/512.gif'; // Loud noise
      default: return 'https://fonts.gstatic.com/s/e/notoemoji/latest/26a0_fe0f/512.gif'; // Warning
    }
  };

  // Helper function to safely clear alert message (never clears critical alerts)
  const safeClearAlertMessage = () => {
    // Use refs for reliable checking (survives React state updates)
    const currentPriority = currentAlertPriorityRef.current || detections?.highestPriority?.priority || 0;
    const isCurrentlyCritical = criticalAlertRef.current || isCriticalAlert || currentPriority >= 9;

    if (currentPriority < 9 && !isCurrentlyCritical) {
      setAlertMessage(null);
      currentAlertMessageRef.current = null;
      return true; // Cleared successfully
    } else {
      console.log(`🛡️ Cannot clear alert - critical alert is active (priority: ${currentPriority})`);
      return false; // Cannot clear - critical alert active
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

  const fetchLocationForCriticalAlert = async () => {
    const now = Date.now();

    // Avoid frequent GPS calls during ongoing critical state.
    if (currentLocation && (now - lastLocationFetchRef.current) < LOCATION_FETCH_COOLDOWN_MS) {
      return currentLocation;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('⚠️ Location permission not granted for critical alert');
        return null;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const locationData = {
        type: 'Point',
        coordinates: [loc.coords.longitude, loc.coords.latitude],
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };

      setCurrentLocation(locationData);
      lastLocationFetchRef.current = now;
      console.log('📍 Critical alert location captured:', locationData);
      return locationData;
    } catch (locationError) {
      console.error('❌ Error getting critical alert location:', locationError);
      return null;
    }
  };

  const submitPostCriticalSafetyCheck = async (responses) => {
    const userId = userData?.uid;
    if (!userId) {
      return;
    }

    try {
      const childConfirmedSafe =
        responses[0]?.answer === true &&
        responses[1]?.answer === false &&
        responses[2]?.answer === false;

      await apiService.submitCriticalSafetyCheck({
        soundId: criticalSoundIdRef.current || null,
        userId,
        hazardType: criticalHazardTypeRef.current || null,
        childConfirmedSafe,
        responses,
      });

      Alert.alert(
        'Safety Check Shared',
        childConfirmedSafe
          ? 'Great! Your safety update was sent to your parent.'
          : 'Thanks. Your answers were sent to your parent for quick support.'
      );
    } catch (safetyError) {
      console.error('❌ Failed to submit safety check:', safetyError);
      Alert.alert('Safety Check Error', 'Could not send safety check update. Please try again.');
    }
  };

  const handleSafetyResponse = async (answer) => {
    if (isSubmittingSafetyCheck) return;

    const currentStep = SAFETY_CHECK_STEPS[safetyQuestionIndex];
    const nextResponses = [...safetyResponses, { question: currentStep.question, answer }];

    if (safetyQuestionIndex < SAFETY_CHECK_STEPS.length - 1) {
      setSafetyResponses(nextResponses);
      setSafetyQuestionIndex((prev) => prev + 1);
      return;
    }

    setIsSubmittingSafetyCheck(true);
    await submitPostCriticalSafetyCheck(nextResponses);
    setIsSubmittingSafetyCheck(false);
    setShowSafetyCheckModal(false);
    setSafetyQuestionIndex(0);
    setSafetyResponses([]);
  };

  const stopCriticalTactileFeedback = () => {
    if (vibrationIntervalRef.current) {
      clearInterval(vibrationIntervalRef.current);
      vibrationIntervalRef.current = null;
    }
    if (hapticPulseIntervalRef.current) {
      clearInterval(hapticPulseIntervalRef.current);
      hapticPulseIntervalRef.current = null;
    }
    if (rapidVibrationIntervalRef.current) {
      clearInterval(rapidVibrationIntervalRef.current);
      rapidVibrationIntervalRef.current = null;
    }
    try {
      Vibration.cancel();
    } catch (cancelError) {
      console.warn('⚠️ Error canceling vibration:', cancelError);
    }
  };

  const startCriticalTactileFeedback = async (hazardType) => {
    stopCriticalTactileFeedback();
    const vibrationProfile = getCriticalVibrationProfile(hazardType);
    console.log('🚨 CRITICAL ALERT - Starting enhanced vibration pattern');

    try {
      // Start with a long repeating pattern to maximize tactile awareness.
      Vibration.vibrate(vibrationProfile.initialPattern, true);
      // Add extra short "tap burst" pulses frequently for stronger feel.
      vibrationIntervalRef.current = setInterval(() => {
        try {
          Vibration.cancel();
          Vibration.vibrate(vibrationProfile.repeatPattern, false);
          setTimeout(() => {
            Vibration.vibrate([0, 220, 30, 220, 30, 220], false);
          }, 70);
        } catch (vibError) {
          console.error('❌ Continuous vibration error:', vibError);
        }
      }, Math.max(180, vibrationProfile.intervalMs - 120));
      console.log(`🔔 Started enhanced tactile vibration loop for critical alert (${Math.max(180, vibrationProfile.intervalMs - 120)}ms)`); 
    } catch (vibError) {
      console.error('❌ Vibration start error:', vibError);
      try {
        Vibration.vibrate(1000);
      } catch (fallbackError) {
        console.error('❌ Fallback vibration also failed:', fallbackError);
      }
    }

    // Haptic bursts add extra tactile emphasis where available.
    rapidVibrationIntervalRef.current = setInterval(() => {
      try {
        Vibration.vibrate([0, 130], false);
      } catch (vibError) {
        // keep primary pattern running
      }
    }, 130);

    hapticPulseIntervalRef.current = setInterval(async () => {
      try {
        const hapticsAvailable = await Haptics.isAvailableAsync();
        if (!hapticsAvailable) return;
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        await new Promise((resolve) => setTimeout(resolve, 80));
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } catch (hapticError) {
        // Keep vibration as the primary path.
      }
    }, 420);
  };

  const openPostCriticalSafetyCheckImmediately = () => {
    if (safetyCheckTimeoutRef.current) {
      clearTimeout(safetyCheckTimeoutRef.current);
      safetyCheckTimeoutRef.current = null;
    }
    setSafetyQuestionIndex(0);
    setSafetyResponses([]);
    setShowSafetyCheckModal(true);
  };

  // Make screen full size by hiding the navigation header
  useEffect(() => {
    if (navigation) {
      navigation.setOptions({ headerShown: false });
    }
  }, [navigation]);

  // Separate useEffect for critical alert pulsing animation
  useEffect(() => {
    if (isCriticalAlert && alertMessage) {
      // Continuous pulsing animation for critical alerts
      Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(criticalPulseAnimation, {
              toValue: 1.1,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.timing(criticalScaleAnimation, {
              toValue: 1.05,
              duration: 800,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(criticalPulseAnimation, {
              toValue: 1,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.timing(criticalScaleAnimation, {
              toValue: 1,
              duration: 800,
              useNativeDriver: true,
            }),
          ]),
        ])
      ).start();
    } else {
      criticalPulseAnimation.setValue(1);
      criticalScaleAnimation.setValue(1);
    }
  }, [isCriticalAlert, alertMessage]);

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
      if (safetyCheckTimeoutRef.current) {
        clearTimeout(safetyCheckTimeoutRef.current);
        safetyCheckTimeoutRef.current = null;
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
      // CRITICAL: Never clear critical alerts when starting to listen
      // Only clear non-critical alerts
      // Use refs for reliable checking (survives React state updates)
      safeClearAlertMessage();

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
          // Check if recording is valid before accessing it
          if (!currentRecording) {
            console.warn('⚠️ Recording ref is null in interval, skipping...');
            return;
          }

          let status;
          try {
            status = await currentRecording.getStatusAsync();
          } catch (statusError) {
            // If recording doesn't exist or isn't prepared, try to restart
            if (statusError.message?.includes('does not exist') || statusError.message?.includes('Prepare it first')) {
              console.warn('⚠️ Recording not prepared in interval, restarting...');
              if (isListeningRef.current) {
                try {
                  const restarted = await restartRecording();
                  if (restarted) {
                    setRecording(restarted);
                    recordingRef.current = restarted;
                    console.log('✅ Recording restarted from interval');
                  }
                } catch (restartError) {
                  console.error('❌ Failed to restart from interval:', restartError);
                }
              }
            } else {
              console.error('❌ Error getting status in interval:', statusError);
            }
            return;
          }

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
      // Validate recording object exists and is prepared
      if (!recording) {
        console.warn('⚠️ No recording object provided to processAudioChunk');
        // Try to restart if we should be listening
        if (isListeningRef.current) {
          try {
            newRecording = await restartRecording();
            if (newRecording) {
              setRecording(newRecording);
              recordingRef.current = newRecording;
              console.log('✅ Recording restarted (was null)');
            }
          } catch (restartError) {
            console.error('❌ Failed to restart null recording:', restartError);
          }
        }
        return;
      }

      // Get status before stopping to log duration
      // Wrap in try-catch to handle "Recorder does not exist" error
      let statusBeforeStop;
      try {
        statusBeforeStop = await recording.getStatusAsync();
      } catch (statusError) {
        // If recording doesn't exist or isn't prepared, restart it
        if (statusError.message?.includes('does not exist') || statusError.message?.includes('Prepare it first')) {
          console.warn('⚠️ Recording not prepared, restarting...', statusError.message);
          if (isListeningRef.current) {
            try {
              newRecording = await restartRecording();
              if (newRecording) {
                setRecording(newRecording);
                recordingRef.current = newRecording;
                console.log('✅ Recording restarted (was not prepared)');
              }
            } catch (restartError) {
              console.error('❌ Failed to restart unprepared recording:', restartError);
            }
          }
        } else {
          console.error('❌ Error getting recording status:', statusError);
        }
        return;
      }

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
      // Wrap in try-catch to handle cases where recording was already stopped/unloaded
      try {
        await recording.stopAndUnloadAsync();
      } catch (stopError) {
        // If recording was already stopped/unloaded, that's okay - just log and continue
        if (stopError.message?.includes('already been unloaded') || stopError.message?.includes('does not exist')) {
          console.warn('⚠️ Recording already stopped/unloaded, continuing...');
        } else {
          throw stopError; // Re-throw if it's a different error
        }
      }

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

      // Get user ID from auth context
      const userId = userData?.uid || null;

      // Battery optimization: include location only while a critical alert is active.
      let locationData = null;
      if (criticalAlertRef.current) {
        locationData = await fetchLocationForCriticalAlert();
      }

      // Get current context (time, location, userId, etc.)
      const context = {
        userId: userId,
        location: locationData,
        time: new Date().toISOString(),
      };

      console.log('📤 Sending audio to backend...');
      console.log('📋 Context being sent:', {
        userId: context.userId,
        hasLocation: !!context.location,
        locationType: context.location?.type,
        coordinates: context.location?.coordinates,
      });
      // Send to backend for hazard detection
      const response = await apiService.detectHazards(uri, context);
      console.log('✅ Received response from backend:', response.success);
      if (response.success && response.data?.metadata?.savedSoundIds) {
        console.log(`💾 Saved ${response.data.metadata.savedSoundIds.length} sound(s) to database`);
      }

      if (response.success && response.data) {
        const highestPrioritySoundId =
          response.data?.metadata?.highestPrioritySoundId ||
          response.data?.metadata?.savedSoundIds?.[0] ||
          null;

        // CRITICAL: Check if there's already an active critical alert
        // If so, only update detections if the new detection is also critical (priority >= 9)
        // This prevents lower priority detections from overwriting critical alerts
        // Use refs for reliable checking (survives React state updates)
        const currentCriticalPriority = currentAlertPriorityRef.current || detections?.highestPriority?.priority || 0;
        const hasActiveCriticalAlert = criticalAlertRef.current || isCriticalAlert || currentCriticalPriority >= 9;
        const newPriority = response.data.highestPriority?.priority || 0;
        const isNewDetectionCritical = newPriority >= 9;

        // Only update detections if:
        // 1. There's no active critical alert, OR
        // 2. The new detection is also critical (can replace one critical with another)
        if (!hasActiveCriticalAlert || isNewDetectionCritical) {
          setDetections(response.data);
        } else {
          // Keep existing detections (preserve critical alert data)
          console.log(`🛡️ Preserving critical alert (priority ${currentCriticalPriority}) - ignoring lower priority detection (priority ${newPriority})`);
          // Still add to detection history for tracking, but don't update the displayed detections
        }

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

          // CRITICAL: If there's already an active critical alert, don't process lower priority alerts
          // Use a flag to skip alert processing but continue with recording restart
          let shouldSkipAlertProcessing = false;
          if (hasActiveCriticalAlert && priority < 9) {
            console.log(`🛡️ Skipping alert processing - critical alert (priority ${currentCriticalPriority}) is active, new detection priority ${priority} is lower`);
            shouldSkipAlertProcessing = true;
            // Still add to detection history for tracking
            const now = Date.now();
            const detection = {
              type: hazardType,
              confidence,
              priority,
              timestamp: now
            };
            detectionHistoryRef.current.push(detection);
            if (detectionHistoryRef.current.length > MAX_HISTORY_SIZE) {
              detectionHistoryRef.current.shift();
            }
            // Skip alert processing but continue to restart recording
          }

          // If we should skip alert processing, skip the entire alert processing block
          if (!shouldSkipAlertProcessing) {
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

            // CRITICAL: Filter out common false positive types
            const FALSE_POSITIVE_TYPES = ['silence', 'background_noise', 'noise', 'static', 'white_noise'];
            if (FALSE_POSITIVE_TYPES.includes(hazardType.toLowerCase())) {
              console.log(`🚫 Filtering out false positive type: ${hazardType}`);
              return; // Skip this detection entirely
            }

            // Smart alerting rules based on confidence and priority
            // INCREASED THRESHOLDS to prevent false positives
            let shouldAlert = false;
            let alertReason = '';

            // Rule 1: Critical hazards (fire, gunshot) with VERY high confidence - alert immediately
            // Increased from 0.75 to 0.80 to reduce false positives
            if (priority >= 9 && confidence >= 0.80) {
              shouldAlert = true;
              alertReason = `Critical hazard with very high confidence (${(confidence * 100).toFixed(0)}%)`;
              console.log(`✅ Rule 1 matched: priority ${priority} >= 9, confidence ${(confidence * 100).toFixed(1)}% >= 80%`);
            }
            // Rule 2: For non-priority alerts (e.g., footsteps), require repeated confirmation.
            // This prevents noisy one-off detections from alerting children too often.
            else if (priority < 7 && confidence >= 0.65) {
              const recentSameType = detectionHistoryRef.current
                .filter(d => d.type === hazardType)
                .slice(-5); // Last 5 detections

              if (recentSameType.length >= 3) {
                shouldAlert = true;
                alertReason = `Non-priority sound confirmed (${recentSameType.length}/5 detections, ${(confidence * 100).toFixed(0)}% confidence)`;
              } else {
                console.log(`⏳ ${hazardType} is non-priority and needs 3/5 confirmations (${recentSameType.length}/3)`);
              }
            }
            // Rule 3: High priority hazards (siren, glass breaking) with high confidence - alert immediately
            // Increased from 0.70 to 0.75 to reduce false positives
            else if (priority >= 7 && confidence >= 0.75) {
              shouldAlert = true;
              alertReason = `High priority hazard with high confidence (${(confidence * 100).toFixed(0)}%)`;
              console.log(`✅ Rule 2 matched: priority ${priority} >= 7, confidence ${(confidence * 100).toFixed(1)}% >= 75%`);
            }
            // Rule 4: Medium-high confidence (0.70-0.75) - require 2 out of last 3 detections to be same type
            // Increased threshold from 0.60-0.70 to 0.70-0.75
            else if (confidence >= 0.70 && confidence < 0.75) {
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
            // Rule 5: Medium confidence (0.65-0.70) - require 3 out of last 5 detections
            // Increased threshold from 0.50-0.60 to 0.65-0.70
            else if (confidence >= 0.65 && confidence < 0.70) {
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
            // Rule 6: Very low confidence - don't alert (increased minimum from 0.50 to 0.65)
            else {
              console.log(`⏭️ Skipping ${hazardType} - confidence too low (${(confidence * 100).toFixed(0)}% < 65%)`);
            }

            // Only alert if shouldAlert is true AND not on cooldown
            // CRITICAL: Also check that we're not replacing a higher priority alert
            // Use refs for reliable checking (survives React state updates)
            const existingAlertPriority = currentAlertPriorityRef.current || detections?.highestPriority?.priority || 0;
            const existingAlertIsCritical = criticalAlertRef.current || isCriticalAlert || existingAlertPriority >= 9;
            // Can replace if: 
            // 1. No existing alert (priority 0), OR
            // 2. New priority is >= existing priority (higher or equal priority can replace)
            // This ensures critical alerts (priority >= 9) are never replaced by lower priority alerts
            const canReplaceExistingAlert = existingAlertPriority === 0 || priority >= existingAlertPriority;

            if (shouldAlert && !isOnCooldown) {
              if (!canReplaceExistingAlert) {
                console.log(`🛡️ Blocking alert: ${hazardType} (priority ${priority}) cannot replace existing alert (priority ${existingAlertPriority})`);
                // Don't alert - preserve the existing higher priority alert
              } else {
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
                currentAlertMessageRef.current = message; // Update ref

                // Whitelist of sound types that are allowed to trigger full-screen critical alerts.
                // All other sounds will display as normal banner alerts only, regardless of priority.
                const FULLSCREEN_ALERT_TYPES = ['fire_alarm', 'smoke_alarm', 'gun_shot', 'siren'];
                // dog_barking is critical only at night (10 PM – 6 AM)
                const currentHour = new Date().getHours();
                const isNightTime = currentHour >= 22 || currentHour < 6;
                if (isNightTime) {
                  FULLSCREEN_ALERT_TYPES.push('dog_barking');
                }

                // Check if this is a critical alert (priority >= 9 AND sound type is whitelisted)
                const isCritical = priority >= 9 && FULLSCREEN_ALERT_TYPES.includes(hazardType);
                setIsCriticalAlert(isCritical);
                criticalAlertRef.current = isCritical; // Update ref
                currentAlertPriorityRef.current = priority; // Update ref

                // Start continuous vibration for critical alerts
                if (isCritical) {
                  // Track which hazard record should be updated after the child confirms safety.
                  criticalSoundIdRef.current = highestPrioritySoundId;
                  criticalHazardTypeRef.current = hazardType;
                  if (safetyCheckTimeoutRef.current) {
                    clearTimeout(safetyCheckTimeoutRef.current);
                    safetyCheckTimeoutRef.current = null;
                  }

                  // Capture GPS only for critical alerts (avoids per-chunk battery drain).
                  const criticalLocation = await fetchLocationForCriticalAlert();
                  if (criticalLocation) {
                    hazard.location = criticalLocation;
                  }

                  await startCriticalTactileFeedback(hazardType);
                }

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
              } // End of canReplaceExistingAlert else block
            } else if (shouldAlert && isOnCooldown) {
              console.log(`⏸️ Alert suppressed due to cooldown: ${hazardType}`);
              // Keep detection in history but don't alert
            } else {
              // Don't alert yet, but keep detection in history
              console.log(`⏳ Not alerting yet: ${hazardType} (confidence: ${(confidence * 100).toFixed(1)}%, priority: ${priority})`);
              // CRITICAL: Never clear critical alerts - they must be explicitly dismissed by child
              // Use refs for reliable checking
              safeClearAlertMessage();
            }
          } // End of if (!shouldSkipAlertProcessing) block
        } else {
          // No detection in this chunk - clear alert but keep history (unless critical)
          // CRITICAL: Never clear critical alerts - they must be explicitly dismissed by child
          // Use refs for reliable checking (survives React state updates)
          safeClearAlertMessage();
        }
      } else {
        // No detection - clear alert but keep history (unless critical)
        // CRITICAL: Never clear critical alerts - they must be explicitly dismissed by child
        // Use refs for reliable checking (survives React state updates)
        safeClearAlertMessage();
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
    // For critical alerts, use continuous flashing
    if (urgency === 'critical' || isCriticalAlert) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(flashAnimation, {
            toValue: 1,
            duration: 300,
            useNativeDriver: false,
          }),
          Animated.timing(flashAnimation, {
            toValue: 0,
            duration: 300,
            useNativeDriver: false,
          }),
        ])
      ).start();

      // Add pulsing animations for critical alert overlay
      Animated.loop(
        Animated.sequence([
          Animated.timing(criticalPulseAnimation, {
            toValue: 1.1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(criticalPulseAnimation, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(criticalScaleAnimation, {
            toValue: 1.05,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(criticalScaleAnimation, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      // For non-critical alerts, single flash
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
    }
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
        toValue: 1, // Full opacity for darker backdrop (better visibility)
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const hidePopup = () => {
    // Don't auto-dismiss critical alerts - they must be explicitly dismissed by user
    // Use refs for reliable checking (survives React state updates)
    const currentPriority = currentAlertPriorityRef.current || detections?.highestPriority?.priority || 0;
    if (criticalAlertRef.current || isCriticalAlert || currentPriority >= 9) {
      console.log('⚠️ Critical alert cannot be auto-dismissed - user must explicitly dismiss');
      return;
    }

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
      setIsCriticalAlert(false);
      // Clear refs as well
      criticalAlertRef.current = false;
      currentAlertPriorityRef.current = 0;
      currentAlertMessageRef.current = null;
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

      stopCriticalTactileFeedback();

      setAlertMessage(null);
      setIsCriticalAlert(false);
      // Clear refs as well
      criticalAlertRef.current = false;
      currentAlertPriorityRef.current = 0;
      currentAlertMessageRef.current = null;

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
    const currentPriority = currentAlertPriorityRef.current || detections?.highestPriority?.priority || 0;
    const wasCritical = criticalAlertRef.current || isCriticalAlert || currentPriority >= 9;

    // Stop any ongoing alerts
    if (hazardAlertService && typeof hazardAlertService.stopAlert === 'function') {
      hazardAlertService.stopAlert();
    }

    stopCriticalTactileFeedback();
    console.log('🔕 Vibration canceled');

    // Stop flash animation
    flashAnimation.stopAnimation();
    flashAnimation.setValue(0);

    // Stop critical pulse animations
    criticalPulseAnimation.stopAnimation();
    criticalPulseAnimation.setValue(1);
    criticalScaleAnimation.stopAnimation();
    criticalScaleAnimation.setValue(1);

    // Reset critical alert state (both state and refs)
    setIsCriticalAlert(false);
    criticalAlertRef.current = false;
    currentAlertPriorityRef.current = 0;
    currentAlertMessageRef.current = null;

    // Hide popup (will work for critical alerts since user explicitly dismissed)
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

    if (wasCritical) {
      openPostCriticalSafetyCheckImmediately();
    }

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
              onPress={stopListening}
              activeOpacity={0.8}
            >
              <View style={styles.stopButtonIcon}>
                <View style={styles.stopButtonInner} />
              </View>
              <Text style={styles.stopListeningText}>All Done!</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Initial Screen */
          <View style={[styles.mainSection, { backgroundColor: PURPLE_GRADIENT[0] }]}>
            <Text style={styles.mainPrompt}>Let's listen!</Text>
            <Text style={styles.subPrompt}>What's that sound?</Text>
            <Text style={[styles.instruction, { color: ORANGE_ACCENT }]}>Tap the huge green button!</Text>

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
                        <ExpoImage
                          source={{ uri: getAnimatedIcon(detection.type) }}
                          style={{ width: 60, height: 60 }}
                          contentFit="contain"
                        />
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

        {/* Critical Alert Full Screen Overlay - Must stay until child responds */}
        {alertMessage && detections?.highestPriority && detections.highestPriority.priority >= 9 && (
          <View style={styles.criticalOverlay} pointerEvents="box-none">
            {/* Pulsing red background */}
            <Animated.View
              style={[
                styles.criticalOverlayBackground,
                {
                  opacity: criticalPulseAnimation.interpolate({
                    inputRange: [0.9, 1, 1.1],
                    outputRange: [0.95, 1, 0.95],
                  }),
                }
              ]}
            />
            {/* Flashing overlay for extra visibility */}
            <Animated.View
              style={[
                styles.criticalFlashOverlay,
                {
                  opacity: flashAnimation.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, 0.3, 0],
                  }),
                }
              ]}
            />
            {/* Content with pulsing animation */}
            <Animated.View
              style={[
                styles.criticalContent,
                {
                  transform: [
                    { scale: criticalScaleAnimation },
                  ],
                }
              ]}
            >
              <Animated.View
                style={{
                  transform: [{ scale: criticalPulseAnimation }],
                }}
              >
                <ExpoImage
                  source={{ uri: getAnimatedIcon(detections?.highestPriority?.type) }}
                  style={{ width: 150, height: 150, marginBottom: 30 }}
                  contentFit="contain"
                />
              </Animated.View>
              <Text style={styles.criticalTitle}>WATCH OUT!</Text>
              <Text style={styles.criticalMessage}>{alertMessage}</Text>
              <Text style={styles.criticalSubtext}>Are you safe? Tap the button below!</Text>
              <TouchableOpacity
                style={styles.criticalDismissButton}
                onPress={dismissAlert}
                activeOpacity={0.8}
              >
                <Text style={styles.criticalDismissButtonText}>I'M SAFE NOW!</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}

        {/* Child-friendly follow-up safety check */}
        {showSafetyCheckModal && (
          <View style={styles.safetyCheckOverlay}>
            <View style={styles.safetyCheckCard}>
              <TouchableOpacity
                style={styles.safetyModeToggle}
                onPress={() => setIsIconOnlyMode((prev) => !prev)}
                activeOpacity={0.8}
              >
                <MaterialIcons
                  name={isIconOnlyMode ? 'text-fields' : 'gesture'}
                  size={18}
                  color="#6D28D9"
                />
                <Text style={styles.safetyModeToggleText}>
                  {isIconOnlyMode ? 'Show Text' : 'Icon Mode'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.safetyCheckProgress}>
                Question {safetyQuestionIndex + 1} of {SAFETY_CHECK_STEPS.length}
              </Text>
              <View style={styles.safetyVisualBadge}>
                <Text style={styles.safetyCheckEmoji}>
                  {SAFETY_CHECK_STEPS[safetyQuestionIndex].emoji}
                </Text>
                <MaterialIcons
                  name={SAFETY_CHECK_STEPS[safetyQuestionIndex].icon}
                  size={30}
                  color="#6D28D9"
                />
              </View>
              <Text style={styles.safetyCheckTitle}>Quick Safety Check</Text>
              {isIconOnlyMode ? (
                <Text style={styles.safetyCheckQuestionIconOnly}>
                  {SAFETY_CHECK_STEPS[safetyQuestionIndex].shortPrompt}
                </Text>
              ) : (
                <Text style={styles.safetyCheckQuestion}>
                  {SAFETY_CHECK_STEPS[safetyQuestionIndex].question}
                </Text>
              )}

              {isSubmittingSafetyCheck ? (
                <View style={styles.safetySubmittingContainer}>
                  <ActivityIndicator size="large" color="#7C3AED" />
                  <Text style={styles.safetySubmittingText}>Sending your answers...</Text>
                </View>
              ) : (
                <View style={styles.safetyAnswerButtonsRow}>
                  <TouchableOpacity
                    style={[styles.safetyAnswerButton, styles.safetyAnswerNoButton]}
                    onPress={() => handleSafetyResponse(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.safetyAnswerButtonEmoji}>🙅</Text>
                    <Text style={styles.safetyAnswerButtonText}>No</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.safetyAnswerButton, styles.safetyAnswerYesButton]}
                    onPress={() => handleSafetyResponse(true)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.safetyAnswerButtonEmoji}>👍</Text>
                    <Text style={styles.safetyAnswerButtonText}>Yes</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Half-Screen Pop-up Alert for Hazards */}
        {alertMessage && detections?.highestPriority && detections.highestPriority.priority < 9 && (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {/* Backdrop - darker for better visibility */}
            <Animated.View
              style={[
                styles.popupBackdrop,
                {
                  opacity: backdropOpacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 0.8], // Darker backdrop
                  })
                }
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
                  <ExpoImage
                    source={{ uri: getAnimatedIcon(detections.highestPriority.type) }}
                    style={{ width: 75, height: 75 }}
                    contentFit="contain"
                  />
                </View>
                <Text style={styles.popupTitle}>NEW SOUND DETECTED!</Text>
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
                <Text style={styles.popupActionButtonText}>GOT IT!</Text>
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    minHeight: 400,
  },
  listeningContainer: {
    flex: 1,
    justifyContent: 'center',
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
    backgroundColor: '#FF6B6B', // Playful coral red
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 32,
    borderRadius: 30, // rounder
    marginHorizontal: 20,
    marginTop: 20,
    gap: 12,
    borderWidth: 5,
    borderColor: '#E03131', // darker red border
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  stopButtonIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButtonInner: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: '#E03131',
  },
  stopListeningText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
  },
  mainPrompt: {
    fontSize: 42,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 4,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  subPrompt: {
    fontSize: 28,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 16,
    textAlign: 'center',
  },
  instruction: {
    fontSize: 22,
    color: '#FFD700', // Bright yellow
    marginBottom: 35,
    fontWeight: '800',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
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
    width: 6,
    borderRadius: 3,
  },
  mainButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#10B981', // Green button color
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 8,
    borderColor: '#059669', // Darker green border
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  mainButtonProcessing: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
  micIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2,
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
    borderRadius: 24,
    padding: 16,
    borderWidth: 4,
    alignItems: 'center',
    minHeight: 160,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  soundCardImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  soundCardEmoji: {
    fontSize: 54,
  },
  soundCardLabel: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  checkmarkBadge: {
    position: 'absolute',
    bottom: -8,
    right: -8,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#fff',
    backgroundColor: '#10B981', // Green
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  checkmark: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
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
    backgroundColor: '#FF0000', // Brighter red for maximum visibility
  },
  criticalFlashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF', // White flash overlay
  },
  criticalContent: {
    alignItems: 'center',
    padding: 40,
    width: '95%',
    zIndex: 10000,
  },
  criticalEmoji: {
    fontSize: 120, // Larger emoji
    marginBottom: 30,
  },
  criticalTitle: {
    fontSize: 56, // Much larger title
    fontWeight: '900',
    color: '#fff',
    marginBottom: 20,
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
    letterSpacing: 2,
  },
  criticalMessage: {
    fontSize: 32, // Larger message
    color: '#fff',
    textAlign: 'center',
    fontWeight: '700',
    marginBottom: 20,
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
    lineHeight: 42,
  },
  criticalSubtext: {
    fontSize: 20,
    color: '#fff',
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 40,
    opacity: 0.95,
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  criticalDismissButton: {
    backgroundColor: '#fff',
    paddingVertical: 24,
    paddingHorizontal: 60,
    borderRadius: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 15,
    minWidth: 280,
    borderWidth: 4,
    borderColor: '#FF0000',
  },
  criticalDismissButtonText: {
    color: '#FF0000',
    fontSize: 24, // Larger button text
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  safetyCheckOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10020,
    backgroundColor: 'rgba(17, 24, 39, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  safetyCheckCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#C4B5FD',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 12,
  },
  safetyModeToggle: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F3E8FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  safetyModeToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6D28D9',
  },
  safetyCheckProgress: {
    fontSize: 14,
    color: '#6D28D9',
    fontWeight: '700',
    marginBottom: 10,
  },
  safetyVisualBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F3FF',
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#DDD6FE',
  },
  safetyCheckEmoji: {
    fontSize: 56,
    marginBottom: 6,
  },
  safetyCheckTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 10,
    textAlign: 'center',
  },
  safetyCheckQuestion: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: 20,
  },
  safetyCheckQuestionIconOnly: {
    fontSize: 30,
    fontWeight: '900',
    color: '#1F2937',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 20,
  },
  safetySubmittingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  safetySubmittingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#4B5563',
    fontWeight: '600',
  },
  safetyAnswerButtonsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  safetyAnswerButton: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  safetyAnswerNoButton: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  safetyAnswerYesButton: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  safetyAnswerButtonEmoji: {
    fontSize: 30,
    marginBottom: 4,
  },
  safetyAnswerButtonText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
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
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    padding: 32,
    paddingBottom: 50,
    alignItems: 'center',
    zIndex: 1001,
    minHeight: '50%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -15 },
    shadowOpacity: 0.4,
    shadowRadius: 25,
    elevation: 25,
    borderTopWidth: 6,
    borderTopColor: '#F59E0B',
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
    width: 100, // Larger icon container
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 4,
    borderColor: '#fff',
  },
  popupEmoji: {
    fontSize: 60, // Larger emoji
  },
  popupTitle: {
    fontSize: 16, // Larger title
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 3,
    marginTop: 8,
  },
  popupContentCard: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 28,
    borderRadius: 24,
    marginBottom: 36,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  popupHazardName: {
    fontSize: 36, // Much larger hazard name
    fontWeight: '900',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  popupMessage: {
    fontSize: 22, // Larger message
    color: '#1F2937',
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 32,
  },
  popupActionButton: {
    width: '100%',
    paddingVertical: 22, // Larger button
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  popupActionButtonText: {
    color: '#fff',
    fontSize: 20, // Larger button text
    fontWeight: '900',
    letterSpacing: 1,
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
