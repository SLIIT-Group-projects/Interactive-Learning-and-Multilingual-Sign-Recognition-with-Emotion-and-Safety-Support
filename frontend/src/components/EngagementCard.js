import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const EngagementCard = ({ engagement }) => {
  if (!engagement) {
    return null;
  }

  const { sessionsThisWeek, streakCount, engagementLevel } = engagement;

  // Get engagement level color and icon
  const getEngagementStyle = (level) => {
    switch (level) {
      case 'Highly Engaged':
        return {
          color: '#10b981', // green
          bgColor: '#d1fae5', // green-100
          icon: 'trending-up',
        };
      case 'Moderately Engaged':
        return {
          color: '#f59e0b', // amber
          bgColor: '#fef3c7', // amber-100
          icon: 'trending-flat',
        };
      case 'Low Engagement':
        return {
          color: '#ef4444', // red
          bgColor: '#fee2e2', // red-100
          icon: 'trending-down',
        };
      default:
        return {
          color: '#6b7280', // gray
          bgColor: '#f3f4f6', // gray-100
          icon: 'info',
        };
    }
  };

  const style = getEngagementStyle(engagementLevel);

  return (
    <View className="bg-white rounded-2xl p-4 mb-4 shadow-md">
      <View className="flex-row items-center mb-2">
        <View 
          className="rounded-full mr-2"
          style={{ backgroundColor: style.bgColor, padding: 6 }}
        >
          <MaterialIcons name={style.icon} size={20} color={style.color} />
        </View>
        <Text className="text-lg font-bold text-gray-800">Engagement</Text>
      </View>

      <View>
        {/* Engagement Level */}
        <View className="flex-row items-center" style={{ marginBottom: 6 }}>
          <Text className="text-sm text-gray-600 mr-2">Engagement Level:</Text>
          <View 
            className="px-2 rounded-full"
            style={{ backgroundColor: style.bgColor, paddingVertical: 2 }}
          >
            <Text 
              className="text-sm font-bold"
              style={{ color: style.color }}
            >
              {engagementLevel}
            </Text>
          </View>
        </View>

        {/* Streak */}
        <View className="flex-row items-center" style={{ marginBottom: 6 }}>
          <MaterialIcons name="local-fire-department" size={16} color="#f97316" style={{ marginRight: 6 }} />
          <Text className="text-sm text-gray-700">
            Streak: <Text className="font-bold text-orange-600">{streakCount}</Text> correct answer{streakCount !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Sessions this week */}
        <View className="flex-row items-center">
          <MaterialIcons name="calendar-today" size={16} color="#3b82f6" style={{ marginRight: 6 }} />
          <Text className="text-sm text-gray-700">
            Sessions this week: <Text className="font-bold text-blue-600">{sessionsThisWeek}</Text>
          </Text>
        </View>
      </View>
    </View>
  );
};

export default EngagementCard;

