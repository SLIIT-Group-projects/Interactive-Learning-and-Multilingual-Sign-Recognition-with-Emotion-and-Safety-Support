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
  Vibration,
  Modal
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import apiService from '../../../services/api.service';
import hazardAlertService from '../../../services/hazardAlert.service';
import { useHazardDetection } from '../../contexts/HazardDetectionContext';

const PURPLE_GRADIENT = ['#5452e6ff', '#7C3AED']; // Purple gradient
const GREEN_BUTTON = '#10B981'; // Bright green
const ORANGE_ACCENT = '#F59E0B'; // Orange for accents

export default function HazardDetectionScreen() {
  const { userData } = useAuth();
  const { 
    isListening, 
    startListening, 
    stopListening, 
    isProcessing, 
    detections, 
    activeAlert, 
    isCriticalAlert,
    dismissAlert
  } = useHazardDetection();
  
  const [error, setError] = useState(null);
  
  // Animation values
  const circleAnimation1 = useRef(new Animated.Value(0)).current;
  const circleAnimation2 = useRef(new Animated.Value(0)).current;
  const circleAnimation3 = useRef(new Animated.Value(0)).current;
  const soundLevelAnimation = useRef(new Animated.Value(0)).current;
  const pulseAnimation = useRef(new Animated.Value(1)).current;
  const navigation = useNavigation();

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

  useEffect(() => {
    if (navigation) {
      navigation.setOptions({ headerShown: false });
    }
  }, [navigation]);

  useEffect(() => {
    if (isListening) {
      // Pulse animation for circles
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(circleAnimation1, { toValue: 1, duration: 1500, useNativeDriver: true }),
            Animated.timing(circleAnimation1, { toValue: 0, duration: 0, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(300),
            Animated.timing(circleAnimation2, { toValue: 1, duration: 1500, useNativeDriver: true }),
            Animated.timing(circleAnimation2, { toValue: 0, duration: 0, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(600),
            Animated.timing(circleAnimation3, { toValue: 1, duration: 1500, useNativeDriver: true }),
            Animated.timing(circleAnimation3, { toValue: 0, duration: 0, useNativeDriver: true }),
          ]),
        ])
      ).start();

      // Sound level animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(soundLevelAnimation, { toValue: 1, duration: 2000, useNativeDriver: false }),
          Animated.timing(soundLevelAnimation, { toValue: 0.2, duration: 2000, useNativeDriver: false }),
        ])
      ).start();
    } else {
      circleAnimation1.setValue(0);
      circleAnimation2.setValue(0);
      circleAnimation3.setValue(0);
      soundLevelAnimation.setValue(0);
    }
  }, [isListening]);

  // Pulse animation for start button
  useEffect(() => {
    if (!isListening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnimation, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnimation, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [isListening]);

  const formatHazardType = (type) => {
    return type.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  return (
    <View style={styles.container}>
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

            <View style={styles.dinoContainer}>
              <Animated.View style={[styles.concentricCircle, styles.circle3, { opacity: circleAnimation3.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }), transform: [{ scale: circleAnimation3.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }] }]} />
              <Animated.View style={[styles.concentricCircle, styles.circle2, { opacity: circleAnimation2.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] }), transform: [{ scale: circleAnimation2.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }] }]} />
              <Animated.View style={[styles.concentricCircle, styles.circle1, { opacity: circleAnimation1.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }), transform: [{ scale: circleAnimation1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }] }]} />

              <View style={styles.dinoCircle}>
                <Image source={require('../../../assets/images/dino-listening.png')} style={styles.dinoImage} resizeMode="cover" />
              </View>
            </View>

            <View style={styles.soundLevelContainer}>
              <View style={styles.soundLevelHeader}>
                <Text style={styles.soundLevelLabel}>Sound Level</Text>
                <Text style={styles.soundWaveEmoji}>📊</Text>
              </View>
              <View style={styles.soundLevelBarContainer}>
                <Animated.View style={[styles.soundLevelBar, { width: soundLevelAnimation.interpolate({ inputRange: [0, 1], outputRange: ['10%', '60%'] }) }]} />
              </View>
              <Text style={styles.detectingText}>DETECTING</Text>
            </View>

            <TouchableOpacity style={styles.stopListeningButton} onPress={stopListening}>
              <Text style={styles.stopListeningText}>All Done!</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Initial Screen */
          <View style={[styles.mainSection, { backgroundColor: PURPLE_GRADIENT[0] }]}>
            <Text style={styles.mainPrompt}>Let's listen!</Text>
            <Text style={styles.subPrompt}>What's that sound?</Text>
            <Text style={styles.instruction}>Tap the huge green button!</Text>

            <Animated.View style={[styles.buttonContainer, { transform: [{ scale: pulseAnimation }] }]}>
              <TouchableOpacity
                style={[styles.mainButton, isProcessing && styles.mainButtonProcessing]}
                onPress={startListening}
                disabled={isProcessing}
              >
                <Text style={styles.micIcon}>🎤</Text>
                <Text style={styles.buttonText}>START</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}

        {/* My Sounds Section */}
        {!isListening && (
          <View style={styles.mySoundsSection}>
            <View style={styles.mySoundsHeader}>
              <Text style={styles.mySoundsTitle}>Recent Detections</Text>
            </View>

            {detections && detections.detections && detections.detections.length > 0 ? (
              <View style={styles.soundsCardsContainer}>
                {detections.detections.slice(0, 2).map((detection, index) => (
                  <View key={index} style={[styles.soundCard, { backgroundColor: index % 2 === 0 ? '#FFF5E6' : '#E6F3FF' }]}>
                    <ExpoImage source={{ uri: getAnimatedIcon(detection.type) }} style={{ width: 60, height: 60 }} contentFit="contain" />
                    <Text style={styles.soundCardLabel}>{formatHazardType(detection.type)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.noSoundsContainer}>
                <Text style={styles.noSoundsText}>No sounds detected yet</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F3FF' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 40, flexGrow: 1 },
  mainSection: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 20, minHeight: 400 },
  listeningContainer: { flex: 1, justifyContent: 'center', backgroundColor: '#E8F4F8', paddingHorizontal: 20, paddingTop: 40, alignItems: 'center', minHeight: 600 },
  shhhTitle: { fontSize: 48, fontWeight: 'bold', color: '#111827', marginBottom: 8 },
  listeningSubtitle: { fontSize: 18, color: '#6B7280', marginBottom: 40 },
  dinoContainer: { width: 280, height: 280, alignItems: 'center', justifyContent: 'center', marginVertical: 30, position: 'relative' },
  concentricCircle: { position: 'absolute', borderRadius: 140, borderWidth: 2, borderColor: '#F59E0B' },
  circle1: { width: 200, height: 200 },
  circle2: { width: 240, height: 240 },
  circle3: { width: 280, height: 280 },
  dinoCircle: { width: 200, height: 200, borderRadius: 100, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  dinoImage: { width: 200, height: 200, borderRadius: 100 },
  soundLevelContainer: { width: '100%', marginTop: 40, marginBottom: 20 },
  soundLevelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  soundLevelLabel: { fontSize: 16, fontWeight: '600', color: '#111827' },
  soundWaveEmoji: { fontSize: 20 },
  soundLevelBarContainer: { width: '100%', height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  soundLevelBar: { height: '100%', backgroundColor: ORANGE_ACCENT, borderRadius: 4 },
  detectingText: { fontSize: 14, fontWeight: '600', color: ORANGE_ACCENT, textAlign: 'right' },
  stopListeningButton: { backgroundColor: '#FF6B6B', paddingVertical: 18, paddingHorizontal: 40, borderRadius: 30, marginTop: 40, borderWidth: 4, borderColor: '#E03131' },
  stopListeningText: { color: '#fff', fontSize: 22, fontWeight: '900' },
  mainPrompt: { fontSize: 42, fontWeight: '900', color: '#fff', textAlign: 'center' },
  subPrompt: { fontSize: 28, fontWeight: '700', color: 'rgba(255, 255, 255, 0.9)', marginBottom: 16, textAlign: 'center' },
  instruction: { fontSize: 20, color: '#FFD700', marginBottom: 35, fontWeight: '800', textAlign: 'center' },
  buttonContainer: { alignItems: 'center', justifyContent: 'center', width: 220, height: 220 },
  mainButton: { width: 180, height: 180, borderRadius: 90, backgroundColor: GREEN_BUTTON, alignItems: 'center', justifyContent: 'center', borderWidth: 6, borderColor: '#059669', elevation: 10 },
  mainButtonProcessing: { opacity: 0.7 },
  micIcon: { fontSize: 48, marginBottom: 4 },
  buttonText: { color: '#fff', fontSize: 24, fontWeight: '900' },
  mySoundsSection: { backgroundColor: '#fff', marginTop: -30, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, minHeight: 300 },
  mySoundsTitle: { fontSize: 22, fontWeight: 'bold', color: '#111827', marginBottom: 20 },
  soundsCardsContainer: { flexDirection: 'row', gap: 15 },
  soundCard: { flex: 1, borderRadius: 20, padding: 20, alignItems: 'center', borderWidth: 2, borderColor: '#eee' },
  soundCardLabel: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginTop: 10, textAlign: 'center' },
  noSoundsContainer: { padding: 40, alignItems: 'center' },
  noSoundsText: { color: '#9CA3AF', fontSize: 16 }
});
