import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { logoutUser } from '../../services/auth/authService';
import { getChildAnalytics } from '../../services/firestore/gameService';

const ChildDashboard = ({ navigation }) => {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  
  const totalLetters = 26;
  const childName = userData?.name || 'Student';

  // Calculate letters learned (letters with accuracy >= 70%)
  const lettersLearned = analytics?.letterPerformance?.filter(
    lp => lp.attempts > 0 && lp.accuracy >= 70
  ).length || 0;

  // Calculate stars earned (total correct answers from all sessions)
  const starsEarned = analytics?.letterPerformance?.reduce(
    (sum, lp) => sum + (lp.correct || 0), 0
  ) || 0;

  // Calculate badges based on achievements
  const calculateBadges = () => {
    if (!analytics) return { count: 0, name: 'Beginner' };
    
    let badgeCount = 0;
    let badgeName = 'Beginner';
    
    if (analytics.totalSessions >= 1) {
      badgeCount++;
      badgeName = 'Beginner';
    }
    if (analytics.totalSessions >= 5) {
      badgeCount++;
      badgeName = 'Learner';
    }
    if (analytics.totalSessions >= 10) {
      badgeCount++;
      badgeName = 'Explorer';
    }
    if (analytics.averageAccuracy >= 80 && analytics.totalSessions >= 5) {
      badgeCount++;
      badgeName = 'Star Performer';
    }
    if (lettersLearned >= 10) {
      badgeCount++;
      badgeName = 'Letter Master';
    }
    if (lettersLearned >= 26) {
      badgeCount++;
      badgeName = 'ASL Champion';
    }
    
    return { count: badgeCount, name: badgeName };
  };

  const badges = calculateBadges();

  // Calculate progress percentage
  const progressPercentage = totalLetters > 0 ? (lettersLearned / totalLetters) * 100 : 0;

  // Animation for progress bar
  const progressAnim = React.useRef(new Animated.Value(0)).current;

  // Load analytics on mount
  useEffect(() => {
    const loadAnalytics = async () => {
      if (userData && userData.role === 'child' && userData.uid && userData.parentId) {
        try {
          setLoading(true);
          const childAnalytics = await getChildAnalytics(userData.uid, userData.parentId);
          setAnalytics(childAnalytics);
        } catch (error) {
          console.error('Error loading child analytics:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };
    loadAnalytics();
  }, [userData]);

  React.useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progressPercentage,
      duration: 1000,
      useNativeDriver: false,
    }).start();
  }, [progressPercentage]);

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
      navigation.navigate('GameSelect');
    } else {
      console.log('Navigate to Game Select screen');
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await logoutUser();
            } catch (error) {
              console.error('Logout error:', error);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-blue-50">
      <View className="flex-1 px-6 pt-4">
        {/* Header Section */}
        <View className="flex-row items-center justify-between mb-6">
          <View className="flex-row items-center">
            <View className="w-16 h-16 rounded-full bg-purple-200 items-center justify-center mr-4">
              <MaterialIcons name="person" size={32} color="#8b5cf6" />
            </View>
            <View>
              <Text className="text-3xl font-bold text-gray-800">
                Hello {childName}
              </Text>
            </View>
          </View>
          {/* Logout Button */}
          <TouchableOpacity
            onPress={handleLogout}
            className="bg-white rounded-full p-3 shadow-md"
            activeOpacity={0.8}
          >
            <MaterialIcons name="logout" size={24} color="#374151" />
          </TouchableOpacity>
        </View>

        {/* Progress Overview Card */}
        <View className="bg-white rounded-3xl p-6 mb-6 shadow-lg">
          <Text className="text-xl font-bold text-gray-800 mb-4">
            Your Progress
          </Text>
          {loading ? (
            <View className="items-center py-4">
              <ActivityIndicator size="large" color="#8b5cf6" />
            </View>
          ) : (
            <>
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
              
              {analytics && analytics.totalSessions > 0 && (
                <View className="mt-4 pt-4 border-t border-gray-200">
                  <View className="flex-row justify-between">
                    <View>
                      <Text className="text-sm text-gray-600">Total Sessions</Text>
                      <Text className="text-xl font-bold text-gray-800">{analytics.totalSessions}</Text>
                    </View>
                    <View>
                      <Text className="text-sm text-gray-600">Avg Accuracy</Text>
                      <Text className="text-xl font-bold text-gray-800">
                        {analytics.averageAccuracy.toFixed(0)}%
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        {/* Gamification Section */}
        <View className="flex-row justify-between mb-6">
          {/* Stars Card */}
          <View className="bg-yellow-100 rounded-2xl p-5 flex-1 mr-3 items-center shadow-md">
            <MaterialIcons name="star" size={48} color="#fbbf24" style={{ marginBottom: 8 }} />
            <Text className="text-3xl font-bold text-yellow-700 mb-1">
              {loading ? '...' : starsEarned}
            </Text>
            <Text className="text-sm text-yellow-600 font-semibold">
              Stars Earned
            </Text>
          </View>

          {/* Badges Card */}
          <View className="bg-green-100 rounded-2xl p-5 flex-1 ml-3 items-center shadow-md">
            <MaterialIcons name="military-tech" size={48} color="#f59e0b" style={{ marginBottom: 8 }} />
            <Text className="text-3xl font-bold text-green-700 mb-1">
              {loading ? '...' : badges.count}
            </Text>
            <Text className="text-sm text-green-600 font-semibold text-center">
              {badges.name} Badge
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
              <MaterialIcons name="menu-book" size={40} color="#ffffff" style={{ marginRight: 16 }} />
              <Text className="text-2xl font-bold text-white">
                Learn Signs
              </Text>
            </View>
          </TouchableOpacity>

          {/* Play Game Button */}
          <TouchableOpacity
            onPress={handlePlayGame}
            className="rounded-3xl p-6 mb-4 shadow-lg"
            activeOpacity={0.8}
            style={styles.gameButton}
          >
            <View className="flex-row items-center justify-center">
              <MaterialIcons name="sports-esports" size={40} color="#ffffff" style={{ marginRight: 16 }} />
              <Text className="text-2xl font-bold text-white">
                Play Game
              </Text>
            </View>
          </TouchableOpacity>

          {/* Hazard Detection Button */}
          <TouchableOpacity
            onPress={() => navigation.navigate('HazardDetection')}
            className="rounded-3xl p-6 shadow-lg"
            activeOpacity={0.8}
            style={styles.hazardButton}
          >
            <View className="flex-row items-center justify-center">
              <MaterialIcons name="warning" size={40} color="#ffffff" style={{ marginRight: 16 }} />
              <Text className="text-2xl font-bold text-white">
                Hazard Alert
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Motivation Message */}
        <View className="bg-pink-100 rounded-2xl p-5 items-center shadow-md">
          <Text className="text-xl font-semibold text-gray-800 text-center">
            {loading 
              ? 'Loading your progress...'
              : analytics && analytics.totalSessions > 0
              ? `Great job! You've completed ${analytics.totalSessions} session${analytics.totalSessions > 1 ? 's' : ''}! Keep going!`
              : "Ready to start learning? Let's play your first game!"}
          </Text>
          {analytics && analytics.mostStrongLetters.length > 0 && (
            <View className="mt-3">
              <Text className="text-sm text-gray-600 text-center mb-1">
                Your strong letters:
              </Text>
              <Text className="text-lg font-bold text-purple-600 text-center">
                {analytics.mostStrongLetters.slice(0, 3).map(l => l.letter).join(', ')}
              </Text>
            </View>
          )}
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
  hazardButton: {
    backgroundColor: '#ef4444', // red-500
  },
});

export default ChildDashboard;

