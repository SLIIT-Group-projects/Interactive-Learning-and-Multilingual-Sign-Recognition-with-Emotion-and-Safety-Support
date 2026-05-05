import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import { getChildGameSessions } from '../services/firestore/gameService';

const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_THRESHOLD = 3;

const toDate = (value) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const averageAccuracy = (sessions) => {
  if (!sessions.length) return 0;
  const total = sessions.reduce((sum, session) => sum + (Number(session.accuracy) || 0), 0);
  return total / sessions.length;
};

export const calculateLearningTrend = (sessions) => {
  if (!sessions || sessions.length === 0) {
    return {
      hasEnoughData: false,
      currentWeekAccuracy: 0,
      previousWeekAccuracy: 0,
      difference: 0,
      trendStatus: 'Stable',
    };
  }

  const now = Date.now();
  const sevenDaysAgo = now - (7 * DAY_MS);
  const fourteenDaysAgo = now - (14 * DAY_MS);

  const normalized = sessions
    .map((session) => {
      const date = toDate(session.createdAt);
      return {
        date,
        accuracy: Number(session.accuracy) || 0,
      };
    })
    .filter((session) => session.date);

  const currentWeekSessions = normalized.filter(
    (session) => session.date.getTime() >= sevenDaysAgo && session.date.getTime() <= now
  );

  const previousWeekSessions = normalized.filter(
    (session) => session.date.getTime() >= fourteenDaysAgo && session.date.getTime() < sevenDaysAgo
  );

  const currentWeekAccuracy = averageAccuracy(currentWeekSessions);
  const previousWeekAccuracy = averageAccuracy(previousWeekSessions);
  const difference = currentWeekAccuracy - previousWeekAccuracy;

  let trendStatus = 'Stable';
  if (difference > TREND_THRESHOLD) {
    trendStatus = 'Improving';
  } else if (difference < -TREND_THRESHOLD) {
    trendStatus = 'Declining';
  }

  const hasEnoughData = currentWeekSessions.length > 0 && previousWeekSessions.length > 0;

  return {
    hasEnoughData,
    currentWeekAccuracy,
    previousWeekAccuracy,
    difference,
    trendStatus,
  };
};

const getTrendStyle = (status) => {
  if (status === 'Improving') {
    return {
      icon: 'trending-up',
      iconColor: '#16a34a',
      badgeBg: '#dcfce7',
      badgeText: '#15803d',
      chartColor: '#16a34a',
    };
  }

  if (status === 'Declining') {
    return {
      icon: 'trending-down',
      iconColor: '#dc2626',
      badgeBg: '#fee2e2',
      badgeText: '#b91c1c',
      chartColor: '#dc2626',
    };
  }

  return {
    icon: 'trending-flat',
    iconColor: '#6b7280',
    badgeBg: '#f1f5f9',
    badgeText: '#475569',
    chartColor: '#6366f1',
  };
};

const getInsightMessage = (trendStatus, hasEnoughData) => {
  if (!hasEnoughData) {
    return 'Not enough session data to analyze learning trends.';
  }

  if (trendStatus === 'Improving') {
    return 'Child performance is improving steadily compared to last week.';
  }

  if (trendStatus === 'Declining') {
    return 'Recent performance has dropped. Additional practice may help reinforce learning.';
  }

  return 'Performance remains stable. Continued practice can help achieve further improvement.';
};

const formatDateLabel = (date) =>
  date.toLocaleDateString([], { month: 'short', day: 'numeric' });

