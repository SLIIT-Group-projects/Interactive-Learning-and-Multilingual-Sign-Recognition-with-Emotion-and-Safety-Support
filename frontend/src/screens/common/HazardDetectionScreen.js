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
  Modal,
  Dimensions,
  Easing
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons, Ionicons, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { useHazardDetection } from '../../contexts/HazardDetectionContext';

const { width, height } = Dimensions.get('window');

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
  const navigation = useNavigation();
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const circleAnimation1 = useRef(new Animated.Value(0)).current;
  const circleAnimation2 = useRef(new Animated.Value(0)).current;
  const circleAnimation3 = useRef(new Animated.Value(0)).current;
  const pulseAnimation = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(bounceAnim, { toValue: 1, friction: 3, useNativeDriver: true })
    ]).start();

    // Floating loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (isListening) {
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(circleAnimation1, { toValue: 1, duration: 2000, useNativeDriver: true }),
            Animated.timing(circleAnimation1, { toValue: 0, duration: 0, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(500),
            Animated.timing(circleAnimation2, { toValue: 1, duration: 2000, useNativeDriver: true }),
            Animated.timing(circleAnimation2, { toValue: 0, duration: 0, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(1000),
            Animated.timing(circleAnimation3, { toValue: 1, duration: 2000, useNativeDriver: true }),
            Animated.timing(circleAnimation3, { toValue: 0, duration: 0, useNativeDriver: true }),
          ]),
        ])
      ).start();
    } else {
      circleAnimation1.setValue(0);
      circleAnimation2.setValue(0);
      circleAnimation3.setValue(0);
    }
  }, [isListening]);

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

  const getAnimatedIcon = (type) => {
    switch (type) {
      case 'fire_alarm': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/512.gif';
      case 'smoke_alarm': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f4a8/512.gif';
      case 'siren': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f6a8/512.gif';
      case 'glass_breaking': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f4a5/512.gif';
      case 'dog_barking': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f415/512.gif';
      case 'baby_crying': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f476/512.gif';
      case 'car_horn': return 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f697/512.gif';
      default: return 'https://fonts.gstatic.com/s/e/notoemoji/latest/26a0_fe0f/512.gif';
    }
  };

  const formatHazardType = (type) => {
    return type.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const floatY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -15],
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#a855f7', '#d946ef']} className="h-80 absolute top-0 left-0 right-0 rounded-b-[60px]" />
      
      {/* Floating Magic Decorations */}
      <Animated.View style={{ position: 'absolute', top: 120, right: 30, transform: [{ translateY: floatY }] }}>
        <MaterialCommunityIcons name="star-face" size={40} color="rgba(255,255,255,0.4)" />
      </Animated.View>
      <Animated.View style={{ position: 'absolute', top: 350, left: 20, transform: [{ translateY: floatY }] }}>
        <MaterialCommunityIcons name="heart-flash" size={30} color="rgba(168,85,247,0.2)" />
      </Animated.View>

      <SafeAreaView className="flex-1">
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <Animated.View style={{ opacity: fadeAnim }} className="px-6 pt-4">
            
            {/* Header */}
            <View className="flex-row items-center justify-between mb-8">
              <TouchableOpacity onPress={() => navigation.goBack()} className="bg-white/30 rounded-full p-3 backdrop-blur-md">
                <Ionicons name="chevron-back" size={24} color="white" />
              </TouchableOpacity>
              <Text className="text-white text-2xl font-black">Dino Ears 🦖</Text>
              <View className="w-12" />
            </View>

            {isListening ? (
              /* Listening Mode */
              <View className="items-center">
                <Text className="text-white text-3xl font-black mb-2">Shhh... 🤫</Text>
                <Text className="text-white/80 text-lg font-bold mb-10">Dino is listening for danger!</Text>

                <View style={styles.dinoContainer}>
                  <Animated.View style={[styles.magicCircle, { opacity: circleAnimation3.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: circleAnimation3.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }] }]} />
                  <Animated.View style={[styles.magicCircle, { opacity: circleAnimation2.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }), transform: [{ scale: circleAnimation2.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }] }]} />
                  <Animated.View style={[styles.magicCircle, { opacity: circleAnimation1.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ scale: circleAnimation1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }] }]} />
                  
                  <View className="w-52 h-52 rounded-full bg-white border-8 border-purple-200 shadow-2xl items-center justify-center overflow-hidden">
                    <Image source={require('../../../assets/images/dino-listening.png')} style={styles.dinoImage} />
                  </View>
                </View>

                <TouchableOpacity 
                  onPress={stopListening}
                  className="bg-purple-600 px-12 py-5 rounded-[35px] mt-16 shadow-2xl border-b-8 border-purple-800 active:border-b-0 active:mt-[68px]"
                >
                  <Text className="text-white text-xl font-black">Stop Listening</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Start Mode */
              <View>
                <View className="bg-white rounded-[45px] p-8 mb-8 shadow-2xl shadow-purple-200 border-b-8 border-purple-100 items-center">
                  <Text className="text-purple-900 text-3xl font-black mb-2">Ready to Listen?</Text>
                  <Text className="text-purple-400 text-center font-bold mb-8">Tap Dino to start protecting you!</Text>
                  
                  <Animated.View style={{ transform: [{ scale: pulseAnimation }] }}>
                    <TouchableOpacity 
                      onPress={startListening}
                      className="w-52 h-52 rounded-full bg-purple-100 border-8 border-purple-200 shadow-xl items-center justify-center overflow-hidden"
                    >
                      <Image source={require('../../../assets/images/dino-listening.png')} style={styles.dinoImage} />
                      <View className="absolute inset-0 bg-purple-600/10 items-center justify-center">
                        <MaterialCommunityIcons name="microphone-outline" size={60} color="#a855f7" />
                      </View>
                    </TouchableOpacity>
                  </Animated.View>

                  <TouchableOpacity 
                    onPress={startListening}
                    className="bg-purple-600 px-12 py-5 rounded-[35px] mt-10 shadow-2xl border-b-8 border-purple-800"
                  >
                    <Text className="text-white text-xl font-black">START MAGIC</Text>
                  </TouchableOpacity>
                </View>

                {/* Recent Sounds */}
                <Text className="text-purple-900 text-2xl font-black mb-4 px-2">What we heard 👂</Text>
                {detections?.detections?.length > 0 ? (
                  <View className="flex-row flex-wrap justify-between">
                    {detections.detections.slice(0, 4).map((detection, index) => (
                      <View 
                        key={index} 
                        style={{ width: (width - 60) / 2 }}
                        className="bg-white rounded-[40px] p-6 mb-4 shadow-lg shadow-purple-100 border-b-8 border-purple-50 items-center"
                      >
                        <ExpoImage source={{ uri: getAnimatedIcon(detection.type) }} style={{ width: 60, height: 60 }} contentFit="contain" />
                        <Text className="text-purple-900 font-black text-center mt-3">{formatHazardType(detection.type)}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View className="bg-purple-100/50 rounded-[40px] p-10 items-center border-2 border-dashed border-purple-200">
                    <MaterialCommunityIcons name="ear-hearing" size={40} color="#a855f7" />
                    <Text className="text-purple-400 font-bold mt-4">Quiet for now...</Text>
                  </View>
                )}
              </View>
            )}

          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF5FF' },
  dinoContainer: { width: 300, height: 300, alignItems: 'center', justifyContent: 'center', marginVertical: 20 },
  magicCircle: { position: 'absolute', width: 220, height: 220, borderRadius: 110, borderWidth: 4, borderColor: '#fff' },
  dinoImage: { width: '100%', height: '100%', opacity: 0.9 },
});
