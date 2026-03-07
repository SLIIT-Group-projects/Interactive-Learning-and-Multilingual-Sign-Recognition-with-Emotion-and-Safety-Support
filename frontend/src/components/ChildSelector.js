import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { getChildProgress, getLevelFromTotalXP, XP_PER_LEVEL } from '../services/firestore/childProgressService';
import { getChildGameSessions } from '../services/firestore/gameService';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase/firebaseConfig';

const ChildSelector = ({ children, selectedChild, onSelectChild, loading }) => {
  const [childProgress, setChildProgress] = useState(null);
  const [progressLoading, setProgressLoading] = useState(false);

  useEffect(() => {
    if (selectedChild?.uid) {
      loadChildProgress(selectedChild.uid);
    }
  }, [selectedChild]);

  const loadChildProgress = async (childId) => {
    if (!childId) {
      setChildProgress(null);
      return;
    }

    setProgressLoading(true);
    try {
      // Try to get from children collection first
      const progress = await getChildProgress(childId);
      
      if (progress) {
        setChildProgress({
          totalXP: progress.totalXP ?? 0,
          level: progress.level ?? 1,
          currentLevelXP: progress.currentLevelXP ?? 0,
        });
        setProgressLoading(false);
        return;
      }
    } catch (error) {
      // If permission denied, try to calculate from game sessions
      if (error.code === 'permission-denied' || error.message?.includes('permission') || error.message?.includes('insufficient permissions')) {
        console.warn('⚠️ Permission denied for children collection, calculating from game sessions...');
        try {
          await calculateProgressFromSessions(childId);
          return; // calculateProgressFromSessions sets loading to false
        } catch (calcError) {
          console.error('Error calculating from sessions:', calcError);
          // Continue to fallback
        }
      } else {
        console.error('Error loading child progress:', error);
      }
    }

    // Fallback to default values
    setChildProgress({
      totalXP: 0,
      level: 1,
      currentLevelXP: 0,
    });
    setProgressLoading(false);
  };

  // Calculate progress from game sessions (fallback when children collection is not accessible)
  const calculateProgressFromSessions = async (childId) => {
    if (!db) {
      throw new Error('Database not initialized');
    }

    try {
      // Get all game sessions for this child
      const sessions = await getChildGameSessions(childId, 1000);
      
      // Calculate total XP from sessions (estimate: each correct answer = 20 XP in basic mode)
      // This is an approximation since we don't have exact XP per session
      let estimatedTotalXP = 0;
      
      sessions.forEach((session) => {
        // Estimate: basic mode = 20 XP per correct, timed mode varies
        const correctAnswers = session.correctAnswers || 0;
        if (session.gameMode === 'timed') {
          // Timed mode: average ~15 XP per correct (mix of 10, 15, 20)
          estimatedTotalXP += correctAnswers * 15;
        } else {
          // Basic mode: 20 XP per correct
          estimatedTotalXP += correctAnswers * 20;
        }
      });

      // Calculate level from estimated XP
      const { level, currentLevelXP } = getLevelFromTotalXP(estimatedTotalXP);
      
      setChildProgress({
        totalXP: estimatedTotalXP,
        level,
        currentLevelXP,
      });
    } catch (error) {
      console.error('Error calculating from sessions:', error);
      throw error;
    } finally {
      setProgressLoading(false);
    }
  };

  // Get level name based on level
  const getLevelName = (level) => {
    const levelNames = {
      1: 'Beginner',
      2: 'Learner',
      3: 'Sign Explorer',
      4: 'Sign Master',
      5: 'ASL Champion',
    };
    return levelNames[level] || `Level ${level}`;
  };

  // Calculate next level XP and progress
  const getXPProgress = () => {
    if (!childProgress) return { nextLevelXP: 200, progress: 0, displayXP: 0 };
    
    const { level, currentLevelXP, totalXP } = childProgress;
    // nextLevelXP = level * 200 (total XP needed for next level)
    const nextLevelXP = level * XP_PER_LEVEL;
    // progress = currentLevelXP / nextLevelXP
    const progress = nextLevelXP > 0 ? currentLevelXP / nextLevelXP : 0;
    
    return {
      nextLevelXP,
      progress: Math.min(Math.max(progress, 0), 1), // Cap between 0 and 1
      displayXP: currentLevelXP,
    };
  };

  const xpProgress = getXPProgress();
  if (loading) {
    return (
      <View className="bg-white rounded-2xl p-4 mb-6 shadow-md items-center">
        <ActivityIndicator size="small" color="#8b5cf6" />
        <Text className="text-gray-500 mt-2">Loading...</Text>
      </View>
    );
  }

  if (children.length === 0) {
    return (
      <View className="bg-white rounded-2xl p-4 mb-6 shadow-md">
        <Text className="text-gray-500 text-center">No children added yet</Text>
      </View>
    );
  }

  return (
    <View className="bg-white rounded-2xl p-4 mb-4 shadow-md">
      {/* Child Name Selection */}
      {children.length === 1 ? (
        <Text className="text-lg font-semibold text-gray-800 mb-2">
          {selectedChild?.name || children[0]?.name}
        </Text>
      ) : (
        <View className="flex-row flex-wrap mb-2">
          {children.map((child) => (
            <TouchableOpacity
              key={child.id || child.uid}
              onPress={() => onSelectChild(child)}
              className={`px-4 py-2 rounded-full mr-2 mb-2 ${
                selectedChild?.uid === child.uid ? 'bg-blue-500' : 'bg-gray-200'
              }`}
            >
              <Text
                className={`text-base font-semibold ${
                  selectedChild?.uid === child.uid ? 'text-white' : 'text-gray-600'
                }`}
              >
                {child.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Level & XP Progress */}
      {selectedChild && (
        <View className="border-t border-gray-200 pt-2 mt-2">
          {progressLoading ? (
            <View className="items-center py-1">
              <ActivityIndicator size="small" color="#8b5cf6" />
            </View>
          ) : childProgress ? (
            <>
              <View className="flex-row items-center justify-between" style={{ marginBottom: 4 }}>
                <Text className="text-base font-bold text-gray-800">
                  Level {childProgress.level} – {getLevelName(childProgress.level)}
                </Text>
              </View>
              <View className="flex-row items-center justify-between" style={{ marginBottom: 6 }}>
                <Text className="text-xs text-gray-600">
                  XP: {xpProgress.displayXP} / {xpProgress.nextLevelXP}
                </Text>
              </View>
              {/* Progress Bar */}
              <View className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <View
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${xpProgress.progress * 100}%` }}
                />
              </View>
            </>
          ) : (
            <Text className="text-xs text-gray-500">Loading progress...</Text>
          )}
        </View>
      )}
    </View>
  );
};

export default ChildSelector;