const LearningTrendAnalysisCard = ({ childId }) => {
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    const loadSessions = async () => {
      if (!childId) {
        setSessions([]);
        return;
      }

      setLoading(true);
      try {
        const data = await getChildGameSessions(childId, 1000);
        setSessions(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error loading learning trend sessions:', error);
        setSessions([]);
      } finally {
        setLoading(false);
      }
    };

    loadSessions();
  }, [childId]);

  const trendData = useMemo(() => calculateLearningTrend(sessions), [sessions]);
  const trendStyle = getTrendStyle(trendData.trendStatus);
  const insightMessage = getInsightMessage(trendData.trendStatus, trendData.hasEnoughData);

  const sortedSessions = useMemo(
    () =>
      sessions
        .map((session) => ({ ...session, createdAtDate: toDate(session.createdAt) }))
        .filter((session) => session.createdAtDate)
        .sort((a, b) => a.createdAtDate - b.createdAtDate)
        .slice(-12),
    [sessions]
  );

  const lineData = sortedSessions.map((session, index) => ({
    value: Math.max(0, Math.min(100, Number(session.accuracy) || 0)),
    label: index % 2 === 0 ? formatDateLabel(session.createdAtDate) : '',
  }));

  const differencePrefix = trendData.difference > 0 ? '+' : '';

  if (loading) {
    return (
      <View className="bg-white rounded-[32px] p-6 mb-8 shadow-xl shadow-indigo-200 items-center">
        <ActivityIndicator size="small" color="#6366f1" />
        <Text className="text-slate-500 text-sm mt-2">Loading learning trend...</Text>
      </View>
    );
  }

  return (
    <View className="bg-white rounded-[32px] p-6 mb-8 shadow-xl shadow-indigo-200">
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-slate-800 text-xl font-bold">Learning Trend Analysis</Text>
          <Text className="text-slate-400 text-sm">Accuracy Progress Over Time</Text>
        </View>
        <View
          className="px-3 py-1.5 rounded-full flex-row items-center"
          style={{ backgroundColor: trendStyle.badgeBg }}
        >
          <MaterialIcons name={trendStyle.icon} size={16} color={trendStyle.iconColor} />
          <Text className="font-bold ml-1" style={{ color: trendStyle.badgeText }}>
            {trendData.trendStatus}
          </Text>
        </View>
      </View>

      <View className="bg-slate-50 rounded-2xl p-4 mb-4">
        <View className="flex-row justify-between py-1">
          <Text className="text-slate-500 text-sm">Current Week Accuracy</Text>
          <Text className="text-slate-800 font-bold text-sm">
            {Math.round(trendData.currentWeekAccuracy)}%
          </Text>
        </View>
        <View className="flex-row justify-between py-1">
          <Text className="text-slate-500 text-sm">Previous Week Accuracy</Text>
          <Text className="text-slate-800 font-bold text-sm">
            {Math.round(trendData.previousWeekAccuracy)}%
          </Text>
        </View>
        <View className="flex-row justify-between py-1">
          <Text className="text-slate-500 text-sm">Performance Change</Text>
          <Text className="font-bold text-sm" style={{ color: trendStyle.iconColor }}>
            {differencePrefix}
            {Math.round(trendData.difference)}%
          </Text>
        </View>
      </View>

      <Text className="text-slate-700 font-semibold mb-2">Accuracy Progress Over Time</Text>
      {lineData.length > 0 ? (
        <View className="mb-4">
          <LineChart
            data={lineData}
            height={180}
            spacing={26}
            thickness={2}
            color={trendStyle.chartColor}
            curved
            noOfSections={4}
            maxValue={100}
            yAxisLabelSuffix="%"
            yAxisTextStyle={{ color: '#6b7280', fontSize: 10 }}
            xAxisLabelTextStyle={{ color: '#6b7280', fontSize: 9 }}
            yAxisColor="#e2e8f0"
            xAxisColor="#e2e8f0"
            rulesColor="#e2e8f0"
            dataPointsColor={trendStyle.chartColor}
            dataPointsRadius={3}
            startFillColor="rgba(99, 102, 241, 0.16)"
            endFillColor="rgba(99, 102, 241, 0.04)"
            areaChart
            isAnimated={false}
          />
        </View>
      ) : (
        <View className="bg-slate-50 rounded-2xl p-4 mb-4 items-center">
          <Text className="text-slate-500 text-sm">No session history available yet.</Text>
        </View>
      )}

      <View className="bg-indigo-50 rounded-2xl p-4">
        <Text className="text-indigo-900 text-sm">{insightMessage}</Text>
      </View>
    </View>
  );
};

export default LearningTrendAnalysisCard;
