import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-chart-kit';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { getParentChildren } from '../../services/firestore/userService';
import { getChildAnalytics, getParentGameSessions } from '../../services/firestore/gameService';

const LearningProgressScreen = ({ navigation }) => {
  const { userData } = useAuth();
  const [selectedChild, setSelectedChild] = useState(null);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  useEffect(() => {
    const loadChildren = async () => {
      if (userData && userData.role === 'parent') {
        try {
          const childrenList = await getParentChildren(userData.uid);
          setChildren(childrenList);
          if (childrenList.length > 0) {
            setSelectedChild(childrenList[0]);
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
      const recentSessions = await getParentGameSessions(userData.uid, 20);
      const childSessions = recentSessions.filter((s) => s.childId === childId);
      setSessions(childSessions);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const lettersLearned = analytics?.letterPerformance?.filter((lp) => lp.accuracy >= 70).length || 0;
  const totalLetters = 26;
  const progressPercentage = totalLetters > 0 ? (lettersLearned / totalLetters) * 100 : 0;

  const prepareWeeklyData = () => {
    if (!sessions || sessions.length === 0) {
      return {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        datasets: [
          {
            data: [0, 0, 0, 0],
            color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
            strokeWidth: 2,
          },
        ],
      };
    }
    const now = new Date();
    const weeks = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - i * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const weekSessions = sessions.filter((s) => {
        const sessionDate = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.createdAt);
        return sessionDate >= weekStart && sessionDate < weekEnd;
      });
      const lettersThisWeek = weekSessions.reduce((sum, s) => sum + (s.totalQuestions || 0), 0);
      weeks.push(lettersThisWeek);
    }
    return {
      labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
      datasets: [
        {
          data: weeks,
          color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
          strokeWidth: 2,
        },
      ],
    };
  };

  const weeklyData = prepareWeeklyData();
  const chartConfig = {
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
    style: { borderRadius: 16 },
    propsForDots: { r: '6', strokeWidth: '2', stroke: '#3b82f6' },
  };
  const screenWidth = Dimensions.get('window').width;

  return (
    <SafeAreaView className="flex-1 bg-blue-50" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-200">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="mr-3 p-2 -ml-2"
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-800 flex-1">Learning Progress</Text>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="flex-1 px-6 pt-4 pb-8">
          {/* Child selector */}
          <View className="bg-white rounded-2xl p-4 mb-6 shadow-md">
            <Text className="text-sm text-gray-600 mb-3">View progress for</Text>
            {loading ? (
              <Text className="text-gray-500">Loading...</Text>
            ) : children.length === 0 ? (
              <Text className="text-gray-500">No children added yet. Add a child from the dashboard.</Text>
            ) : (
              <>
                <Text className="text-xl font-semibold text-gray-800 mb-2">
                  {selectedChild?.name || children[0]?.name}
                </Text>
                {children.length > 1 && (
                  <View className="flex-row flex-wrap mt-2">
                    {children.map((child) => (
                      <TouchableOpacity
                        key={child.id || child.uid}
                        onPress={() => setSelectedChild(child)}
                        className={`px-3 py-1.5 rounded-full mr-2 mb-2 ${
                          selectedChild?.uid === child.uid ? 'bg-blue-500' : 'bg-gray-200'
                        }`}
                      >
                        <Text
                          className={`text-sm font-semibold ${
                            selectedChild?.uid === child.uid ? 'text-white' : 'text-gray-600'
                          }`}
                        >
                          {child.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>

          {analyticsLoading ? (
            <View className="bg-white rounded-2xl p-8 mb-6 shadow-md items-center">
              <ActivityIndicator size="large" color="#8b5cf6" />
              <Text className="text-gray-600 mt-4">Loading analytics...</Text>
            </View>
          ) : analytics ? (
            <>
              {/* Progress cards */}
              <View className="flex-row justify-between mb-4">
                <View className="bg-white rounded-2xl p-4 flex-1 mr-2 shadow-md">
                  <Text className="text-sm text-gray-600 mb-2">Letters Learned</Text>
                  <Text className="text-2xl font-bold text-gray-800 mb-2">
                    {lettersLearned} / {totalLetters}
                  </Text>
                  <View className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <View
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </View>
                </View>
                <View className="bg-white rounded-2xl p-4 flex-1 mx-1 shadow-md">
                  <Text className="text-sm text-gray-600 mb-2">Avg Accuracy</Text>
                  <View className="flex-row items-center">
                    <Text className="text-2xl font-bold text-gray-800">
                      {analytics.averageAccuracy.toFixed(0)}%
                    </Text>
                    <MaterialIcons name="star" size={20} color="#fbbf24" style={{ marginLeft: 4 }} />
                  </View>
                </View>
                <View className="bg-white rounded-2xl p-4 flex-1 ml-2 shadow-md">
                  <View className="flex-row items-center mb-2">
                    <Text className="text-sm text-gray-600">Weak Letters</Text>
                    <MaterialIcons name="warning" size={16} color="#f97316" style={{ marginLeft: 4 }} />
                  </View>
                  <Text className="text-lg font-bold text-orange-600">
                    {analytics.mostWeakLetters.length > 0
                      ? analytics.mostWeakLetters.map((w) => w.letter).join(', ')
                      : 'None'}
                  </Text>
                </View>
              </View>

              {/* Weekly chart */}
              <View className="bg-white rounded-2xl p-5 mb-6 shadow-md">
                <Text className="text-xl font-bold text-gray-800 mb-4">Weekly Learning Progress</Text>
                <LineChart
                  data={weeklyData}
                  width={screenWidth - 80}
                  height={220}
                  chartConfig={chartConfig}
                  bezier
                  style={{ marginVertical: 8, borderRadius: 16 }}
                  withInnerLines
                  withOuterLines
                  withVerticalLabels
                  withHorizontalLabels
                />
              </View>

              {/* Strong letters */}
              {analytics.mostStrongLetters.length > 0 && (
                <View className="bg-white rounded-2xl p-5 mb-6 shadow-md">
                  <View className="flex-row items-center mb-4">
                    <Text className="text-xl font-bold text-gray-800">Strong Letters</Text>
                    <MaterialIcons name="star" size={24} color="#fbbf24" style={{ marginLeft: 8 }} />
                  </View>
                  <View className="flex-row flex-wrap">
                    {analytics.mostStrongLetters.map((letter, index) => (
                      <View key={index} className="bg-green-100 rounded-xl p-3 mr-2 mb-2">
                        <Text className="text-lg font-bold text-green-700">
                          {letter.letter}: {letter.accuracy.toFixed(0)}%
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Motivation */}
              <View className="bg-pink-100 rounded-2xl p-5 shadow-md" style={styles.motivationCard}>
                <Text className="text-lg font-semibold text-gray-800 text-center leading-6">
                  {selectedChild?.name || 'Your child'}{' '}
                  {analytics.totalSessions > 0
                    ? 'is progressing well! Keep encouraging them!'
                    : "hasn't started playing yet. Encourage them to start learning!"}
                </Text>
                <View className="mt-3 flex-row justify-center items-center">
                  <MaterialIcons name="star" size={32} color="#fbbf24" />
                  <MaterialIcons name="celebration" size={32} color="#f59e0b" style={{ marginHorizontal: 8 }} />
                  <MaterialIcons name="auto-awesome" size={32} color="#fbbf24" />
                </View>
              </View>
            </>
          ) : !loading && children.length > 0 ? (
            <View className="bg-white rounded-2xl p-8 mb-6 shadow-md items-center">
              <Text className="text-gray-500 text-center">No learning data yet. Have your child play the game!</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  motivationCard: {
    backgroundColor: '#fce7f3',
  },
});

export default LearningProgressScreen;
