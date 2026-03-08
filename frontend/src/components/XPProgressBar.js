import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { getLevelFromTotalXP, XP_PER_LEVEL } from '../services/firestore/childProgressService';

/**
 * Reusable XP progress bar component.
 * Shows current level, XP in current level, XP required for next level,
 * animated fill, level badge, and optional "Level Up!" animation.
 *
 * @param {number} totalXP - Total XP earned (used to derive level and current level XP)
 * @param {number} [level] - Optional override for level (otherwise derived from totalXP)
 * @param {boolean} [showLevelUp] - When true, triggers "Level Up!" animation
 * @param {string} [size] - 'compact' | 'normal' - compact for inline (e.g. PlayGame), normal for cards
 */
const XPProgressBar = ({ totalXP = 0, level: levelProp, showLevelUp = false, size = 'normal' }) => {
  const { level: derivedLevel, currentLevelXP, xpForNextLevel } = getLevelFromTotalXP(totalXP);
  const level = levelProp ?? derivedLevel;
  const requiredXP = XP_PER_LEVEL; // 200 per level
  const fillPercentage = requiredXP > 0 ? (currentLevelXP / requiredXP) * 100 : 0;

  const fillAnim = useRef(new Animated.Value(0)).current;
  const levelUpScale = useRef(new Animated.Value(1)).current;
  const levelUpOpacity = useRef(new Animated.Value(0)).current;

  // Animate progress bar when fill percentage changes
  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: fillPercentage,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [fillPercentage]);

  // "Level Up!" animation when parent sets showLevelUp
  useEffect(() => {
    if (!showLevelUp) return;
    levelUpOpacity.setValue(1);
    levelUpScale.setValue(0.5);
    Animated.parallel([
      Animated.timing(levelUpScale, {
        toValue: 1.2,
        duration: 300,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(levelUpOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      levelUpScale.setValue(1);
    });
  }, [showLevelUp]);

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  const isCompact = size === 'compact';
  const iconSize = isCompact ? 22 : 28;
  const barHeight = isCompact ? 8 : 12;

  return (
    <View className={`bg-white rounded-2xl p-4 shadow-md ${isCompact ? 'py-3' : ''}`}>
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center">
          <View className="rounded-lg bg-violet-100 items-center justify-center mr-2" style={{ width: iconSize + 8, height: iconSize + 8 }}>
            <MaterialIcons name="military-tech" size={iconSize} color="#7c3aed" />
          </View>
          <Text className={`font-bold text-gray-800 ${isCompact ? 'text-lg' : 'text-xl'}`}>
            Level {level}
          </Text>
        </View>
        <Text className="text-sm text-gray-500">
          {totalXP} XP total
        </Text>
      </View>

      {/* Progress bar with XP below */}
      <View className="overflow-hidden rounded-full" style={{ height: barHeight, backgroundColor: '#e5e7eb' }}>
        <Animated.View
          style={{
            height: barHeight,
            borderRadius: barHeight / 2,
            backgroundColor: '#8b5cf6',
            width: fillWidth,
          }}
        />
      </View>
      <Text className="text-xs text-gray-500 mt-1.5">
        XP: {currentLevelXP} / {requiredXP} to Level {level + 1}
      </Text>

      {/* "Level Up!" overlay animation */}
      {showLevelUp && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: 16,
            backgroundColor: 'rgba(139, 92, 246, 0.15)',
            justifyContent: 'center',
            alignItems: 'center',
            opacity: levelUpOpacity,
            transform: [{ scale: levelUpScale }],
          }}
        >
          <Text className="text-xl font-bold text-violet-700">Level Up!</Text>
        </Animated.View>
      )}
    </View>
  );
};

export default XPProgressBar;
