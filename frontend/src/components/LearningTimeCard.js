import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { getChildGameSessions } from '../services/firestore/gameService';

const LearningTimeCard = ({ childId }) => {
  const [loading, setLoading] = useState(false);
  const [timeStats, setTimeStats] = useState(null);

  useEffect(() => {
    if (childId) {
      loadTimeStats();
    }
  }, [childId]);

  const formatTime = (seconds) => {
    if (!seconds || seconds === 0 || isNaN(seconds)) {
      return '0 minutes';
    }

    // Ensure we're working with a number
    const totalSeconds = Number(seconds);
    
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;

    // If less than 1 minute, show seconds
    if (totalSeconds < 60) {
      return `${totalSeconds} second${totalSeconds !== 1 ? 's' : ''}`;
    }

    if (hours > 0) {
      // For hours, show hours and minutes
      if (minutes > 0) {
        return `${hours}h ${minutes}m`;
      }
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    
    // For minutes only, show minutes and seconds if seconds > 0
    if (remainingSeconds > 0 && minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  };

  const loadTimeStats = async () => {
    if (!childId) {
      setTimeStats(null);
      return;
    }

    setLoading(true);
    try {
      // Get all game sessions
      const sessions = await getChildGameSessions(childId, 1000);

      // Debug: Log sample timeTaken values
      console.log('⏱️ Time Stats Debug:', {
        sessionsCount: sessions.length,
        sampleTimeTaken: sessions.slice(0, 3).map(s => ({
          timeTaken: s.timeTaken,
          gameMode: s.gameMode,
        })),
      });

      // Calculate total learning time (sum of all timeTaken in seconds)
      // Ensure timeTaken is a number and handle any unit conversion issues
      const totalTime = sessions.reduce((sum, session) => {
        let time = session.timeTaken || 0;
        // Convert to number if it's a string
        time = Number(time);
        // If time is suspiciously large (> 1 hour per session), might be in milliseconds
        // But for now, assume it's in seconds as per documentation
        return sum + (isNaN(time) ? 0 : time);
      }, 0);

      // Get sessions from last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const weeklySessions = sessions.filter((session) => {
        const sessionDate = session.createdAt?.toDate
          ? session.createdAt.toDate()
          : new Date(session.createdAt);
        return sessionDate >= sevenDaysAgo;
      });

      // Calculate weekly learning time
      const weeklyTime = weeklySessions.reduce((sum, session) => {
        let time = session.timeTaken || 0;
        time = Number(time);
        return sum + (isNaN(time) ? 0 : time);
      }, 0);

      // Calculate average session time
      const averageSessionTime =
        sessions.length > 0 ? totalTime / sessions.length : 0;

      console.log('⏱️ Calculated Time Stats:', {
        totalTime,
        weeklyTime,
        averageSessionTime,
        totalSessions: sessions.length,
        weeklySessions: weeklySessions.length,
      });

      setTimeStats({
        totalTime,
        weeklyTime,
        averageSessionTime,
        totalSessions: sessions.length,
      });
    } catch (error) {
      console.error('Error loading time stats:', error);
      setTimeStats(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View className="bg-white rounded-2xl p-4 mb-4 shadow-md items-center">
        <ActivityIndicator size="small" color="#8b5cf6" />
        <Text className="text-gray-600 mt-2 text-sm">Loading time stats...</Text>
      </View>
    );
  }

  if (!timeStats) {
    return null;
  }

  return (
    <View className="bg-white rounded-2xl p-4 mb-4 shadow-md">
      {/* Header */}
      <View className="flex-row items-center mb-2">
        <View className="bg-blue-100 rounded-full p-1.5 mr-2">
          <MaterialIcons name="access-time" size={20} color="#3b82f6" />
        </View>
        <Text className="text-lg font-bold text-gray-800">Learning Time</Text>
      </View>

      {/* Stats */}
      <View>
        {/* This Week */}
        <View className="flex-row items-center justify-between py-2 border-b border-gray-100">
          <View className="flex-row items-center flex-1">
            <MaterialIcons name="calendar-today" size={16} color="#3b82f6" style={{ marginRight: 6 }} />
            <Text className="text-sm font-medium text-gray-700">This Week:</Text>
          </View>
          <Text className="text-sm font-bold text-gray-800">
            {formatTime(timeStats.weeklyTime)}
          </Text>
        </View>

        {/* Average Session */}
        <View className="flex-row items-center justify-between py-2 border-b border-gray-100">
          <View className="flex-row items-center flex-1">
            <MaterialIcons name="schedule" size={16} color="#3b82f6" style={{ marginRight: 6 }} />
            <Text className="text-sm font-medium text-gray-700">Average Session:</Text>
          </View>
          <Text className="text-sm font-bold text-gray-800">
            {formatTime(Math.round(timeStats.averageSessionTime))}
          </Text>
        </View>

        {/* Total Practice Time */}
        <View className="flex-row items-center justify-between py-2">
          <View className="flex-row items-center flex-1">
            <MaterialIcons name="timer" size={16} color="#3b82f6" style={{ marginRight: 6 }} />
            <Text className="text-sm font-medium text-gray-700">Total Practice Time:</Text>
          </View>
          <Text className="text-sm font-bold text-gray-800">
            {formatTime(timeStats.totalTime)}
          </Text>
        </View>
      </View>
    </View>
  );
};

export default LearningTimeCard;

