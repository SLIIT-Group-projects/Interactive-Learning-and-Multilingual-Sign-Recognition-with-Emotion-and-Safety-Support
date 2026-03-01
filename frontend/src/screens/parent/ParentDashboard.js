import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-chart-kit';
import { MaterialIcons, FontAwesome, Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { logoutUser } from '../../services/auth/authService';
import { getParentChildren } from '../../services/firestore/userService';
import { getChildAnalytics, getParentGameSessions } from '../../services/firestore/gameService';

const ParentDashboard = ({ navigation }) => {
  const { userData } = useAuth();
  const [selectedChild, setSelectedChild] = useState(null);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  
  // Load children on mount
  useEffect(() => {
    const loadChildren = async () => {
      if (userData && userData.role === 'parent') {
        try {
          const childrenList = await getParentChildren(userData.uid);
          setChildren(childrenList);
          if (childrenList.length > 0) {
            setSelectedChild(childrenList[0]);
            // Load analytics for first child
            loadChildAnalytics(childrenList[0].uid);
          }
        } catch (error) {
          console.error('Error loading children:', error);
        } finally {
          setLoading(false);
        }
      }
    };
    loadChildren();
  }, [userData]);

  // Load analytics when selected child changes
  useEffect(() => {
    if (selectedChild && selectedChild.uid) {
      loadChildAnalytics(selectedChild.uid);
    }
  }, [selectedChild]);

  const loadChildAnalytics = async (childId) => {
    if (!childId || !userData) return;
    
    setAnalyticsLoading(true);
    try {
      const childAnalytics = await getChildAnalytics(childId, userData.uid);
      setAnalytics(childAnalytics);
      
      // Load recent sessions for chart
      const recentSessions = await getParentGameSessions(userData.uid, 20);
      const childSessions = recentSessions.filter(s => s.childId === childId);
      setSessions(childSessions);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setAnalyticsLoading(false);
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

  // Calculate progress from analytics
  const lettersLearned = analytics?.letterPerformance?.filter(lp => lp.accuracy >= 70).length || 0;
  const totalLetters = 26;
  const progressPercentage = totalLetters > 0 ? (lettersLearned / totalLetters) * 100 : 0;
  
  // Prepare weekly data from sessions
  const prepareWeeklyData = () => {
    if (!sessions || sessions.length === 0) {
      return {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        datasets: [{ data: [0, 0, 0, 0], color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`, strokeWidth: 2 }],
      };
    }
    
    // Group sessions by week
    const now = new Date();
    const weeks = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - (i * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      
      const weekSessions = sessions.filter(s => {
        const sessionDate = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.createdAt);
        return sessionDate >= weekStart && sessionDate < weekEnd;
      });
      
      const lettersThisWeek = weekSessions.reduce((sum, s) => sum + (s.totalQuestions || 0), 0);
      weeks.push(lettersThisWeek);
    }
    
    return {
      labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
      datasets: [{
        data: weeks,
        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
        strokeWidth: 2,
      }],
    };
  };
  
  const weeklyData = prepareWeeklyData();
  
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
              onPress={handleLogout}
              className="bg-white rounded-full p-3 shadow-md"
            >
              <MaterialIcons name="logout" size={24} color="#374151" />
            </TouchableOpacity>
          </View>
          
          {/* Child Selection */}
          <View className="bg-white rounded-2xl p-4 mb-6 shadow-md">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-sm text-gray-600">Child</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('AddChild')}
                className="bg-green-500 rounded-full px-4 py-2 flex-row items-center"
              >
                <MaterialIcons name="add" size={20} color="#ffffff" style={{ marginRight: 4 }} />
                <Text className="text-white font-semibold">Add Child</Text>
              </TouchableOpacity>
            </View>
            {loading ? (
              <Text className="text-gray-500">Loading children...</Text>
            ) : children.length === 0 ? (
              <View className="items-center py-4">
                <Text className="text-gray-500">No children added yet</Text>
              </View>
            ) : (
              <View>
                <Text className="text-xl font-semibold text-gray-800">
                  {selectedChild?.name || children[0]?.name || 'Select a child'}
                </Text>
                {children.length > 1 && (
                  <View className="flex-row flex-wrap mt-3">
                    {children.map((child) => (
                      <TouchableOpacity
                        key={child.id || child.uid}
                        onPress={() => setSelectedChild(child)}
                        className={`px-3 py-1 rounded-full mr-2 mb-2 ${
                          selectedChild?.uid === child.uid
                            ? 'bg-blue-500'
                            : 'bg-gray-200'
                        }`}
                      >
                        <Text
                          className={`text-sm font-semibold ${
                            selectedChild?.uid === child.uid
                              ? 'text-white'
                              : 'text-gray-600'
                          }`}
                        >
                          {child.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
          
          {/* Progress Overview Cards */}
          {analyticsLoading ? (
            <View className="bg-white rounded-2xl p-8 mb-6 shadow-md items-center">
              <ActivityIndicator size="large" color="#8b5cf6" />
              <Text className="text-gray-600 mt-4">Loading analytics...</Text>
            </View>
          ) : analytics ? (
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
              
              {/* Average Accuracy Card */}
              <View className="bg-white rounded-2xl p-4 flex-1 mx-1 shadow-md">
                <Text className="text-sm text-gray-600 mb-2">Avg Accuracy</Text>
              <View className="flex-row items-center">
                <Text className="text-2xl font-bold text-gray-800">
                  {analytics.averageAccuracy.toFixed(0)}%
                </Text>
                <MaterialIcons name="star" size={20} color="#fbbf24" style={{ marginLeft: 4 }} />
              </View>
              </View>
              
              {/* Weak Letters Card */}
              <View className="bg-white rounded-2xl p-4 flex-1 ml-2 shadow-md">
              <View className="flex-row items-center mb-2">
                <Text className="text-sm text-gray-600">Weak Letters</Text>
                <MaterialIcons name="warning" size={16} color="#f97316" style={{ marginLeft: 4 }} />
              </View>
                <Text className="text-lg font-bold text-orange-600">
                  {analytics.mostWeakLetters.length > 0 
                    ? analytics.mostWeakLetters.map(w => w.letter).join(', ')
                    : 'None'}
                </Text>
              </View>
            </View>
          ) : (
            <View className="bg-white rounded-2xl p-4 mb-6 shadow-md">
              <Text className="text-gray-500 text-center">No data available yet</Text>
            </View>
          )}
          
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
          
          {/* Strong Letters Section */}
          {analytics && analytics.mostStrongLetters.length > 0 && (
            <View className="bg-white rounded-2xl p-5 mb-6 shadow-md">
            <View className="flex-row items-center mb-4">
              <Text className="text-xl font-bold text-gray-800">Strong Letters</Text>
              <MaterialIcons name="star" size={24} color="#fbbf24" style={{ marginLeft: 8 }} />
            </View>
              <View className="flex-row flex-wrap">
                {analytics.mostStrongLetters.map((letter, index) => (
                  <View
                    key={index}
                    className="bg-green-100 rounded-xl p-3 mr-2 mb-2"
                  >
                    <Text className="text-lg font-bold text-green-700">
                      {letter.letter}: {letter.accuracy.toFixed(0)}%
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          
          {/* Motivational / Informational Message */}
          <View className="bg-pink-100 rounded-2xl p-5 shadow-md" style={styles.motivationCard}>
            <Text className="text-lg font-semibold text-gray-800 text-center leading-6">
              {selectedChild?.name || 'Your child'} {analytics && analytics.totalSessions > 0 
                ? 'is progressing well! Keep encouraging them!'
                : 'hasn\'t started playing yet. Encourage them to start learning!'}
            </Text>
            <View className="mt-3 flex-row justify-center items-center">
              <MaterialIcons name="star" size={32} color="#fbbf24" />
              <MaterialIcons name="celebration" size={32} color="#f59e0b" style={{ marginHorizontal: 8 }} />
              <MaterialIcons name="auto-awesome" size={32} color="#fbbf24" />
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

