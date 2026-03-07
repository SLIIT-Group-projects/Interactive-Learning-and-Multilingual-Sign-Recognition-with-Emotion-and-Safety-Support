import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const LearningInsightCard = ({ insight }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!insight) {
    return null;
  }

  const { sessionsThisWeek, weeklyAccuracy, masteredLetters, weakLetters } = insight;

  return (
    <View 
      className="rounded-2xl p-4 mb-4 shadow-lg"
      style={{ backgroundColor: '#7c3aed' }} // violet-500
    >
      {/* Header */}
      <TouchableOpacity
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.8}
        className="flex-row items-center justify-between mb-2"
      >
        <View className="flex-row items-center flex-1">
          <View className="bg-white/20 rounded-full mr-2" style={{ padding: 6 }}>
            <MaterialIcons name="lightbulb" size={20} color="#ffffff" />
          </View>
          <Text className="text-lg font-bold text-white">Learning Insight</Text>
        </View>
        <MaterialIcons
          name={isExpanded ? "expand-less" : "expand-more"}
          size={24}
          color="#ffffff"
        />
      </TouchableOpacity>

      {/* Content - Collapsible */}
      {isExpanded && (
        <View>
        {/* Sessions this week */}
        <View className="flex-row items-center" style={{ marginBottom: 6 }}>
          <MaterialIcons name="check-circle" size={16} color="#10b981" style={{ marginRight: 6 }} />
          <Text className="text-sm text-white">
            Practiced <Text className="font-bold">{sessionsThisWeek}</Text> session{sessionsThisWeek !== 1 ? 's' : ''} this week
          </Text>
        </View>

        {/* Average accuracy */}
        <View className="flex-row items-center" style={{ marginBottom: 6 }}>
          <MaterialIcons name="check-circle" size={16} color="#10b981" style={{ marginRight: 6 }} />
          <Text className="text-sm text-white">
            Average accuracy: <Text className="font-bold">{weeklyAccuracy.toFixed(0)}%</Text>
          </Text>
        </View>

        {/* Mastered letters */}
        {masteredLetters.length > 0 ? (
          <View className="flex-row items-center" style={{ marginBottom: 6 }}>
            <MaterialIcons name="check-circle" size={16} color="#10b981" style={{ marginRight: 6 }} />
            <Text className="text-sm text-white">
              Mastered <Text className="font-bold">{masteredLetters.length}</Text> letter{masteredLetters.length !== 1 ? 's' : ''}:{' '}
              <Text className="font-bold">{masteredLetters.join(', ')}</Text>
            </Text>
          </View>
        ) : (
          <View className="flex-row items-center" style={{ marginBottom: 6 }}>
            <MaterialIcons name="info" size={16} color="#fbbf24" style={{ marginRight: 6 }} />
            <Text className="text-sm text-white/90">
              No letters mastered yet (need 80%+ accuracy with 5+ attempts)
            </Text>
          </View>
        )}

        {/* Weak letters */}
        {weakLetters.length > 0 ? (
          <View className="flex-row items-start">
            <MaterialIcons name="warning" size={16} color="#f97316" style={{ marginRight: 6, marginTop: 2 }} />
            <View className="flex-1">
              <Text className="text-sm text-white">
                Needs improvement: <Text className="font-bold">{weakLetters.join(', ')}</Text>
              </Text>
            </View>
          </View>
        ) : (
          <View className="flex-row items-center">
            <MaterialIcons name="check-circle" size={16} color="#10b981" style={{ marginRight: 6 }} />
            <Text className="text-sm text-white">No weak letters identified</Text>
          </View>
        )}
        </View>
      )}

      {/* Collapsed Summary */}
      {!isExpanded && (
        <View className="flex-row items-center">
          <MaterialIcons name="check-circle" size={16} color="#10b981" style={{ marginRight: 6 }} />
          <Text className="text-sm text-white/90">
            {sessionsThisWeek} session{sessionsThisWeek !== 1 ? 's' : ''} • {weeklyAccuracy.toFixed(0)}% accuracy
            {masteredLetters.length > 0 && ` • ${masteredLetters.length} mastered`}
            {weakLetters.length > 0 && ` • ${weakLetters.length} need improvement`}
          </Text>
        </View>
      )}
    </View>
  );
};

export default LearningInsightCard;

