import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, Animated, Image, StyleSheet, Alert } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useHazardDetection } from '../../contexts/HazardDetectionContext';
import { useAuth } from '../../contexts/AuthContext';
import apiService from '../../../services/api.service';

const ORANGE_ACCENT = '#F59E0B';
const GREEN_BUTTON = '#10B981';

export default function GlobalHazardAlert() {
  const { userData } = useAuth();
  const { activeAlert, isCriticalAlert, dismissAlert, detections } = useHazardDetection();

  // Animations
  const flashAnimation = useRef(new Animated.Value(0)).current;
  const popupAnimation = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const criticalPulseAnimation = useRef(new Animated.Value(1)).current;
  const criticalScaleAnimation = useRef(new Animated.Value(1)).current;
  const fireParticlesAnimation = useRef(new Animated.Value(0)).current;
  const smokeParticlesAnimation = useRef(new Animated.Value(0)).current;

  // Safety Check State
  const [showSafetyQuestionModal, setShowSafetyQuestionModal] = useState(false);
  const [safetyQuestionTitle, setSafetyQuestionTitle] = useState('Safety Check');
  const [safetyQuestionMessage, setSafetyQuestionMessage] = useState('');
  const [safetyQuestionStep, setSafetyQuestionStep] = useState(1);
  const [safetyQuestionTotal, setSafetyQuestionTotal] = useState(3);
  const [safetyQuestionGif, setSafetyQuestionGif] = useState('https://fonts.gstatic.com/s/e/notoemoji/latest/1f6e1_fe0f/512.gif');
  const safetyQuestionResolverRef = useRef(null);

  const getAlertColor = (urgency) => {
    switch (urgency) {
      case 'critical': return '#FF3B30';
      case 'high': return '#FF9500';
      case 'medium': return '#FFCC00';
      case 'low': return '#34C759';
      default: return GREEN_BUTTON;
    }
  };

  const getAnimatedIcon = (type) => {
    switch (type) {
      case 'fire_alarm': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/512.gif';
      case 'smoke_alarm': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f4a8/512.gif';
      case 'siren': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f6a8/512.gif';
      case 'glass_breaking': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f4a5/512.gif';
      case 'dog_barking': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f415/512.gif';
      case 'baby_crying': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f476/512.gif';
      case 'car_horn': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f697/512.gif';
      case 'gun_shot': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f50a/512.gif';
      default: return 'https://fonts.gstatic.com/s/e/notoemoji/latest/26a0_fe0f/512.gif';
    }
  };

  const formatHazardType = (type) => {
    return type?.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || 'Hazard';
  };

  // Animation logic
  useEffect(() => {
    if (activeAlert) {
      if (isCriticalAlert) {
        // Critical animations
        Animated.loop(
          Animated.sequence([
            Animated.timing(flashAnimation, { toValue: 1, duration: 300, useNativeDriver: false }),
            Animated.timing(flashAnimation, { toValue: 0, duration: 300, useNativeDriver: false }),
          ])
        ).start();

        Animated.loop(
          Animated.sequence([
            Animated.parallel([
              Animated.timing(criticalPulseAnimation, { toValue: 1.1, duration: 800, useNativeDriver: true }),
              Animated.timing(criticalScaleAnimation, { toValue: 1.05, duration: 800, useNativeDriver: true }),
            ]),
            Animated.parallel([
              Animated.timing(criticalPulseAnimation, { toValue: 1, duration: 800, useNativeDriver: true }),
              Animated.timing(criticalScaleAnimation, { toValue: 1, duration: 800, useNativeDriver: true }),
            ]),
          ])
        ).start();
      } else {
        // Non-critical popup animation
        Animated.parallel([
          Animated.spring(popupAnimation, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
          Animated.timing(backdropOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]).start();

        // Fire/Smoke specific particle animations
        if (activeAlert.type === 'fire_alarm') {
          Animated.loop(
            Animated.sequence([
              Animated.timing(fireParticlesAnimation, { toValue: 1, duration: 1000, useNativeDriver: true }),
              Animated.timing(fireParticlesAnimation, { toValue: 0, duration: 0, useNativeDriver: true }),
            ])
          ).start();
        } else if (activeAlert.type === 'smoke_alarm') {
          Animated.loop(
            Animated.sequence([
              Animated.timing(smokeParticlesAnimation, { toValue: 1, duration: 2000, useNativeDriver: true }),
              Animated.timing(smokeParticlesAnimation, { toValue: 0, duration: 0, useNativeDriver: true }),
            ])
          ).start();
        }
      }
    } else {
      // Reset animations
      flashAnimation.setValue(0);
      popupAnimation.setValue(0);
      backdropOpacity.setValue(0);
      criticalPulseAnimation.setValue(1);
      criticalScaleAnimation.setValue(1);
      fireParticlesAnimation.setValue(0);
      smokeParticlesAnimation.setValue(0);
    }
  }, [activeAlert, isCriticalAlert]);

  // Safety Check Logic
  const handleDismiss = async () => {
    const wasCritical = isCriticalAlert;
    dismissAlert();
    
    if (wasCritical) {
      setTimeout(() => {
        runPostCriticalSafetyCheck();
      }, 1000);
    }
  };

  const askYesNoQuestion = (title, message, questionIndex = 0, totalQuestions = 1) => {
    return new Promise((resolve) => {
      safetyQuestionResolverRef.current = resolve;
      setSafetyQuestionTitle(title);
      setSafetyQuestionMessage(message);
      setSafetyQuestionStep(questionIndex + 1);
      setSafetyQuestionTotal(totalQuestions);
      
      // Get appropriate GIF
      let gif = 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f6e1_fe0f/512.gif';
      if (questionIndex === 1) gif = 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/512.gif';
      else if (questionIndex === 2) gif = 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f64b/512.gif';
      setSafetyQuestionGif(gif);
      
      setShowSafetyQuestionModal(true);
    });
  };

  const handleSafetyQuestionAnswer = (answer) => {
    const resolver = safetyQuestionResolverRef.current;
    safetyQuestionResolverRef.current = null;
    setShowSafetyQuestionModal(false);
    if (typeof resolver === 'function') {
      resolver(answer);
    }
  };

  const runPostCriticalSafetyCheck = async () => {
    const userId = userData?.uid;
    if (!userId) return;

    const safetyQuestions = [
      'Are you safe now?',
      'Is there still fire or danger around you?',
      'Do you need help right now?',
    ];

    try {
      const responses = [];
      for (let i = 0; i < safetyQuestions.length; i++) {
        const answer = await askYesNoQuestion('Safety Check', safetyQuestions[i], i, safetyQuestions.length);
        responses.push({ question: safetyQuestions[i], answer });
      }

      const childConfirmedSafe = responses[0]?.answer === true && responses[1]?.answer === false && responses[2]?.answer === false;

      await apiService.submitCriticalSafetyCheck({
        soundId: detections?.metadata?.highestPrioritySoundId || null,
        userId,
        hazardType: activeAlert?.type || null,
        childConfirmedSafe,
        responses,
      });

      Alert.alert(
        'Safety Check Shared',
        childConfirmedSafe 
          ? 'Great! Your safety update was sent to your parent.' 
          : 'Thanks. Your answers were sent to your parent for quick support.'
      );
    } catch (error) {
      console.error('❌ Failed to submit safety check:', error);
    }
  };

  if (!activeAlert && !showSafetyQuestionModal) return null;

  return (
    <>
      {/* Alert Overlay/Modal */}
      {activeAlert && (
        <Modal transparent animationType="fade" visible={!!activeAlert}>
          {isCriticalAlert ? (
            /* CRITICAL FULL SCREEN ALERT */
            <View style={styles.criticalOverlay}>
              <Animated.View 
                style={[
                  styles.criticalOverlayBackground, 
                  { opacity: criticalPulseAnimation.interpolate({ inputRange: [0.9, 1, 1.1], outputRange: [0.95, 1, 0.95] }) }
                ]} 
              />
              <Animated.View 
                style={[
                  styles.criticalFlashOverlay, 
                  { opacity: flashAnimation.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.3, 0] }) }
                ]} 
              />
              
              <Animated.View style={[styles.criticalContent, { transform: [{ scale: criticalScaleAnimation }] }]}>
                <Animated.View style={{ transform: [{ scale: criticalPulseAnimation }] }}>
                  <ExpoImage 
                    source={{ uri: getAnimatedIcon(activeAlert.type) }} 
                    style={{ width: 150, height: 150, marginBottom: 30 }} 
                    contentFit="contain" 
                  />
                </Animated.View>
                <Text style={styles.criticalTitle}>WATCH OUT!</Text>
                <Text style={styles.criticalMessage}>{activeAlert.message}</Text>
                <Text style={styles.criticalSubtext}>Are you safe? Tap the button below!</Text>
                
                {/* Fire Particles */}
                {activeAlert.type === 'fire_alarm' && (
                  <>
                    <Animated.View style={[styles.fireParticle, { bottom: 100, left: 40, opacity: fireParticlesAnimation, transform: [{ translateY: fireParticlesAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, -100] }) }, { scale: fireParticlesAnimation }] }]} />
                    <Animated.View style={[styles.fireParticle, { bottom: 80, right: 50, opacity: fireParticlesAnimation, transform: [{ translateY: fireParticlesAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, -120] }) }, { scale: fireParticlesAnimation }] }]} />
                    <Animated.View style={[styles.fireParticle, { bottom: 120, left: '50%', opacity: fireParticlesAnimation, transform: [{ translateY: fireParticlesAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, -150] }) }, { scale: fireParticlesAnimation }] }]} />
                  </>
                )}

                {/* Smoke Particles */}
                {activeAlert.type === 'smoke_alarm' && (
                  <>
                    <Animated.View style={[styles.smokeParticle, { top: 100, left: 30, opacity: smokeParticlesAnimation.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.5, 0] }), transform: [{ translateX: smokeParticlesAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, 50] }) }] }]} />
                    <Animated.View style={[styles.smokeParticle, { top: 150, right: 40, opacity: smokeParticlesAnimation.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.4, 0] }), transform: [{ translateX: smokeParticlesAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) }] }]} />
                  </>
                )}

                <TouchableOpacity style={styles.criticalDismissButton} onPress={handleDismiss}>
                  <Text style={styles.criticalDismissButtonText}>I'M SAFE NOW!</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          ) : (
            /* STANDARD POPUP ALERT */
            <View style={styles.popupBackdropContainer}>
              <Animated.View style={[styles.popupBackdrop, { opacity: backdropOpacity.interpolate({ inputRange: [0, 1], outputRange: [0, 0.8] }) }]} />
              
              <Animated.View 
                style={[
                  styles.popupContainer, 
                  { transform: [{ translateY: popupAnimation.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }) }] }
                ]}
              >
                <View style={styles.popupHandle} />
                <View style={styles.popupHeader}>
                  <View style={[styles.popupIconContainer, { backgroundColor: getAlertColor(activeAlert.urgency || 'medium') }]}>
                    <ExpoImage source={{ uri: getAnimatedIcon(activeAlert.type) }} style={{ width: 75, height: 75 }} contentFit="contain" />
                  </View>
                  <Text style={styles.popupTitle}>NEW SOUND DETECTED!</Text>
                </View>
                
                <View style={styles.popupContentCard}>
                  <Text style={styles.popupHazardName}>{formatHazardType(activeAlert.type)}</Text>
                  <Text style={styles.popupMessage}>{activeAlert.message}</Text>
                </View>
                
                <TouchableOpacity 
                  style={[styles.popupActionButton, { backgroundColor: getAlertColor(activeAlert.urgency || 'medium') }]} 
                  onPress={handleDismiss}
                >
                  <Text style={styles.popupActionButtonText}>GOT IT!</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          )}
        </Modal>
      )}

      {/* Safety Question Modal */}
      <Modal visible={showSafetyQuestionModal} transparent animationType="fade">
        <View style={styles.safetyQuestionOverlay}>
          <View style={styles.safetyQuestionCard}>
            <ExpoImage source={{ uri: safetyQuestionGif }} style={styles.safetyQuestionGif} contentFit="contain" />
            <Text style={styles.safetyQuestionTitle}>{safetyQuestionTitle}</Text>
            <Text style={styles.safetyQuestionProgress}>Question {safetyQuestionStep} of {safetyQuestionTotal}</Text>
            <Text style={styles.safetyQuestionMessage}>{safetyQuestionMessage}</Text>
            
            <View style={styles.safetyQuestionButtonsRow}>
              <TouchableOpacity style={[styles.safetyQuestionButton, styles.safetyQuestionNoButton]} onPress={() => handleSafetyQuestionAnswer(false)}>
                <Text style={styles.safetyQuestionButtonText}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.safetyQuestionButton, styles.safetyQuestionYesButton]} onPress={() => handleSafetyQuestionAnswer(true)}>
                <Text style={styles.safetyQuestionButtonText}>Yes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Critical Overlay Styles
  criticalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  criticalOverlayBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FF3B30',
  },
  criticalFlashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'white',
  },
  criticalContent: {
    width: '90%',
    backgroundColor: 'white',
    borderRadius: 40,
    padding: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 25,
  },
  criticalTitle: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FF3B30',
    marginBottom: 10,
    textAlign: 'center',
  },
  criticalMessage: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 20,
  },
  criticalSubtext: {
    fontSize: 18,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 30,
  },
  criticalDismissButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 30,
    width: '100%',
  },
  criticalDismissButtonText: {
    color: 'white',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },

  // Popup Styles
  popupBackdropContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  popupBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'black',
  },
  popupContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    padding: 30,
    paddingBottom: 50,
    alignItems: 'center',
  },
  popupHandle: {
    width: 60,
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    marginBottom: 25,
  },
  popupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 25,
    gap: 15,
  },
  popupIconContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  popupTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    flex: 1,
  },
  popupContentCard: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: 24,
    padding: 20,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  popupHazardName: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 8,
  },
  popupMessage: {
    fontSize: 18,
    color: '#4B5563',
    lineHeight: 26,
  },
  popupActionButton: {
    width: '100%',
    paddingVertical: 20,
    borderRadius: 24,
    alignItems: 'center',
  },
  popupActionButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '900',
  },

  // Safety Question Styles
  safetyQuestionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  safetyQuestionCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'white',
    borderRadius: 30,
    padding: 30,
    alignItems: 'center',
  },
  safetyQuestionGif: {
    width: 120,
    height: 120,
    marginBottom: 20,
  },
  safetyQuestionTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 5,
  },
  safetyQuestionProgress: {
    fontSize: 16,
    color: ORANGE_ACCENT,
    fontWeight: '700',
    marginBottom: 15,
  },
  safetyQuestionMessage: {
    fontSize: 20,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 28,
  },
  safetyQuestionButtonsRow: {
    flexDirection: 'row',
    gap: 15,
    width: '100%',
  },
  safetyQuestionButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 15,
    alignItems: 'center',
  },
  safetyQuestionNoButton: {
    backgroundColor: '#F3F4F6',
  },
  safetyQuestionYesButton: {
    backgroundColor: GREEN_BUTTON,
  },
  safetyQuestionButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  fireParticle: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFAC1C',
    zIndex: -1,
  },
  smokeParticle: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(128, 128, 128, 0.5)',
    zIndex: -1,
  },
});
