import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ALPHABET = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
const TOTAL_LETTERS = ALPHABET.length;

const LearnSigns = ({ navigation }) => {
  const [currentLetterIndex, setCurrentLetterIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const currentLetter = ALPHABET[currentLetterIndex];
  const currentLetterNumber = currentLetterIndex + 1;

  // Navigation handlers
  const handleBack = () => {
    if (navigation && navigation.goBack) {
      navigation.goBack();
    } else {
      console.log('Navigate back to Child Dashboard');
    }
  };

  const handlePrevious = () => {
    if (currentLetterIndex > 0) {
      setCurrentLetterIndex(currentLetterIndex - 1);
      setIsPlaying(false);
    }
  };

  const handleNext = () => {
    if (currentLetterIndex < TOTAL_LETTERS - 1) {
      setCurrentLetterIndex(currentLetterIndex + 1);
      setIsPlaying(false);
    }
  };

  const handlePlayReplay = () => {
    setIsPlaying(true);
    // Simulate video playback
    setTimeout(() => {
      setIsPlaying(false);
    }, 2000);
  };

  return (
    <SafeAreaView className="flex-1 bg-blue-50">
      <View className="flex-1 px-6 pt-4">
        {/* Header Section */}
        <View className="flex-row items-center mb-6">
          <TouchableOpacity
            onPress={handleBack}
            className="mr-4 p-2"
            activeOpacity={0.7}
          >
            <Text className="text-4xl">←</Text>
          </TouchableOpacity>
          <Text className="text-3xl font-bold text-gray-800">
            Learn Signs
          </Text>
        </View>

        {/* Current Letter Display */}
        <View className="items-center mb-6">
          <Text className="text-9xl font-bold text-gray-800">
            {currentLetter}
          </Text>
        </View>

        {/* Sign Demonstration Area */}
        <View className="bg-white rounded-3xl p-8 mb-6 shadow-lg items-center">
          {/* Placeholder for ASL sign image/video */}
          <View className="w-full h-64 bg-gray-100 rounded-2xl items-center justify-center mb-4">
            <Text className="text-6xl mb-2">👋</Text>
            <Text className="text-lg text-gray-500">
              ASL Sign for {currentLetter}
            </Text>
            {isPlaying && (
              <View className="absolute">
                <Text className="text-4xl">▶</Text>
              </View>
            )}
          </View>
          
          <Text className="text-xl font-semibold text-gray-800 text-center">
            This is how we sign {currentLetter}
          </Text>
        </View>

        {/* Learning Controls */}
        <View className="mb-6">
          {/* Play/Replay Button */}
          <TouchableOpacity
            onPress={handlePlayReplay}
            className="bg-green-500 rounded-3xl p-6 mb-4 shadow-lg"
            activeOpacity={0.8}
            style={styles.playButton}
          >
            <View className="flex-row items-center justify-center">
              <Text className="text-4xl mr-3">
                {isPlaying ? '⏸' : '▶'}
              </Text>
              <Text className="text-2xl font-bold text-white">
                {isPlaying ? 'Playing...' : 'Play / Replay'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Navigation Buttons Row */}
          <View className="flex-row justify-between">
            {/* Previous Button */}
            <TouchableOpacity
              onPress={handlePrevious}
              disabled={currentLetterIndex === 0}
              className="bg-blue-500 rounded-3xl p-5 flex-1 mr-2 shadow-lg"
              activeOpacity={0.8}
              style={[
                styles.navButton,
                currentLetterIndex === 0 && styles.disabledButton,
              ]}
            >
              <View className="flex-row items-center justify-center">
                <Text className="text-3xl mr-2">⏮</Text>
                <Text className="text-xl font-bold text-white">
                  Previous
                </Text>
              </View>
            </TouchableOpacity>

            {/* Next Button */}
            <TouchableOpacity
              onPress={handleNext}
              disabled={currentLetterIndex === TOTAL_LETTERS - 1}
              className="bg-purple-500 rounded-3xl p-5 flex-1 ml-2 shadow-lg"
              activeOpacity={0.8}
              style={[
                styles.navButton,
                currentLetterIndex === TOTAL_LETTERS - 1 && styles.disabledButton,
              ]}
            >
              <View className="flex-row items-center justify-center">
                <Text className="text-xl font-bold text-white mr-2">
                  Next
                </Text>
                <Text className="text-3xl">⏭</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Progress Indicator */}
        <View className="bg-white rounded-2xl p-4 mb-4 shadow-md">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-lg font-semibold text-gray-700">
              Letter {currentLetterNumber} of {TOTAL_LETTERS}
            </Text>
            <Text className="text-lg font-semibold text-gray-700">
              {Math.round((currentLetterNumber / TOTAL_LETTERS) * 100)}%
            </Text>
          </View>
          
          {/* Mini Progress Bar */}
          <View className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <View
              className="h-full bg-blue-500 rounded-full"
              style={{
                width: `${(currentLetterNumber / TOTAL_LETTERS) * 100}%`,
              }}
            />
          </View>
        </View>

        {/* Encouragement Text */}
        <View className="bg-yellow-100 rounded-2xl p-5 items-center shadow-md">
          <Text className="text-xl font-semibold text-gray-800 text-center">
            Great job! Keep learning 🌟
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  playButton: {
    backgroundColor: '#10b981', // green-500
  },
  navButton: {
    minHeight: 60,
  },
  disabledButton: {
    opacity: 0.5,
  },
});

export default LearnSigns;

