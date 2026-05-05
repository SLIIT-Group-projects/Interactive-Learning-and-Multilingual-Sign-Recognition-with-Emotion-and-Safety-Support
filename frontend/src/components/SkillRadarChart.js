import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { RadarChart } from 'react-native-gifted-charts';
import { getChildGameSessions } from '../services/firestore/gameService';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase/firebaseConfig';

const screenWidth = Dimensions.get('window').width;
const chartSize = screenWidth - 120;

const SkillRadarChart = ({ childId, visible, onClose }) => {
  const [skillData, setSkillData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && childId) {
      loadSkillData();
    }
  }, [visible, childId]);

  const loadSkillData = async () => {
    if (!childId) return;

    setLoading(true);
    try {
      // Get all game sessions
      const sessions = await getChildGameSessions(childId, 1000);

      // Get letter performance
      const letterPerfQuery = query(
        collection(db, 'letterPerformance'),
        where('childId', '==', childId)
      );
      const letterPerfSnapshot = await getDocs(letterPerfQuery);

      const letterPerformance = [];
      letterPerfSnapshot.forEach((doc) => {
        const data = doc.data();
        letterPerformance.push({
          letter: data.letter,
          attempts: data.attempts || 0,
          correct: data.correct || 0,
          averageResponseTime: data.averageResponseTime || 0,
        });
      });

      // Debug logging
      console.log('📊 Skill Radar Data:', {
        sessionsCount: sessions.length,
        letterPerformanceCount: letterPerformance.length,
        letterPerformanceSample: letterPerformance.slice(0, 3),
        sessionsSample: sessions.slice(0, 2).map(s => ({ accuracy: s.accuracy })),
      });

      // Calculate metrics
      const metrics = calculateSkillMetrics(sessions, letterPerformance);
      console.log('📈 Calculated Metrics:', metrics);
      setSkillData(metrics);
    } catch (error) {
      console.error('Error loading skill data:', error);
      setSkillData(null);
    } finally {
      setLoading(false);
    }
  };

  const calculateSkillMetrics = (sessions, letterPerformance) => {
    // 1. Accuracy: average accuracy from gameSessions
    let accuracy = 0;
    if (sessions.length > 0) {
      const totalAccuracy = sessions.reduce((sum, s) => sum + (s.accuracy || 0), 0);
      accuracy = totalAccuracy / sessions.length;
    }

    // 2. Speed: averageResponseTime from letterPerformance (inverse normalized)
    let speed = 0;
    if (letterPerformance.length > 0) {
      const lettersWithTime = letterPerformance.filter((lp) => lp.averageResponseTime > 0 && lp.averageResponseTime !== null);
      console.log('⏱️ Letters with response time:', lettersWithTime.length, lettersWithTime.map(lp => ({ letter: lp.letter, time: lp.averageResponseTime })));
      if (lettersWithTime.length > 0) {
        const avgResponseTime = lettersWithTime.reduce(
          (sum, lp) => sum + lp.averageResponseTime,
          0
        ) / lettersWithTime.length;
        console.log('⏱️ Average response time:', avgResponseTime, 'ms');
        // Normalize: 0-5s = 100-50, 5-30s = 50-0 (inverse relationship)
        // Formula: 100 - (avgTime / 300), clamped to 0-100
        // This gives: 0s=100, 5s=83, 10s=67, 15s=50, 30s=0
        speed = Math.max(0, Math.min(100, 100 - (avgResponseTime / 300)));
        console.log('⏱️ Calculated speed:', speed, '%');
      } else {
        console.log('⚠️ No letters with response time data');
      }
    } else {
      console.log('⚠️ No letter performance data found');
    }

    // 3. Consistency: standard deviation of session accuracy (inverse normalized)
    let consistency = 0;
    if (sessions.length > 1) {
      const accuracies = sessions.map((s) => s.accuracy || 0);
      const mean = accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length;
      const variance = accuracies.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / accuracies.length;
      const stdDev = Math.sqrt(variance);
      console.log('📊 Consistency calc:', { mean, stdDev, accuracies: accuracies.slice(0, 5) });
      // Lower stdDev = higher consistency
      // Normalize: assume stdDev of 50 = 0, stdDev of 0 = 100
      consistency = Math.max(0, Math.min(100, 100 - (stdDev * 2)));
    } else if (sessions.length === 1) {
      consistency = 100; // Perfect consistency with only one session
      console.log('📊 Only one session - perfect consistency');
    }

    // 4. Recognition: letters mastered / 26 * 100
    const masteredLetters = letterPerformance.filter(
      (lp) => lp.attempts >= 5 && lp.attempts > 0 && (lp.correct / lp.attempts) >= 0.8
    );
    console.log('🎯 Mastered letters:', masteredLetters.length, masteredLetters.map(lp => lp.letter));
    const recognition = (masteredLetters.length / 26) * 100;

    // 5. Reaction Time: inverse of response time normalized to 100
    let reactionTime = 0;
    if (letterPerformance.length > 0) {
      const lettersWithTime = letterPerformance.filter((lp) => lp.averageResponseTime > 0 && lp.averageResponseTime !== null);
      if (lettersWithTime.length > 0) {
        const avgResponseTime = lettersWithTime.reduce(
          (sum, lp) => sum + lp.averageResponseTime,
          0
        ) / lettersWithTime.length;
        // Same normalization as Speed
        reactionTime = Math.max(0, Math.min(100, 100 - (avgResponseTime / 300)));
      }
    }

    const metrics = {
      accuracy: Math.round(accuracy),
      speed: Math.round(speed),
      consistency: Math.round(consistency),
      recognition: Math.round(recognition),
      reactionTime: Math.round(reactionTime),
    };

    console.log('✅ Final metrics:', metrics);
    return metrics;
  };

  const getSkillInsightSummary = (metrics) => {
    if (!metrics) return 'Skill insight is not available yet.';

    const keys = ['accuracy', 'speed', 'consistency', 'recognition', 'reactionTime'];
    const value = (key) => Math.max(0, Math.min(100, Number(metrics[key]) || 0));

    const tier = (v) => {
      if (v >= 85) return 'HIGH';
      if (v < 60) return 'LOW';
      return 'MED';
    };

    const t = {};
    keys.forEach((key) => {
      t[key] = tier(value(key));
    });

    const areaPhrase = (key) => {
      const phrases = {
        accuracy: 'accuracy',
        speed: 'speed',
        consistency: 'consistency',
        recognition: 'gesture recognition',
        reactionTime: 'reaction time',
      };
      return phrases[key] || key;
    };

    const formatAreaList = (arr) => {
      const list = arr.map(areaPhrase);
      if (list.length === 0) return '';
      if (list.length === 1) return list[0];
      if (list.length === 2) return `${list[0]} and ${list[1]}`;
      return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
    };

    // 1. Fully balanced strong
    if (keys.every((key) => t[key] === 'HIGH')) {
      return 'Child demonstrates strong and well-balanced performance across all learning areas.';
    }

    // 2. Speed vs accuracy (order matters)
    if (t.speed === 'HIGH' && t.accuracy === 'LOW') {
      return 'Child responds quickly but struggles with accuracy, indicating guess-based responses.';
    }
    if (t.accuracy === 'HIGH' && t.speed === 'LOW') {
      return 'Child is accurate but slower in responding. Improving speed will enhance performance.';
    }

    // 3. Recognition vs accuracy gap
    if (t.recognition === 'HIGH' && t.accuracy === 'LOW') {
      return 'Child understands gestures but struggles to apply them correctly.';
    }
    if (t.recognition === 'LOW' && t.accuracy === 'LOW') {
      return 'Gesture understanding is still developing, affecting overall accuracy.';
    }

    // 4. Consistency + accuracy relation
    if (t.consistency === 'LOW' && t.accuracy === 'HIGH') {
      return 'Child performs well but lacks consistency across sessions.';
    }
    if (t.consistency === 'LOW' && t.accuracy === 'LOW') {
      return 'Performance is inconsistent and requires more structured practice.';
    }

    // 5. Speed + reaction time relation
    if (t.speed === 'HIGH' && t.reactionTime === 'HIGH') {
      return 'Child shows fast and responsive performance.';
    }
    if (t.speed === 'LOW' && t.reactionTime === 'LOW') {
      return 'Child responds slowly, indicating delayed recognition and reaction.';
    }

    const lowKeys = keys.filter((key) => t[key] === 'LOW');
    const highKeys = keys.filter((key) => t[key] === 'HIGH');

    // 6. Multi-weakness behavior
    if (lowKeys.length >= 3) {
      return 'Child is currently struggling across multiple skill areas and needs guided practice.';
    }
    if (lowKeys.length === 2) {
      return 'Child needs improvement in key skill areas to achieve better overall performance.';
    }

    // 7. Mixed profile (at least one HIGH and one LOW)
    if (highKeys.length >= 1 && lowKeys.length >= 1) {
      const strengths = formatAreaList(highKeys.slice(0, 3));
      const weaknesses = formatAreaList(lowKeys.slice(0, 3));
      return `Child shows strengths in ${strengths} but needs improvement in ${weaknesses}.`;
    }

    // 8. Default
    return 'Child is developing skills steadily. Continued practice will improve overall performance.';
  };

  const renderRadarChart = () => {
    if (!skillData) return null;

    // Prepare data for RadarChart - data should be number[] (array of numbers)
    const radarData = [
      Math.max(0, Math.min(100, Number(skillData.accuracy) || 0)),
      Math.max(0, Math.min(100, Number(skillData.speed) || 0)),
      Math.max(0, Math.min(100, Number(skillData.consistency) || 0)),
      Math.max(0, Math.min(100, Number(skillData.recognition) || 0)),
      Math.max(0, Math.min(100, Number(skillData.reactionTime) || 0)),
    ];

    // Labels should be a separate string[] array
    const labels = ['Accuracy', 'Speed', 'Consistency', 'Recognition', 'Reaction'];

    return (
      <View className="items-center" style={{ paddingVertical: 20 }}>
        <RadarChart
          data={radarData}
          labels={labels}
          maxValue={100}
          chartSize={chartSize}
          noOfSections={4}
          polygonConfig={{
            stroke: '#7c3aed',
            strokeWidth: 2,
            fill: 'rgba(124, 58, 237, 0.2)',
            showGradient: false,
          }}
          gridConfig={{
            stroke: '#e5e7eb',
            strokeWidth: 1,
            fill: 'transparent',
            showGradient: false,
          }}
          labelConfig={{
            fontSize: 12,
            stroke: '#374151',
            fontWeight: 'normal',
          }}
          asterLinesConfig={{
            stroke: '#e5e7eb',
            strokeWidth: 1,
          }}
          isAnimated={false}
          hideLabels={false}
          hideGrid={false}
          hideAsterLines={false}
        />
      </View>
    );
  };

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
              Skill Radar Chart
            </Text>
            <TouchableOpacity
              onPress={onClose}
              className="p-2 rounded-full bg-gray-100"
            >
              <MaterialIcons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView className="p-4" showsVerticalScrollIndicator={false}>
            {loading ? (
              <View className="items-center py-12">
                <ActivityIndicator size="large" color="#8b5cf6" />
                <Text className="text-gray-600 mt-4">Loading skill data...</Text>
              </View>
            ) : !skillData ? (
              <View className="items-center py-12">
                <MaterialIcons name="radar" size={48} color="#d1d5db" />
                <Text className="text-gray-500 mt-4 text-center">
                  No skill data available
                </Text>
              </View>
            ) : (
              <>
                <View className="bg-indigo-50 rounded-xl p-3 mb-4">
                  <Text className="text-xs font-semibold text-indigo-800 mb-1">
                    Skill Insight Summary
                  </Text>
                  <Text className="text-xs text-indigo-900 leading-5">
                    {getSkillInsightSummary(skillData)}
                  </Text>
                </View>

                {/* Chart */}
                <View className="items-center mb-4" style={{ minHeight: chartSize }}>
                  {renderRadarChart()}
                </View>

                {/* Skill Details */}
                <View className="mt-4">
                  <View className="flex-row items-center justify-between py-2 border-b border-gray-100">
                    <View className="flex-row items-center flex-1">
                      <View className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: '#7c3aed' }} />
                      <Text className="text-sm font-medium text-gray-700">Accuracy</Text>
                    </View>
                    <Text className="text-sm font-bold text-gray-800">{skillData.accuracy}%</Text>
                  </View>
                  <View className="flex-row items-center justify-between py-2 border-b border-gray-100">
                    <View className="flex-row items-center flex-1">
                      <View className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: '#7c3aed' }} />
                      <Text className="text-sm font-medium text-gray-700">Speed</Text>
                    </View>
                    <Text className="text-sm font-bold text-gray-800">{skillData.speed}%</Text>
                  </View>
                  <View className="flex-row items-center justify-between py-2 border-b border-gray-100">
                    <View className="flex-row items-center flex-1">
                      <View className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: '#7c3aed' }} />
                      <Text className="text-sm font-medium text-gray-700">Consistency</Text>
                    </View>
                    <Text className="text-sm font-bold text-gray-800">{skillData.consistency}%</Text>
                  </View>
                  <View className="flex-row items-center justify-between py-2 border-b border-gray-100">
                    <View className="flex-row items-center flex-1">
                      <View className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: '#7c3aed' }} />
                      <Text className="text-sm font-medium text-gray-700">Recognition</Text>
                    </View>
                    <Text className="text-sm font-bold text-gray-800">{skillData.recognition}%</Text>
                  </View>
                  <View className="flex-row items-center justify-between py-2">
                    <View className="flex-row items-center flex-1">
                      <View className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: '#7c3aed' }} />
                      <Text className="text-sm font-medium text-gray-700">Reaction Time</Text>
                    </View>
                    <Text className="text-sm font-bold text-gray-800">{skillData.reactionTime}%</Text>
                  </View>
                </View>

              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export default SkillRadarChart;

