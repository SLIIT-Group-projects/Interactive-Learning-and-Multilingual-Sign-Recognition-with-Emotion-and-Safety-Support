import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { useAuth } from "../../contexts/AuthContext";
import XPProgressBar from "../../components/XPProgressBar";

const GameResultsScreen = ({ results, onPlayAgain, onBackToSelection }) => {
  const { childProgress } = useAuth();
  const totalXP = childProgress?.totalXP ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-blue-50">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="items-center mb-6">
          <View className="bg-violet-500 rounded-full p-4 mb-4">
            <MaterialIcons name="emoji-events" size={48} color="#ffffff" />
          </View>
          <Text className="text-3xl font-bold text-gray-800 text-center">
            Game Complete!
          </Text>
          <Text className="text-gray-600 mt-2 text-center">
            Great job practicing your signs!
          </Text>
        </View>

        {/* XP Progress Bar */}
        <View className="mb-6">
          <XPProgressBar totalXP={totalXP} size="normal" />
        </View>

        {/* Results Cards */}
        <View className="mb-6">
          {/* Total XP */}
          <View className="bg-white rounded-2xl p-4 mb-3 shadow-md">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center flex-1">
                <View className="bg-violet-100 rounded-xl p-3 mr-3">
                  <MaterialIcons name="star" size={24} color="#7c3aed" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm text-gray-600">Total XP Earned</Text>
                  <Text className="text-2xl font-bold text-gray-800">
                    +{results.totalXP} XP
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Correct Answers */}
          <View className="bg-white rounded-2xl p-4 mb-3 shadow-md">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center flex-1">
                <View className="bg-green-100 rounded-xl p-3 mr-3">
                  <MaterialIcons name="check-circle" size={24} color="#10b981" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm text-gray-600">Correct Answers</Text>
                  <Text className="text-2xl font-bold text-gray-800">
                    {results.correctCount} / {results.totalQuestions ?? 10}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Accuracy */}
          <View className="bg-white rounded-2xl p-4 mb-3 shadow-md">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center flex-1">
                <View className="bg-blue-100 rounded-xl p-3 mr-3">
                  <MaterialIcons name="target" size={24} color="#3b82f6" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm text-gray-600">Accuracy</Text>
                  <Text className="text-2xl font-bold text-gray-800">
                    {results.accuracy}%
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Longest Streak */}
          <View className="bg-white rounded-2xl p-4 mb-3 shadow-md">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center flex-1">
                <View className="bg-orange-100 rounded-xl p-3 mr-3">
                  <MaterialIcons name="local-fire-department" size={24} color="#f97316" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm text-gray-600">Longest Streak</Text>
                  <Text className="text-2xl font-bold text-gray-800">
                    {results.longestStreak} in a row
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View className="mb-6">
          <TouchableOpacity
            onPress={onPlayAgain}
            className="bg-violet-500 rounded-xl px-6 py-4 mb-3 shadow-lg"
            activeOpacity={0.8}
          >
            <View className="flex-row items-center justify-center">
              <MaterialIcons name="refresh" size={24} color="#ffffff" style={{ marginRight: 8 }} />
              <Text className="text-lg font-bold text-white">Play Again</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onBackToSelection}
            className="bg-gray-200 rounded-xl px-6 py-4 shadow-md"
            activeOpacity={0.8}
          >
            <View className="flex-row items-center justify-center">
              <MaterialIcons name="arrow-back" size={24} color="#374151" style={{ marginRight: 8 }} />
              <Text className="text-lg font-bold text-gray-800">Back to Game Selection</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default GameResultsScreen;

