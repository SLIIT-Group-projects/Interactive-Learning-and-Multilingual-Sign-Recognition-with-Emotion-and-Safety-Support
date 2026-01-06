import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ChildDashboard = ({ navigation }) => {
  // Mock data stored in local state
  const [childName] = useState('Alex');
  const [lettersLearned] = useState(12);
  const [totalLetters] = useState(26);
  const [starsEarned] = useState(45);
  const [badgesUnlocked] = useState(1);
  const [badgeName] = useState('Beginner');

  // Calculate progress percentage
  const progressPercentage = (lettersLearned / totalLetters) * 100;

  // Animation for progress bar
  const progressAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progressPercentage,
      duration: 1000,
      useNativeDriver: false,
    }).start();
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  // Navigation handlers
  const handleLearnSigns = () => {
    if (navigation && navigation.navigate) {
      navigation.navigate('LearnSigns');
    } else {
      console.log('Navigate to Learn Signs screen');
    }
  };

  const handlePlayGame = () => {
    if (navigation && navigation.navigate) {
      navigation.navigate('PlayGame');
    } else {
      console.log('Navigate to Play Game screen');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-blue-50">
      <View className="flex-1 px-6 pt-4">
        {/* Header Section */}
        <View className="flex-row items-center justify-between mb-6">
          <View className="flex-row items-center">
            <View className="w-16 h-16 rounded-full bg-purple-200 items-center justify-center mr-4">
              <Text className="text-3xl">👤</Text>
            </View>
            <View>
              <Text className="text-3xl font-bold text-gray-800">
                Hello {childName} 👋
              </Text>
            </View>
          </View>
        </View>

        {/* Progress Overview Card */}
        <View className="bg-white rounded-3xl p-6 mb-6 shadow-lg">
          <Text className="text-xl font-bold text-gray-800 mb-4">
            Your Progress
          </Text>
          <Text className="text-base text-gray-600 mb-4">
            You have learned {lettersLearned} out of {totalLetters} letters
          </Text>
          
          {/* Progress Bar */}
          <View className="h-6 bg-gray-200 rounded-full overflow-hidden">
            <Animated.View
              className="h-full rounded-full"
              style={{ 
                width: progressWidth,
                backgroundColor: '#60a5fa', // blue-400
              }}
            />
          </View>
          
          <View className="flex-row justify-between mt-2">
            <Text className="text-sm text-gray-500">0</Text>
            <Text className="text-sm text-gray-500">{totalLetters}</Text>
          </View>
        </View>

        {/* Gamification Section */}
        <View className="flex-row justify-between mb-6">
          {/* Stars Card */}
          <View className="bg-yellow-100 rounded-2xl p-5 flex-1 mr-3 items-center shadow-md">
            <Text className="text-5xl mb-2">⭐</Text>
            <Text className="text-3xl font-bold text-yellow-700 mb-1">
              {starsEarned}
            </Text>
            <Text className="text-sm text-yellow-600 font-semibold">
              Stars Earned
            </Text>
          </View>

          {/* Badges Card */}
          <View className="bg-green-100 rounded-2xl p-5 flex-1 ml-3 items-center shadow-md">
            <Text className="text-5xl mb-2">🎖</Text>
            <Text className="text-3xl font-bold text-green-700 mb-1">
              {badgesUnlocked}
            </Text>
            <Text className="text-sm text-green-600 font-semibold text-center">
              {badgeName} Badge
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View className="mb-6">
          {/* Learn Signs Button */}
          <TouchableOpacity
            onPress={handleLearnSigns}
            className="rounded-3xl p-6 mb-4 shadow-lg"
            activeOpacity={0.8}
            style={styles.learnButton}
          >
            <View className="flex-row items-center justify-center">
              <Text className="text-4xl mr-4">📘</Text>
              <Text className="text-2xl font-bold text-white">
                Learn Signs
              </Text>
            </View>
          </TouchableOpacity>

          {/* Play Game Button */}
          <TouchableOpacity
            onPress={handlePlayGame}
            className="rounded-3xl p-6 shadow-lg"
            activeOpacity={0.8}
            style={styles.gameButton}
          >
            <View className="flex-row items-center justify-center">
              <Text className="text-4xl mr-4">🎮</Text>
              <Text className="text-2xl font-bold text-white">
                Play Game
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Motivation Message */}
        <View className="bg-pink-100 rounded-2xl p-5 items-center shadow-md">
          <Text className="text-xl font-semibold text-gray-800 text-center">
            Keep going! You're doing great 🌟
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  learnButton: {
    backgroundColor: '#3b82f6', // blue-500
  },
  gameButton: {
    backgroundColor: '#a855f7', // purple-500
  },
});

export default ChildDashboard;

