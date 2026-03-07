import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase/firebaseConfig';

const LetterProgressCard = ({ childId }) => {
  const [loading, setLoading] = useState(false);
  const [lettersLearned, setLettersLearned] = useState(0);
  const [weakLetters, setWeakLetters] = useState([]);

  useEffect(() => {
    if (childId) {
      loadLetterProgress();
    }
  }, [childId]);

  const loadLetterProgress = async () => {
    if (!childId || !db) {
      setLettersLearned(0);
      setWeakLetters([]);
      return;
    }

    setLoading(true);
    try {
      // Get letter performance
      const letterPerfQuery = query(
        collection(db, 'letterPerformance'),
        where('childId', '==', childId)
      );
      const letterPerfSnapshot = await getDocs(letterPerfQuery);

      const letterPerformance = [];
      letterPerfSnapshot.forEach((doc) => {
        const data = doc.data();
        const attempts = data.attempts || 0;
        const correct = data.correct || 0;
        const accuracy = attempts > 0 ? (correct / attempts) * 100 : 0;

        letterPerformance.push({
          letter: data.letter,
          attempts,
          correct,
          accuracy,
        });
      });

      // Calculate letters learned (accuracy >= 70 AND attempts >= 3)
      const learned = letterPerformance.filter(
        (lp) => lp.accuracy >= 70 && lp.attempts >= 3
      );
      setLettersLearned(learned.length);

      // Calculate weak letters (accuracy < 50 AND attempts >= 3)
      const weak = letterPerformance
        .filter((lp) => lp.accuracy < 50 && lp.attempts >= 3)
        .map((lp) => lp.letter)
        .sort();
      setWeakLetters(weak);
    } catch (error) {
      console.error('Error loading letter progress:', error);
      setLettersLearned(0);
      setWeakLetters([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View className="bg-white rounded-2xl p-4 mb-4 shadow-md items-center">
        <ActivityIndicator size="small" color="#8b5cf6" />
        <Text className="text-gray-600 mt-2 text-sm">Loading letter progress...</Text>
      </View>
    );
  }

  return (
    <View className="bg-white rounded-2xl p-4 mb-4 shadow-md">
      {/* Header */}
      <View className="flex-row items-center mb-2">
        <View className="bg-purple-100 rounded-full p-1.5 mr-2">
          <MaterialIcons name="spellcheck" size={20} color="#7c3aed" />
        </View>
        <Text className="text-lg font-bold text-gray-800">Letters Learned</Text>
      </View>

      {/* Letters Learned Count */}
      <View className="mb-3">
        <View className="flex-row items-baseline">
          <Text className="text-2xl font-bold text-purple-600">
            {lettersLearned}
          </Text>
          <Text className="text-base text-gray-500 ml-1">/ 26</Text>
        </View>
        <View className="mt-1.5">
          {/* Progress bar */}
          <View className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <View
              className="h-full rounded-full bg-purple-500"
              style={{ width: `${(lettersLearned / 26) * 100}%` }}
            />
          </View>
        </View>
      </View>

      {/* Weak Letters */}
      {weakLetters.length > 0 ? (
        <View className="border-t border-gray-100 pt-2 mt-2">
          <View className="flex-row items-center mb-1.5">
            <MaterialIcons name="warning" size={16} color="#f97316" style={{ marginRight: 6 }} />
            <Text className="text-sm font-medium text-gray-700">Needs Practice:</Text>
          </View>
          <View className="flex-row flex-wrap">
            {weakLetters.map((letter, index) => (
              <View
                key={index}
                className="bg-orange-100 px-2 py-1 rounded mr-2 mb-1"
              >
                <Text className="text-xs font-bold text-orange-700">{letter}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View className="border-t border-gray-100 pt-2 mt-2">
          <View className="flex-row items-center">
            <MaterialIcons name="check-circle" size={16} color="#10b981" style={{ marginRight: 6 }} />
            <Text className="text-sm text-gray-600">No weak letters identified</Text>
          </View>
        </View>
      )}
    </View>
  );
};

export default LetterProgressCard;

