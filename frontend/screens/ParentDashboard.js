import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-chart-kit';

const ParentDashboard = ({ navigation }) => {
  // Mock data stored in local state
  const [selectedChild, setSelectedChild] = useState('Alex');
  const [children] = useState(['Alex', 'Emma', 'Noah']);
  
  // Progress Overview Data
  const [lettersLearned] = useState(12);
  const [totalLetters] = useState(26);
  const [gameScore] = useState(45);
  const [weakLetters] = useState(['M', 'N', 'S']);
  
  // Weekly Learning Data (mock data for chart)
  const weeklyData = {
    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    datasets: [
      {
        data: [2, 5, 8, 12], // Letters learned per week
        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`, // blue-500
        strokeWidth: 2,
      },
    ],
  };
  
  // Achievements/Badges Data
  const achievements = [
    { id: 1, icon: '🎖', title: 'Beginner', earned: true },
    { id: 2, icon: '🌟', title: 'Fast Learner', earned: true },
    { id: 3, icon: '🏆', title: 'Perfect Week', earned: false },
    { id: 4, icon: '💪', title: 'Persistent', earned: false },
    { id: 5, icon: '⭐', title: 'Star Collector', earned: true },
  ];
  
  // Calculate progress percentage
  const progressPercentage = (lettersLearned / totalLetters) * 100;
  
  // Chart configuration
  const chartConfig = {
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
    style: {
      borderRadius: 16,
    },
    propsForDots: {
      r: '6',
      strokeWidth: '2',
      stroke: '#3b82f6',
    },
  };
  
  const screenWidth = Dimensions.get('window').width;
  
  return (
    <SafeAreaView className="flex-1 bg-blue-50">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="flex-1 px-6 pt-4 pb-8">
          {/* Header Section */}
          <View className="flex-row items-center justify-between mb-6">
            <Text className="text-3xl font-bold text-gray-800">
              Parent Dashboard
            </Text>
            <TouchableOpacity
              onPress={() => navigation?.goBack()}
              className="bg-white rounded-full p-3 shadow-md"
            >
              <Text className="text-xl">←</Text>
            </TouchableOpacity>
          </View>
          
          {/* Child Selection */}
          <View className="bg-white rounded-2xl p-4 mb-6 shadow-md">
            <Text className="text-sm text-gray-600 mb-2">Child</Text>
            <View className="flex-row items-center">
              <Text className="text-xl font-semibold text-gray-800">
                {selectedChild}
              </Text>
              <View className="ml-4 flex-row">
                {children.map((child) => (
                  <TouchableOpacity
                    key={child}
                    onPress={() => setSelectedChild(child)}
                    className={`px-4 py-2 rounded-full mr-2 ${
                      selectedChild === child
                        ? 'bg-blue-500'
                        : 'bg-gray-200'
                    }`}
                  >
                    <Text
                      className={`font-semibold ${
                        selectedChild === child
                          ? 'text-white'
                          : 'text-gray-600'
                      }`}
                    >
                      {child}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
          
          {/* Progress Overview Cards */}
          <View className="flex-row justify-between mb-6">
            {/* Letters Learned Card */}
            <View className="bg-white rounded-2xl p-4 flex-1 mr-2 shadow-md">
              <Text className="text-sm text-gray-600 mb-2">Letters Learned</Text>
              <Text className="text-2xl font-bold text-gray-800 mb-2">
                {lettersLearned} / {totalLetters}
              </Text>
              {/* Mini Progress Bar */}
              <View className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <View
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${progressPercentage}%` }}
                />
              </View>
            </View>
            
            {/* Game Score Card */}
            <View className="bg-white rounded-2xl p-4 flex-1 mx-1 shadow-md">
              <Text className="text-sm text-gray-600 mb-2">Game Score</Text>
              <View className="flex-row items-center">
                <Text className="text-2xl font-bold text-gray-800">
                  {gameScore}
                </Text>
                <Text className="text-xl ml-1">⭐</Text>
              </View>
            </View>
            
            {/* Weak Letters Card */}
            <View className="bg-white rounded-2xl p-4 flex-1 ml-2 shadow-md">
              <View className="flex-row items-center mb-2">
                <Text className="text-sm text-gray-600">Weak Letters</Text>
                <Text className="text-sm ml-1">⚠️</Text>
              </View>
              <Text className="text-lg font-bold text-orange-600">
                {weakLetters.join(', ')}
              </Text>
            </View>
          </View>
          
          {/* Weekly Learning Chart */}
          <View className="bg-white rounded-2xl p-5 mb-6 shadow-md">
            <Text className="text-xl font-bold text-gray-800 mb-4">
              Weekly Learning Progress
            </Text>
            <LineChart
              data={weeklyData}
              width={screenWidth - 80}
              height={220}
              chartConfig={chartConfig}
              bezier
              style={{
                marginVertical: 8,
                borderRadius: 16,
              }}
              withInnerLines={true}
              withOuterLines={true}
              withVerticalLabels={true}
              withHorizontalLabels={true}
            />
          </View>
          
          {/* Achievements / Badges Section */}
          <View className="mb-6">
            <Text className="text-xl font-bold text-gray-800 mb-4">
              Achievements & Badges
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="flex-row"
            >
              {achievements.map((achievement) => (
                <View
                  key={achievement.id}
                  className={`rounded-2xl p-5 mr-4 shadow-md ${
                    achievement.earned
                      ? 'bg-yellow-100'
                      : 'bg-gray-100'
                  }`}
                  style={[
                    styles.achievementCard,
                    achievement.earned
                      ? styles.earnedAchievement
                      : styles.lockedAchievement,
                  ]}
                >
                  <Text
                    className="text-5xl mb-2 text-center"
                    style={!achievement.earned && { opacity: 0.3 }}
                  >
                    {achievement.icon}
                  </Text>
                  <Text
                    className={`text-base font-semibold text-center ${
                      achievement.earned
                        ? 'text-yellow-700'
                        : 'text-gray-400'
                    }`}
                  >
                    {achievement.title}
                  </Text>
                  {!achievement.earned && (
                    <Text className="text-xs text-gray-400 text-center mt-1">
                      Locked
                    </Text>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
          
          {/* Motivational / Informational Message */}
          <View className="bg-pink-100 rounded-2xl p-5 shadow-md" style={styles.motivationCard}>
            <Text className="text-lg font-semibold text-gray-800 text-center leading-6">
              {selectedChild} is progressing well! Keep encouraging them 💪
            </Text>
            <View className="mt-3 flex-row justify-center">
              <Text className="text-3xl">🌟</Text>
              <Text className="text-3xl mx-2">🎉</Text>
              <Text className="text-3xl">✨</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  achievementCard: {
    width: 120,
    minHeight: 140,
  },
  earnedAchievement: {
    borderWidth: 2,
    borderColor: '#fcd34d', // yellow-300
  },
  lockedAchievement: {
    opacity: 0.6,
    borderWidth: 2,
    borderColor: '#e5e7eb', // gray-200
  },
  motivationCard: {
    backgroundColor: '#fce7f3', // pink-100 with slight gradient effect
  },
});

export default ParentDashboard;

