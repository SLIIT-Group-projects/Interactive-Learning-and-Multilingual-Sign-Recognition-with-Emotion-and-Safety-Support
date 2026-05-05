import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase/firebaseConfig';

const TOTAL_LETTERS = 26;

const safeAccuracy = (correct, attempts) => {
  if (!attempts || attempts <= 0) return 0;
  return (correct / attempts) * 100;
};

export const getSkillAnalysis = (letterPerformance) => {
  const masteredLetters = letterPerformance.filter(
    (item) => item.attempts >= 5 && item.accuracy >= 80
  );

  const learnedLetters = letterPerformance.filter(
    (item) => item.attempts >= 3 && item.accuracy >= 70
  );

  const weakLetters = letterPerformance.filter(
    (item) => item.attempts >= 3 && item.accuracy < 50
  );

  const improvingLetters = letterPerformance.filter(
    (item) => item.attempts >= 3 && item.accuracy >= 50 && item.accuracy < 80
  );

  return {
    masteredLetters,
    learnedLetters,
    weakLetters,
    improvingLetters,
  };
};

const insightText = ({ masteredCount, weakCount, learnedCount }) => {
  if (masteredCount >= 16 && weakCount <= 3) {
    return 'Child has mastered most basic gestures.';
  }

  if (weakCount >= 5) {
    return 'Some letters require additional practice.';
  }

  if (learnedCount >= 8) {
    return 'Learning progress is moderate with room for improvement.';
  }

  return 'Consistent practice can strengthen gesture recognition skills.';
};

