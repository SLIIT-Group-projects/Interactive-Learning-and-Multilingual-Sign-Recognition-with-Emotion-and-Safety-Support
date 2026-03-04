import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { getChildProgress, ensureChildProgress } from '../../services/firestore/childProgressService';
import { GAME_TYPES } from '../../constants/gameConstants';

const GameSelectScreen = ({ navigation }) => {
  const { userData } = useAuth();
  const childId = userData?.uid || null;
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!childId) {
        setLoading(false);
        return;
      }
      try {
        const p = await ensureChildProgress(childId);
        setProgress(p);
      } catch (error) {
        console.error('Error loading progress:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [childId]);

  const level = progress?.level ?? 1;
  const currentLevelXP = progress?.currentLevelXP ?? 0;
  const xpForNextLevel = progress?.xpForNextLevel ?? 200;
  const totalXP = progress?.totalXP ?? 0;
  const unlockedGames = progress?.unlockedGames ?? ['basic'];

  const handleGamePress = (game) => {
    const isUnlocked = unlockedGames.includes(game.id);
    if (!isUnlocked) return;
    if (game.id === 'basic') {
      navigation.navigate('PlayGame', { gameMode: game.id });
    } else {
      // Placeholder: other modes not implemented yet
      navigation.navigate('PlayGame', { gameMode: game.id });
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-blue-50 items-center justify-center">
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text className="text-gray-600 mt-4">Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-blue-50" edges={['top']}>
      <View className="flex-row items-center px-4 py-3 border-b border-gray-200 bg-white">
        <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3 p-2 -ml-2">
          <MaterialIcons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-800 flex-1">Choose Game</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
        {/* Level & XP progress bar */}
        <View className="bg-white rounded-2xl p-4 mb-6 shadow-md">
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center">
              <MaterialIcons name="military-tech" size={28} color="#8b5cf6" style={{ marginRight: 8 }} />
              <Text className="text-xl font-bold text-gray-800">Level {level}</Text>
            </View>
            <Text className="text-sm text-gray-500">{totalXP} XP total</Text>
          </View>
          <View className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <View
              className="h-full rounded-full bg-violet-500"
              style={{ width: `${(currentLevelXP / 200) * 100}%` }}
            />
          </View>
          <Text className="text-xs text-gray-500 mt-1">
            {currentLevelXP} / 200 XP to Level {level + 1}
          </Text>
        </View>

        <Text className="text-lg font-semibold text-gray-800 mb-3">Game Modes</Text>
        {GAME_TYPES.map((game) => {
          const isUnlocked = unlockedGames.includes(game.id);
          return (
            <TouchableOpacity
              key={game.id}
              onPress={() => handleGamePress(game)}
              activeOpacity={0.8}
              disabled={!isUnlocked}
              className={`rounded-2xl p-4 mb-3 shadow-md flex-row items-center ${
                isUnlocked ? 'bg-white' : 'bg-gray-100 opacity-80'
              }`}
            >
              <View
                className="w-12 h-12 rounded-xl items-center justify-center mr-4"
                style={{ backgroundColor: isUnlocked ? '#ede9fe' : '#e5e7eb' }}
              >
                {isUnlocked ? (
                  <MaterialIcons name="sports-esports" size={28} color="#7c3aed" />
                ) : (
                  <MaterialIcons name="lock" size={28} color="#6b7280" />
                )}
              </View>
              <View className="flex-1">
                <Text className={`text-lg font-bold ${isUnlocked ? 'text-gray-800' : 'text-gray-500'}`}>
                  {game.name}
                </Text>
                <Text className="text-sm text-gray-500">{game.description}</Text>
                {!isUnlocked && (
                  <Text className="text-xs text-violet-600 font-semibold mt-1">
                    Unlock at Level {game.requiredLevel}
                  </Text>
                )}
              </View>
              {isUnlocked ? (
                <MaterialIcons name="chevron-right" size={24} color="#9ca3af" />
              ) : (
                <MaterialIcons name="lock-outline" size={20} color="#9ca3af" />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
};

export default GameSelectScreen;
