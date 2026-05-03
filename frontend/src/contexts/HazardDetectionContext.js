import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';
import { Alert, Platform } from 'react-native';
import { useAuth } from './AuthContext';
import apiService from '../../services/api.service';
import hazardAlertService from '../../services/hazardAlert.service';

const HazardDetectionContext = createContext({});

export const useHazardDetection = () => {
  const context = useContext(HazardDetectionContext);
  if (!context) {
    throw new Error('useHazardDetection must be used within a HazardDetectionProvider');
  }
  return context;
};

export const HazardDetectionProvider = ({ children }) => {
  const { userData } = useAuth();
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detections, setDetections] = useState(null);
  const [activeAlert, setActiveAlert] = useState(null);
  const [error, setError] = useState(null);
  const [isCriticalAlert, setIsCriticalAlert] = useState(false);

  // Refs for background processing loop
  const recordingRef = useRef(null);
  const isListeningRef = useRef(false);
  const processingIntervalRef = useRef(null);
  const detectionHistoryRef = useRef([]);
  const lastAlertTimeRef = useRef(new Map());
  const criticalAlertRef = useRef(false);
  const currentAlertPriorityRef = useRef(0);
  const locationPermissionGrantedRef = useRef(null);
  const lastLocationFetchRef = useRef(0);

  // Constants
  const MAX_HISTORY_SIZE = 5;
  const ALERT_COOLDOWN_MS = 8000;
  const CHUNK_DURATION_MS = 4000;
  const MIN_CHUNK_DURATION_MS = 3500;

  const stopAlertVibration = useCallback(() => {
    if (hazardAlertService) {
      hazardAlertService.stopAlert();
    }
  }, []);

  const startAlertVibration = useCallback(async (level) => {
    try {
      if (!hazardAlertService) return;
      await hazardAlertService.startContinuousVibration(
        level === 'critical' ? 'critical' : (level === 'high' ? 'high' : 'medium')
      );
    } catch (err) {
      console.warn('⚠️ Vibration error:', err);
    }
  }, []);

  const getCurrentLocationForHazard = useCallback(async () => {
    const now = Date.now();
    try {
      if (locationPermissionGrantedRef.current !== true) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        locationPermissionGrantedRef.current = status === 'granted';
      }

      if (!locationPermissionGrantedRef.current) return null;

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const locationData = {
        type: 'Point',
        coordinates: [loc.coords.longitude, loc.coords.latitude],
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };

      lastLocationFetchRef.current = now;
      return locationData;
    } catch (error) {
      console.error('❌ Error getting current location:', error);
      return null;
    }
  }, []);

  const dismissAlert = useCallback(() => {
    stopAlertVibration();
    setActiveAlert(null);
    setIsCriticalAlert(false);
    criticalAlertRef.current = false;
    currentAlertPriorityRef.current = 0;
    setDetections(null);
  }, [stopAlertVibration]);

  const restartRecording = useCallback(async () => {
    try {
      if (!isListeningRef.current) return null;

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

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
      });

      const { recording: newRec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = newRec;
      return newRec;
    } catch (error) {
      console.error('❌ Error restarting recording:', error);
      throw error;
    }
  }, []);

  const processAudioChunk = useCallback(async (recording) => {
    if (!recording) return;

    try {
      let statusBeforeStop;
      try {
        statusBeforeStop = await recording.getStatusAsync();
      } catch (e) {
        if (isListeningRef.current) await restartRecording();
        return;
      }

      if (!statusBeforeStop.isRecording) {
        if (isListeningRef.current) await restartRecording();
        return;
      }

      setIsProcessing(true);

      try {
        await recording.stopAndUnloadAsync();
      } catch (e) {
        console.warn('⚠️ Error unloading chunk:', e.message);
      }

      const uri = recording.getURI();
      if (!uri) {
        if (isListeningRef.current) await restartRecording();
        setIsProcessing(false);
        return;
      }

      const context = {
        userId: userData?.uid || null,
        location: null,
        time: new Date().toISOString(),
      };

      const response = await apiService.detectHazards(uri, context);
      
      if (response.success && response.data) {
        const highestPriority = response.data.highestPriority;
        if (highestPriority) {
          const priority = highestPriority.priority || 0;
          const currentCriticalPriority = currentAlertPriorityRef.current;
          const hasActiveCriticalAlert = criticalAlertRef.current;

          setDetections(response.data);

          if (!hasActiveCriticalAlert || priority >= 9) {
            
            // Alert logic
            const hazardType = highestPriority.type;
            const confidence = highestPriority.confidence || 0;
            const now = Date.now();

            detectionHistoryRef.current.push({ type: hazardType, confidence, priority, timestamp: now });
            if (detectionHistoryRef.current.length > MAX_HISTORY_SIZE) detectionHistoryRef.current.shift();

            const lastAlertTime = lastAlertTimeRef.current.get(hazardType) || 0;
            const isOnCooldown = (now - lastAlertTime) < ALERT_COOLDOWN_MS;

            // Simplified alerting logic for the context
            const FULLSCREEN_ALERT_TYPES = ['fire_alarm', 'smoke_alarm', 'gun_shot', 'siren'];
            const currentHour = new Date().getHours();
            const isNightTime = currentHour >= 22 || currentHour < 6;
            if (isNightTime) {
              FULLSCREEN_ALERT_TYPES.push('dog_barking');
            }
            const isCritical = priority >= 9 && FULLSCREEN_ALERT_TYPES.includes(hazardType);

            if (!isOnCooldown && confidence >= 0.65) {
              if (!hasActiveCriticalAlert || priority >= currentCriticalPriority) {
                const message = `Alert: ${hazardType.replace(/_/g, ' ')} detected`;
                setActiveAlert({ ...highestPriority, message });
                setIsCriticalAlert(isCritical);
                criticalAlertRef.current = isCritical;
                currentAlertPriorityRef.current = priority;
                lastAlertTimeRef.current.set(hazardType, now);

                if (isCritical) {
                  await startAlertVibration('critical');
                  const location = await getCurrentLocationForHazard();
                  if (location && response.data.metadata?.highestPrioritySoundId) {
                    apiService.reportCriticalLocation(
                      response.data.metadata.highestPrioritySoundId,
                      userData.uid,
                      location
                    ).catch(console.error);
                  }
                } else if (priority >= 7) {
                  await startAlertVibration('high');
                } else if (priority >= 5) {
                  await startAlertVibration('medium');
                }
              }
            }
          }
        }
      }

      if (isListeningRef.current) await restartRecording();
    } catch (error) {
      console.error('❌ Error processing audio chunk:', error);
      if (isListeningRef.current) await restartRecording();
    } finally {
      setIsProcessing(false);
    }
  }, [userData?.uid, getCurrentLocationForHazard, restartRecording, startAlertVibration]);

  const startListening = useCallback(async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission Required', 'Microphone permission is required.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = newRecording;
      setIsListening(true);
      isListeningRef.current = true;

      processingIntervalRef.current = setInterval(async () => {
        const currentRecording = recordingRef.current;
        if (!currentRecording) {
          if (isListeningRef.current) await restartRecording();
          return;
        }

        try {
          const status = await currentRecording.getStatusAsync();
          if (status.isRecording && status.durationMillis >= MIN_CHUNK_DURATION_MS) {
            await processAudioChunk(currentRecording);
          }
        } catch (e) {
          if (isListeningRef.current) await restartRecording();
        }
      }, CHUNK_DURATION_MS);

    } catch (error) {
      console.error('Error starting listening:', error);
      setIsListening(false);
      isListeningRef.current = false;
    }
  }, [processAudioChunk, restartRecording]);

  const stopListening = useCallback(async () => {
    setIsListening(false);
    isListeningRef.current = false;
    if (processingIntervalRef.current) {
      clearInterval(processingIntervalRef.current);
      processingIntervalRef.current = null;
    }
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (e) {}
      recordingRef.current = null;
    }
    stopAlertVibration();
    setActiveAlert(null);
    setIsCriticalAlert(false);
    criticalAlertRef.current = false;
    currentAlertPriorityRef.current = 0;
  }, [stopAlertVibration]);

  useEffect(() => {
    return () => {
      if (processingIntervalRef.current) clearInterval(processingIntervalRef.current);
    };
  }, []);

  const value = {
    isListening,
    isProcessing,
    detections,
    activeAlert,
    isCriticalAlert,
    startListening,
    stopListening,
    dismissAlert,
  };

  return (
    <HazardDetectionContext.Provider value={value}>
      {children}
    </HazardDetectionContext.Provider>
  );
};
