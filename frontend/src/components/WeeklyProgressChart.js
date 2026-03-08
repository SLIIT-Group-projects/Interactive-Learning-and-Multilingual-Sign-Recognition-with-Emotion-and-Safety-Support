import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import { getChildGameSessions } from '../services/firestore/gameService';

const screenWidth = Dimensions.get('window').width;

const WeeklyProgressChart = ({ childId, visible, onClose }) => {
  const [weeklyData, setWeeklyData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && childId) {
      loadWeeklyData();
    }
  }, [visible, childId]);

  const loadWeeklyData = async () => {
    if (!childId) return;

    setLoading(true);
    try {
      // Get sessions from last 4 weeks
      const fourWeeksAgo = new Date();
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

      // Get all game sessions for this child
      const sessions = await getChildGameSessions(childId, 1000);

      // Filter sessions from last 4 weeks
      const recentSessions = sessions.filter((session) => {
        const sessionDate = session.createdAt?.toDate
          ? session.createdAt.toDate()
          : new Date(session.createdAt);
        return sessionDate >= fourWeeksAgo;
      });

      // Group sessions by week
      const weeks = [];
      const now = new Date();

      // Create 4 week buckets (oldest to newest: Week 1 to Week 4)
      for (let i = 3; i >= 0; i--) {
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() - i * 7);
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() - 7);

        // Filter sessions for this week
        const weekSessions = recentSessions.filter((session) => {
          const sessionDate = session.createdAt?.toDate
            ? session.createdAt.toDate()
            : new Date(session.createdAt);
          return sessionDate >= weekStart && sessionDate < weekEnd;
        });

        // Calculate weekly average accuracy
        let weeklyAccuracy = 0;
        if (weekSessions.length > 0) {
          const totalAccuracy = weekSessions.reduce(
            (sum, s) => sum + (s.accuracy || 0),
            0
          );
          weeklyAccuracy = totalAccuracy / weekSessions.length;
        }

        // Format week label (Week 1 = oldest, Week 4 = newest)
        const weekNumber = 4 - i;
        const weekLabel = `Week ${weekNumber}`;
        weeks.push({
          week: weekLabel,
          accuracy: Math.round(weeklyAccuracy),
          sessionCount: weekSessions.length,
        });
      }

      setWeeklyData(weeks);
    } catch (error) {
      console.error('Error loading weekly data:', error);
      setWeeklyData([]);
    } finally {
      setLoading(false);
    }
  };

  // Prepare data for LineChart from react-native-gifted-charts
  // Format: Array<lineDataItem> where each item has { value: number, label: string }
  // Ensure all values are at least 0 to prevent curve from going below 0%
  const lineData = weeklyData.map((w) => ({
    value: Math.max(0, w.accuracy), // Clamp to 0 minimum
    label: w.week,
  }));

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-white rounded-t-3xl" style={{ maxHeight: '90%' }}>
          {/* Header */}
          <View className="flex-row items-center justify-between p-4 border-b border-gray-200">
            <Text className="text-xl font-bold text-gray-800">
              Weekly Progress Chart
            </Text>
            <TouchableOpacity
              onPress={onClose}
              className="p-2 rounded-full bg-gray-100"
            >
              <MaterialIcons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View className="p-4">
            {loading ? (
              <View className="items-center py-12">
                <ActivityIndicator size="large" color="#8b5cf6" />
                <Text className="text-gray-600 mt-4">Loading chart data...</Text>
              </View>
            ) : weeklyData.length === 0 ? (
              <View className="items-center py-12">
                <MaterialIcons name="bar-chart" size={48} color="#d1d5db" />
                <Text className="text-gray-500 mt-4 text-center">
                  No data available for the last 4 weeks
                </Text>
              </View>
            ) : (
              <>
                {/* Chart */}
                <View className="items-center mb-4">
                  <LineChart
                    data={lineData}
                    width={screenWidth - 64}
                    height={220}
                    spacing={60}
                    thickness={2}
                    color="#7c3aed"
                    hideRules={false}
                    rulesColor="#e5e7eb"
                    rulesType="solid"
                    yAxisColor="#e5e7eb"
                    xAxisColor="#e5e7eb"
                    yAxisTextStyle={{ color: '#6b7280', fontSize: 10 }}
                    xAxisLabelTextStyle={{ color: '#6b7280', fontSize: 10 }}
                    curved={true}
                    curvature={0.05}
                    areaChart={true}
                    startFillColor="rgba(124, 58, 237, 0.2)"
                    endFillColor="rgba(124, 58, 237, 0.05)"
                    startOpacity={0.2}
                    endOpacity={0.05}
                    onlyPositive={true}
                    interpolateMissingValues={true}
                    extrapolateMissingValues={false}
                    dataPointsColor="#7c3aed"
                    dataPointsRadius={6}
                    textShiftY={-2}
                    textShiftX={-5}
                    textFontSize={11}
                    textColor="#374151"
                    maxValue={100}
                    yAxisLabelSuffix="%"
                    noOfSections={4}
                    stepValue={25}
                    backgroundColor="#ffffff"
                    isAnimated={false}
                    onlyPositive={true}
                    yAxisOffset={0}
                    hideOrigin={false}
                  />
                </View>

                {/* Week Details */}
                <View className="mt-4">
                  {weeklyData.map((week, index) => (
                    <View
                      key={index}
                      className="flex-row items-center justify-between py-2 border-b border-gray-100"
                    >
                      <View className="flex-row items-center flex-1">
                        <View
                          className="w-3 h-3 rounded-full mr-3"
                          style={{ backgroundColor: '#7c3aed' }}
                        />
                        <Text className="text-sm font-medium text-gray-700">
                          {week.week}
                        </Text>
                      </View>
                      <View className="flex-row items-center">
                        <Text className="text-sm font-bold text-gray-800 mr-2">
                          {week.accuracy}%
                        </Text>
                        <Text className="text-xs text-gray-500">
                          ({week.sessionCount} session{week.sessionCount !== 1 ? 's' : ''})
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default WeeklyProgressChart;

