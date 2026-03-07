import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase/firebaseConfig';

const ASLSkillHeatmap = ({ childId }) => {
  const [loading, setLoading] = useState(false);
  const [letterData, setLetterData] = useState({});
  const [selectedLetter, setSelectedLetter] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  useEffect(() => {
    if (childId) {
      loadLetterData();
    }
  }, [childId]);

  const loadLetterData = async () => {
    if (!childId || !db) {
      setLetterData({});
      return;
    }

    setLoading(true);
    try {
      const letterPerfQuery = query(
        collection(db, 'letterPerformance'),
        where('childId', '==', childId)
      );
      const letterPerfSnapshot = await getDocs(letterPerfQuery);

      const data = {};
      letterPerfSnapshot.forEach((doc) => {
        const docData = doc.data();
        const attempts = docData.attempts || 0;
        const correct = docData.correct || 0;
        const accuracy = attempts > 0 ? (correct / attempts) * 100 : 0;

        data[docData.letter] = {
          letter: docData.letter,
          attempts,
          correct,
          incorrect: docData.incorrect || 0,
          accuracy,
          averageResponseTime: docData.averageResponseTime || 0,
          lastPracticed: docData.lastPracticed,
        };
      });

      // Initialize all letters (A-Z) with default values if not in data
      alphabet.forEach((letter) => {
        if (!data[letter]) {
          data[letter] = {
            letter,
            attempts: 0,
            correct: 0,
            incorrect: 0,
            accuracy: 0,
            averageResponseTime: 0,
            lastPracticed: null,
          };
        }
      });

      setLetterData(data);
    } catch (error) {
      console.error('Error loading letter data:', error);
      setLetterData({});
    } finally {
      setLoading(false);
    }
  };

  const getColorForAccuracy = (accuracy, attempts) => {
    if (attempts === 0) return '#d1d5db'; // Grey - Not practiced
    if (accuracy >= 85) return '#22c55e'; // Green - Mastered
    if (accuracy >= 60) return '#facc15'; // Yellow - Improving
    if (accuracy >= 30) return '#fb923c'; // Orange - Weak
    return '#ef4444'; // Red - Needs practice
  };

  const getStatusForAccuracy = (accuracy, attempts) => {
    if (attempts === 0) return 'Not Practiced';
    if (accuracy >= 85) return 'Mastered';
    if (accuracy >= 60) return 'Improving';
    if (accuracy >= 30) return 'Weak';
    return 'Needs Practice';
  };

  const calculateMasteredLetters = () => {
    return Object.values(letterData).filter(
      (data) => data.accuracy >= 70 && data.attempts >= 3
    ).length;
  };

  const handleTilePress = (letter) => {
    setSelectedLetter(letterData[letter]);
    setShowModal(true);
  };

  const renderTile = (letter) => {
    const data = letterData[letter] || {
      letter,
      attempts: 0,
      accuracy: 0,
    };

    const tileColor = getColorForAccuracy(data.accuracy, data.attempts);

    return (
      <View
        key={letter}
        className="rounded-lg items-center justify-center m-1"
        style={{
          backgroundColor: tileColor,
          width: 45,
          height: 45,
        }}
      >
        <TouchableOpacity
          onPress={() => handleTilePress(letter)}
          activeOpacity={0.7}
          className="w-full h-full items-center justify-center"
        >
          <Text className="text-base font-bold text-gray-800">{letter}</Text>
          {data.attempts > 0 && (
            <Text className="text-xs font-semibold text-gray-700">
              {Math.round(data.accuracy)}%
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View className="bg-white rounded-2xl p-4 mb-4 shadow-md items-center">
        <ActivityIndicator size="small" color="#8b5cf6" />
        <Text className="text-gray-600 mt-2 text-sm">Loading heatmap...</Text>
      </View>
    );
  }

  const masteredCount = calculateMasteredLetters();

  return (
    <View className="bg-white rounded-2xl p-4 mb-4 shadow-md">
      {/* Header & Summary */}
      <View className="mb-3">
        <View className="flex-row items-center mb-2">
          <View className="bg-purple-100 rounded-full p-1.5 mr-2">
            <MaterialIcons name="grid-on" size={20} color="#7c3aed" />
          </View>
          <Text className="text-lg font-bold text-gray-800">ASL Skill Heatmap</Text>
        </View>

        {/* Mastery Summary */}
        <View className="bg-purple-50 rounded-lg p-2 mb-3">
          <Text className="text-sm font-semibold text-gray-700 mb-1">
            Alphabet Mastery
          </Text>
          <View className="flex-row items-baseline">
            <Text className="text-xl font-bold text-purple-600">{masteredCount}</Text>
            <Text className="text-sm text-gray-600 ml-1">/ 26 Letters Learned</Text>
          </View>
        </View>

        {/* Legend */}
        <View className="flex-row flex-wrap mb-3" style={{ gap: 8 }}>
          <View className="flex-row items-center">
            <View className="w-3 h-3 rounded mr-1" style={{ backgroundColor: '#22c55e' }} />
            <Text className="text-xs text-gray-600">Mastered</Text>
          </View>
          <View className="flex-row items-center">
            <View className="w-3 h-3 rounded mr-1" style={{ backgroundColor: '#facc15' }} />
            <Text className="text-xs text-gray-600">Improving</Text>
          </View>
          <View className="flex-row items-center">
            <View className="w-3 h-3 rounded mr-1" style={{ backgroundColor: '#fb923c' }} />
            <Text className="text-xs text-gray-600">Weak</Text>
          </View>
          <View className="flex-row items-center">
            <View className="w-3 h-3 rounded mr-1" style={{ backgroundColor: '#ef4444' }} />
            <Text className="text-xs text-gray-600">Needs Practice</Text>
          </View>
          <View className="flex-row items-center">
            <View className="w-3 h-3 rounded mr-1" style={{ backgroundColor: '#d1d5db' }} />
            <Text className="text-xs text-gray-600">Not Practiced</Text>
          </View>
        </View>
      </View>

      {/* Heatmap Grid */}
      <View className="flex-row flex-wrap justify-center">
        {alphabet.map((letter) => renderTile(letter))}
      </View>

      {/* Letter Details Modal */}
      <Modal
        visible={showModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <View className="flex-1 bg-black/50 items-center justify-center p-4">
          <View className="bg-white rounded-2xl p-5 w-full max-w-sm">
            {selectedLetter && (
              <>
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="text-xl font-bold text-gray-800">
                    Letter: {selectedLetter.letter}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowModal(false)}
                    className="p-2 rounded-full bg-gray-100"
                  >
                    <MaterialIcons name="close" size={20} color="#374151" />
                  </TouchableOpacity>
                </View>

                <View
                  className="rounded-lg p-3 mb-3"
                  style={{
                    backgroundColor: getColorForAccuracy(
                      selectedLetter.accuracy,
                      selectedLetter.attempts
                    ) + '20',
                  }}
                >
                  <Text className="text-sm font-semibold text-gray-700 mb-1">
                    Status: {getStatusForAccuracy(selectedLetter.accuracy, selectedLetter.attempts)}
                  </Text>
                  <Text className="text-2xl font-bold text-gray-800">
                    {Math.round(selectedLetter.accuracy)}%
                  </Text>
                </View>

                <View className="space-y-2">
                  <View className="flex-row justify-between py-2 border-b border-gray-100">
                    <Text className="text-sm text-gray-600">Attempts:</Text>
                    <Text className="text-sm font-bold text-gray-800">
                      {selectedLetter.attempts}
                    </Text>
                  </View>
                  <View className="flex-row justify-between py-2 border-b border-gray-100">
                    <Text className="text-sm text-gray-600">Correct:</Text>
                    <Text className="text-sm font-bold text-gray-800">
                      {selectedLetter.correct}
                    </Text>
                  </View>
                  <View className="flex-row justify-between py-2 border-b border-gray-100">
                    <Text className="text-sm text-gray-600">Incorrect:</Text>
                    <Text className="text-sm font-bold text-gray-800">
                      {selectedLetter.incorrect}
                    </Text>
                  </View>
                  {selectedLetter.averageResponseTime > 0 && (
                    <View className="flex-row justify-between py-2 border-b border-gray-100">
                      <Text className="text-sm text-gray-600">Avg Response Time:</Text>
                      <Text className="text-sm font-bold text-gray-800">
                        {Math.round(selectedLetter.averageResponseTime / 1000)}s
                      </Text>
                    </View>
                  )}
                  {selectedLetter.lastPracticed && (
                    <View className="flex-row justify-between py-2">
                      <Text className="text-sm text-gray-600">Last Practiced:</Text>
                      <Text className="text-sm font-bold text-gray-800">
                        {selectedLetter.lastPracticed?.toDate
                          ? selectedLetter.lastPracticed.toDate().toLocaleDateString()
                          : 'N/A'}
                      </Text>
                    </View>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default ASLSkillHeatmap;

