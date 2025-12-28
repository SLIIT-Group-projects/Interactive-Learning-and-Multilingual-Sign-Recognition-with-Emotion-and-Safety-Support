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
// Using View with backgroundColor instead of LinearGradient for simplicity
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import apiService, { HazardDetectionResponse } from '../../services/api.service';
import hazardAlertService from '../../services/hazardAlert.service';

const { width } = Dimensions.get('window');


const PURPLE_GRADIENT = ['#5452e6ff', '#7C3AED']; // Purple gradient
const GREEN_BUTTON = '#10B981'; // Bright green
const ORANGE_ACCENT = '#F59E0B'; // Orange for accents

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
  const isRestartingRef = useRef<boolean>(false);
  const restartPromiseRef = useRef<Promise<Audio.Recording | null> | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const flashAnimation = useRef(new Animated.Value(0)).current;
  const pulseAnimation = useRef(new Animated.Value(1)).current;
  const circleAnimation1 = useRef(new Animated.Value(0)).current;
  const circleAnimation2 = useRef(new Animated.Value(0)).current;
  const circleAnimation3 = useRef(new Animated.Value(0)).current;
  const soundLevelAnimation = useRef(new Animated.Value(0)).current;
  const router = useRouter();
  const colorScheme = useColorScheme();
  const [soundLevel, setSoundLevel] = useState(0.3); // Mock sound level (0-1)

  const getAlertColor = (urgency: 'low' | 'medium' | 'high' | 'critical'): string => {
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
    } catch (error: any) {
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
    if (hazardAlertService && typeof (hazardAlertService as any).stopAlert === 'function') {
      (hazardAlertService as any).stopAlert();
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

      // Process audio chunks every 8 seconds
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
      }, 8000);
      
      console.log('✅ Interval set up, will trigger every 8 seconds');
      
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
          const message = hazard.type === 'fire_alarm' ? '🔥 Fire alarm detected! Evacuate immediately!' :
                          hazard.type === 'smoke_alarm' ? '⚠️ Smoke alarm detected! Check for smoke or fire!' :
                          hazard.type === 'siren' ? '🚨 Emergency siren detected nearby!' :
                          hazard.type === 'gun_shot' ? '🔫 Gunshot detected! Stay safe!' :
                          hazard.type === 'glass_breaking' ? '💥 Glass breaking sound detected!' :
                          hazard.type === 'car_horn' ? '🚗 Car horn detected - be careful!' :
                          `Alert: ${hazard.type} detected`;
          setAlertMessage(message);
          
          // Trigger haptic feedback
          if (hazardAlertService && typeof (hazardAlertService as any).triggerAlert === 'function') {
            await (hazardAlertService as any).triggerAlert(hazard);
          }
          
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
      isProcessingRef.current = false;
    }
  };

  const restartRecording = async (): Promise<Audio.Recording | null> => {
    if (isRestartingRef.current && restartPromiseRef.current) {
      try {
        return await restartPromiseRef.current;
      } catch (error) {
        console.log('⚠️ Existing restart failed, will try again');
      }
    }

    isRestartingRef.current = true;
    
    const restartPromise = (async (): Promise<Audio.Recording | null> => {
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
          } catch (cleanupError: any) {
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
      } catch (error: any) {
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

  const triggerFlashAnimation = (urgency: 'low' | 'medium' | 'high' | 'critical') => {
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
        } catch (error: any) {
          if (!error.message?.includes('already been unloaded')) {
            throw error;
          }
        }
        setRecording(null);
        recordingRef.current = null;
      }

      // Stop any ongoing alerts
      if (hazardAlertService && typeof (hazardAlertService as any).stopAlert === 'function') {
        (hazardAlertService as any).stopAlert();
      }
      setAlertMessage(null);
      setIsProcessing(false);
      isProcessingRef.current = false;
    } catch (error: any) {
      console.error('Error stopping recording:', error);
      setError(`Failed to stop recording: ${error.message}`);
    }
  };

  const dismissAlert = () => {
      if (hazardAlertService && typeof (hazardAlertService as any).stopAlert === 'function') {
        (hazardAlertService as any).stopAlert();
      }
    setAlertMessage(null);
    setDetections(null);
  };

  const formatHazardType = (type: string): string => {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <View style={styles.container}>
      {/* Header */}

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
                   source={require('../../assets/images/dino-listening.png')}
                   style={styles.dinoImage}
                   resizeMode="cover"
                   defaultSource={require('../../assets/images/icon.png')}
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

            {/* Instruction */}
            <Text style={styles.listeningInstruction}>
              Make a noise to see the circles grow!
            </Text>
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
          {detections && detections.detections.length > 0 ? (
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

        {/* Stop Listening Button - Only show when listening */}
        {isListening && (
          <TouchableOpacity
            style={styles.stopListeningButton}
            onPress={stopListening}>
            <View style={styles.stopButtonIcon}>
              <View style={styles.stopButtonInner} />
            </View>
            <Text style={styles.stopListeningText}>Stop Listening</Text>
          </TouchableOpacity>
        )}

        {/* Alert Message */}
      {alertMessage && detections?.highestPriority && (
        <Animated.View
          style={[
              styles.alertBanner,
            {
                backgroundColor: getAlertColor(detections.highestPriority.urgency),
              opacity: flashAnimation.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0.7],
              }),
            },
            ]}>
            <Text style={styles.alertBannerText}>{alertMessage}</Text>
            <TouchableOpacity onPress={dismissAlert} style={styles.alertDismiss}>
              <Text style={styles.alertDismissText}>✕</Text>
          </TouchableOpacity>
        </Animated.View>
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
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    padding: 4,
  },
  backArrow: {
    fontSize: 24,
    color: '#333',
    fontWeight: '600',
  },
  activeStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GREEN_BUTTON,
  },
  activeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  settingsButton: {
    padding: 4,
  },
  settingsIcon: {
    fontSize: 24,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#C4B5FD', // Light purple circle
    alignItems: 'center',
    justifyContent: 'center',
  },
  pawIcon: {
    fontSize: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  profileButton: {
    padding: 4,
  },
  profileIcon: {
    fontSize: 24,
    color: '#fff',
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
  listeningInstruction: {
    fontSize: 16,
    color: '#111827',
    textAlign: 'center',
    marginTop: 20,
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
  outerRing: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 2,
    borderColor: '#fff',
    borderStyle: 'dashed',
    opacity: 0.6,
  },
  innerRing: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    borderWidth: 2,
    borderColor: '#fff',
    borderStyle: 'dashed',
    opacity: 0.4,
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
  mainButtonActive: {
    backgroundColor: '#EF4444', // Red when stopping
  },
  mainButtonProcessing: {
    opacity: 0.8,
  },
  buttonIconContainer: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stopIcon: {
    width: 30,
    height: 30,
    backgroundColor: '#fff',
    borderRadius: 4,
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
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
  },
  alertBannerText: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  alertDismiss: {
    padding: 4,
  },
  alertDismissText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
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