const SkillAnalysisCard = ({ childId }) => {
  const [loading, setLoading] = useState(false);
  const [letterPerformance, setLetterPerformance] = useState([]);

  useEffect(() => {
    const loadLetterPerformance = async () => {
      if (!childId || !db) {
        setLetterPerformance([]);
        return;
      }

      setLoading(true);
      try {
        const letterPerfQuery = query(
          collection(db, 'letterPerformance'),
          where('childId', '==', childId)
        );

        const snapshot = await getDocs(letterPerfQuery);
        const performance = [];

        snapshot.forEach((doc) => {
          const data = doc.data();
          const attempts = Number(data.attempts) || 0;
          const correct = Number(data.correct) || 0;
          const incorrect = Number(data.incorrect) || 0;
          const accuracy = safeAccuracy(correct, attempts);

          performance.push({
            letter: data.letter,
            attempts,
            correct,
            incorrect,
            accuracy,
            averageResponseTime: data.averageResponseTime || 0,
            lastPracticed: data.lastPracticed || null,
          });
        });

        setLetterPerformance(performance);
      } catch (error) {
        console.error('Error loading skill analysis data:', error);
        setLetterPerformance([]);
      } finally {
        setLoading(false);
      }
    };

    loadLetterPerformance();
  }, [childId]);

  const attemptedLetters = useMemo(
    () => letterPerformance.filter((item) => item.attempts > 0),
    [letterPerformance]
  );

  const { masteredLetters, learnedLetters, weakLetters, improvingLetters } = useMemo(
    () => getSkillAnalysis(letterPerformance),
    [letterPerformance]
  );

  const topMastered = useMemo(
    () =>
      [...masteredLetters]
        .sort((a, b) => b.accuracy - a.accuracy)
        .slice(0, 5),
    [masteredLetters]
  );

  const weakestLetters = useMemo(
    () =>
      [...weakLetters]
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, 5),
    [weakLetters]
  );

  const topImproving = useMemo(
    () =>
      [...improvingLetters]
        .sort((a, b) => b.accuracy - a.accuracy)
        .slice(0, 5),
    [improvingLetters]
  );

  const masteredCount = masteredLetters.length;
  const learnedCount = learnedLetters.length;
  const weakCount = weakLetters.length;
  const inProgressCount = Math.max(0, learnedCount - masteredCount);
  const masteryPercent = Math.max(0, Math.min(100, (masteredCount / TOTAL_LETTERS) * 100));

  if (loading) {
    return (
      <View className="bg-white rounded-2xl p-4 mb-4 shadow-md items-center">
        <ActivityIndicator size="small" color="#8b5cf6" />
        <Text className="text-gray-600 mt-2 text-sm">Loading skill analysis...</Text>
      </View>
    );
  }

  if (attemptedLetters.length === 0) {
    return (
      <View className="bg-white rounded-2xl p-4 mb-4 shadow-md">
        <View className="flex-row items-center mb-2">
          <View className="bg-purple-100 rounded-full p-1.5 mr-2">
            <MaterialIcons name="analytics" size={20} color="#7c3aed" />
          </View>
          <Text className="text-lg font-bold text-gray-800">Skill Analysis</Text>
        </View>
        <View className="bg-gray-50 rounded-xl p-3">
          <Text className="text-sm text-gray-600">No practice data available</Text>
        </View>
      </View>
    );
  }

  const insight = insightText({ masteredCount, weakCount, learnedCount });

  return (
    <View className="bg-white rounded-2xl p-4 mb-4 shadow-md">
      <View className="flex-row items-center mb-3">
        <View className="bg-purple-100 rounded-full p-1.5 mr-2">
          <MaterialIcons name="analytics" size={20} color="#7c3aed" />
        </View>
        <Text className="text-lg font-bold text-gray-800">Skill Analysis</Text>
      </View>

      <View className="bg-gray-50 rounded-xl p-3 mb-3">
        <Text className="text-sm text-gray-700 mb-1">
          <Text className="font-bold text-green-700">{masteredCount}</Text> / 26 letters mastered
        </Text>
        <Text className="text-sm text-gray-700 mb-1">
          <Text className="font-bold text-amber-600">{inProgressCount}</Text> letters in progress
        </Text>
        <Text className="text-sm text-gray-700">
          <Text className="font-bold text-red-600">{weakCount}</Text> letters need improvement
        </Text>
      </View>

      <View className="mb-3">
        <View className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <View
            className="h-full rounded-full bg-green-500"
            style={{ width: `${masteryPercent}%` }}
          />
        </View>
      </View>

      <View className="mb-3">
        <Text className="text-sm font-semibold text-green-700 mb-1">
          ✅ Strong / Mastered Letters
        </Text>
        {topMastered.length > 0 ? (
          <View className="flex-row flex-wrap">
            {topMastered.map((item) => (
              <View key={item.letter} className="bg-green-100 rounded-md px-2 py-1 mr-2 mb-2">
                <Text className="text-xs font-bold text-green-800">
                  {item.letter} {Math.round(item.accuracy)}%
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="text-xs text-gray-500">No mastered letters yet.</Text>
        )}
      </View>

      <View className="mb-3">
        <Text className="text-sm font-semibold text-red-700 mb-1">⚠️ Weak Letters</Text>
        {weakestLetters.length > 0 ? (
          <View className="flex-row flex-wrap">
            {weakestLetters.map((item) => (
              <View key={item.letter} className="bg-red-100 rounded-md px-2 py-1 mr-2 mb-2">
                <Text className="text-xs font-bold text-red-700">
                  {item.letter} {Math.round(item.accuracy)}%
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="text-xs text-gray-500">No weak letters identified.</Text>
        )}
      </View>

      <View className="mb-3">
        <Text className="text-sm font-semibold text-amber-700 mb-1">📈 Improving Letters</Text>
        {topImproving.length > 0 ? (
          <View className="flex-row flex-wrap">
            {topImproving.map((item) => (
              <View key={item.letter} className="bg-amber-100 rounded-md px-2 py-1 mr-2 mb-2">
                <Text className="text-xs font-bold text-amber-700">
                  {item.letter} {Math.round(item.accuracy)}%
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="text-xs text-gray-500">No improving letters yet.</Text>
        )}
      </View>

      <View className="bg-indigo-50 rounded-xl p-3">
        <Text className="text-sm text-indigo-900">{insight}</Text>
      </View>
    </View>
  );
};

export default SkillAnalysisCard;
