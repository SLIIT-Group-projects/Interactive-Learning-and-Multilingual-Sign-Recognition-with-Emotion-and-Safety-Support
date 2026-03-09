import {
  getDailyEmotionStats,
  getWeeklyEmotionStats,
  getChildEmotionSessions,
  getChildStoryEmotionSessions,
} from './emotionService';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

/**
 * Analyze emotion patterns and generate insights
 * @param {string} childId - Child UID
 * @param {string} parentId - Parent UID
 * @returns {Promise<Object>} Analysis results with insights
 */
export const analyzeEmotionPatterns = async (childId, parentId) => {
  try {
    if (!db) return null;

    // Get weekly stats
    const weeklyStats = await getWeeklyEmotionStats(childId, 2); // Last 2 weeks
    const recentGameSessions = await getChildEmotionSessions(childId, 20);
    const recentStorySessions = await getChildStoryEmotionSessions(childId, 20);
    const recentSessions = [...recentGameSessions, ...recentStorySessions];

    if (weeklyStats.length === 0 && recentSessions.length === 0) {
      return {
        hasData: false,
        message: 'Not enough data yet. Keep playing games and reading stories to see insights!',
      };
    }

    // Calculate patterns
    const insights = {
      hasData: true,
      overallMood: calculateOverallMood(weeklyStats, recentSessions),
      engagementTrend: calculateEngagementTrend(weeklyStats),
      confusionPatterns: analyzeConfusionPatterns(recentSessions),
      behaviorPatterns: analyzeBehaviorPatterns(recentSessions),
      sessionBreakdown: analyzeSessionBreakdown(recentGameSessions, recentStorySessions),
      recommendations: [],
      warnings: [],
      progress: calculateProgress(weeklyStats),
    };

    // Generate recommendations and warnings
    insights.recommendations = generateRecommendations(insights);
    insights.warnings = generateWarnings(insights);

    // Save insights
    await saveEmotionInsights(childId, parentId, insights);

    return insights;
  } catch (error) {
    console.error('❌ Error analyzing emotion patterns:', error);
    return null;
  }
};

/**
 * Calculate overall mood from recent data
 */
const calculateOverallMood = (weeklyStats, sessions) => {
  const emotionCounts = {};
  let totalSessions = 0;

  // Count emotions from weekly stats
  weeklyStats.forEach((day) => {
    const counts = day.emotionCounts || {};
    Object.entries(counts).forEach(([emotion, count]) => {
      emotionCounts[emotion] = (emotionCounts[emotion] || 0) + count;
      totalSessions += count;
    });
  });

  // Count emotions from recent sessions
  sessions.forEach((session) => {
    const emotion = session.finalEmotion || 'neutral';
    emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
    totalSessions += 1;
  });

  if (totalSessions === 0) return 'neutral';

  // Find dominant emotion
  let dominantEmotion = 'neutral';
  let maxCount = 0;
  Object.entries(emotionCounts).forEach(([emotion, count]) => {
    if (count > maxCount) {
      maxCount = count;
      dominantEmotion = emotion;
    }
  });

  // Calculate percentages
  const percentages = {};
  Object.entries(emotionCounts).forEach(([emotion, count]) => {
    percentages[emotion] = Math.round((count / totalSessions) * 100);
  });

  return {
    dominant: dominantEmotion,
    percentages,
    totalSessions,
  };
};

/**
 * Calculate engagement trend
 */
const calculateEngagementTrend = (weeklyStats) => {
  if (weeklyStats.length < 2) {
    return { trend: 'stable', message: 'Need more data to see trends' };
  }

  // Sort by date
  const sorted = weeklyStats.sort((a, b) => {
    const aDate = a.date || '';
    const bDate = b.date || '';
    return aDate.localeCompare(bDate);
  });

  const recent = sorted.slice(-7); // Last week
  const previous = sorted.slice(-14, -7); // Week before

  const recentAvg = calculateAvgEngagement(recent);
  const previousAvg = calculateAvgEngagement(previous);

  if (recentAvg > previousAvg + 0.2) {
    return { trend: 'improving', message: 'Engagement is improving!', recentAvg, previousAvg };
  } else if (recentAvg < previousAvg - 0.2) {
    return { trend: 'declining', message: 'Engagement has decreased', recentAvg, previousAvg };
  } else {
    return { trend: 'stable', message: 'Engagement is stable', recentAvg, previousAvg };
  }
};

const calculateAvgEngagement = (days) => {
  if (days.length === 0) return 0;

  let total = 0;
  let count = 0;

  days.forEach((day) => {
    const counts = day.engagementCounts || {};
    const high = counts.HIGH || 0;
    const medium = counts.MEDIUM || 0;
    const low = counts.LOW || 0;
    const totalDay = high + medium + low;

    if (totalDay > 0) {
      // Weight: HIGH=3, MEDIUM=2, LOW=1
      const avg = (high * 3 + medium * 2 + low * 1) / totalDay;
      total += avg;
      count += 1;
    }
  });

  return count > 0 ? total / count : 0;
};

/**
 * Analyze confusion patterns
 */
const analyzeConfusionPatterns = (sessions) => {
  const letterConfusion = {};
  let totalConfusion = 0;

  sessions.forEach((session) => {
    const letters = session.confusionLetters || [];
    letters.forEach((letter) => {
      letterConfusion[letter] = (letterConfusion[letter] || 0) + 1;
      totalConfusion += 1;
    });
  });

  // Get most confused letters
  const sorted = Object.entries(letterConfusion)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([letter, count]) => ({ letter, count }));

  return {
    totalConfusion,
    mostConfusedLetters: sorted,
    averagePerSession: sessions.length > 0 ? totalConfusion / sessions.length : 0,
  };
};

/**
 * Analyze behavior patterns
 */
const analyzeBehaviorPatterns = (sessions) => {
  const behaviorCounts = {};
  const negativeBehaviors = ['Angry', 'Sad', 'Fear', 'Distressed', 'Highly Agitated Angry'];
  const positiveBehaviors = ['Happy', 'Excited Happy', 'Calm Happy', 'Calm Neutral'];

  sessions.forEach((session) => {
    const behavior = session.behavior || 'Cannot detect';
    behaviorCounts[behavior] = (behaviorCounts[behavior] || 0) + 1;
  });

  let negativeCount = 0;
  let positiveCount = 0;

  Object.entries(behaviorCounts).forEach(([behavior, count]) => {
    if (negativeBehaviors.some((nb) => behavior.includes(nb))) {
      negativeCount += count;
    } else if (positiveBehaviors.some((pb) => behavior.includes(pb))) {
      positiveCount += count;
    }
  });

  const total = sessions.length;
  const negativePercentage = total > 0 ? (negativeCount / total) * 100 : 0;
  const positivePercentage = total > 0 ? (positiveCount / total) * 100 : 0;

  return {
    behaviorCounts,
    negativePercentage: Math.round(negativePercentage),
    positivePercentage: Math.round(positivePercentage),
    totalSessions: total,
  };
};

/**
 * Calculate progress over time
 */
const calculateProgress = (weeklyStats) => {
  if (weeklyStats.length < 2) {
    return { message: 'Need more data to see progress' };
  }

  const sorted = weeklyStats.sort((a, b) => {
    const aDate = a.date || '';
    const bDate = b.date || '';
    return aDate.localeCompare(bDate);
  });

  const firstWeek = sorted.slice(0, 7);
  const lastWeek = sorted.slice(-7);

  const firstAccuracy = calculateAvgAccuracy(firstWeek);
  const lastAccuracy = calculateAvgAccuracy(lastWeek);

  const accuracyChange = lastAccuracy - firstAccuracy;

  return {
    accuracyChange: Math.round(accuracyChange * 100) / 100,
    firstWeekAccuracy: Math.round(firstAccuracy * 100) / 100,
    lastWeekAccuracy: Math.round(lastAccuracy * 100) / 100,
    isImproving: accuracyChange > 0,
  };
};

const calculateAvgAccuracy = (days) => {
  if (days.length === 0) return 0;

  let totalAccuracy = 0;
  let count = 0;

  days.forEach((day) => {
    const correct = day.totalCorrect || 0;
    const questions = day.totalQuestions || 0;
    if (questions > 0) {
      totalAccuracy += (correct / questions) * 100;
      count += 1;
    }
  });

  return count > 0 ? totalAccuracy / count : 0;
};

/**
 * Generate recommendations based on insights
 */
const generateRecommendations = (insights) => {
  const recommendations = [];

  // Engagement recommendations
  if (insights.engagementTrend.trend === 'declining') {
    recommendations.push({
      type: 'engagement',
      priority: 'high',
      title: 'Engagement Declining',
      message: 'Your child\'s engagement has decreased. Try shorter game sessions or different difficulty levels.',
    });
  }

  // Confusion recommendations
  if (insights.confusionPatterns.mostConfusedLetters.length > 0) {
    const topLetter = insights.confusionPatterns.mostConfusedLetters[0];
    if (topLetter.count >= 3) {
      recommendations.push({
        type: 'learning',
        priority: 'medium',
        title: 'Focus on Specific Letters',
        message: `Your child is struggling with the letter "${topLetter.letter}". Consider extra practice for this letter.`,
      });
    }
  }

  // Mood recommendations
  if (insights.overallMood.dominant === 'sad' || insights.overallMood.dominant === 'angry') {
    recommendations.push({
      type: 'wellbeing',
      priority: 'high',
      title: 'Monitor Emotional State',
      message: 'Your child shows signs of frustration. Consider taking breaks or adjusting game difficulty.',
    });
  }

  // Positive reinforcement
  if (insights.progress.isImproving) {
    recommendations.push({
      type: 'positive',
      priority: 'low',
      title: 'Great Progress!',
      message: `Accuracy improved by ${Math.abs(insights.progress.accuracyChange).toFixed(1)}%! Keep up the great work!`,
    });
  }

  return recommendations;
};

/**
 * Generate warnings for potential issues
 */
const generateWarnings = (insights) => {
  const warnings = [];

  // High negative behavior percentage
  if (insights.behaviorPatterns.negativePercentage > 40) {
    warnings.push({
      type: 'emotional',
      severity: 'medium',
      title: 'High Frustration Levels',
      message: 'Your child shows frustration in ${insights.behaviorPatterns.negativePercentage}% of sessions. Consider adjusting difficulty or taking more breaks.',
    });
  }

  // Declining engagement
  if (insights.engagementTrend.trend === 'declining' && insights.engagementTrend.recentAvg < 1.5) {
    warnings.push({
      type: 'engagement',
      severity: 'high',
      title: 'Low Engagement',
      message: 'Engagement levels are low. The child may be losing interest. Try different activities or shorter sessions.',
    });
  }

  // High confusion rate
  if (insights.confusionPatterns.averagePerSession > 3) {
    warnings.push({
      type: 'learning',
      severity: 'medium',
      title: 'High Confusion Rate',
      message: `Average of ${insights.confusionPatterns.averagePerSession.toFixed(1)} confused letters per session. Consider reviewing basics or slowing down.`,
    });
  }

  return warnings;
};

/**
 * Analyze session breakdown (games vs stories)
 */
const analyzeSessionBreakdown = (gameSessions, storySessions) => {
  const totalSessions = gameSessions.length + storySessions.length;
  
  if (totalSessions === 0) {
    return {
      gameCount: 0,
      storyCount: 0,
      gamePercentage: 0,
      storyPercentage: 0,
      gameAvgEngagement: 'LOW',
      storyAvgEngagement: 'LOW',
    };
  }

  // Calculate average engagement for games
  const gameEngagements = gameSessions.map(s => s.engagementLevel || 'LOW');
  const gameEngagementCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  gameEngagements.forEach(e => {
    if (e === 'HIGH' || e === 'MEDIUM' || e === 'LOW') {
      gameEngagementCounts[e] = (gameEngagementCounts[e] || 0) + 1;
    }
  });
  const gameAvgEngagement = gameEngagementCounts.HIGH > gameEngagementCounts.MEDIUM && gameEngagementCounts.HIGH > gameEngagementCounts.LOW ? 'HIGH' :
    (gameEngagementCounts.MEDIUM > gameEngagementCounts.LOW ? 'MEDIUM' : 'LOW');

  // Calculate average engagement for stories
  const storyEngagements = storySessions.map(s => s.engagementLevel || 'LOW');
  const storyEngagementCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  storyEngagements.forEach(e => {
    if (e === 'HIGH' || e === 'MEDIUM' || e === 'LOW') {
      storyEngagementCounts[e] = (storyEngagementCounts[e] || 0) + 1;
    }
  });
  const storyAvgEngagement = storyEngagementCounts.HIGH > storyEngagementCounts.MEDIUM && storyEngagementCounts.HIGH > storyEngagementCounts.LOW ? 'HIGH' :
    (storyEngagementCounts.MEDIUM > storyEngagementCounts.LOW ? 'MEDIUM' : 'LOW');

  return {
    gameCount: gameSessions.length,
    storyCount: storySessions.length,
    gamePercentage: Math.round((gameSessions.length / totalSessions) * 100),
    storyPercentage: Math.round((storySessions.length / totalSessions) * 100),
    gameAvgEngagement,
    storyAvgEngagement,
  };
};

/**
 * Save emotion insights to Firebase
 */
const saveEmotionInsights = async (childId, parentId, insights) => {
  try {
    if (!db) return;

    const insightsRef = doc(db, 'emotionInsights', childId);
    await setDoc(insightsRef, {
      childId,
      parentId,
      insights,
      lastUpdated: serverTimestamp(),
    }, { merge: true });

    console.log('✅ Emotion insights saved');
  } catch (error) {
    console.error('❌ Error saving emotion insights:', error);
  }
};

/**
 * Get saved emotion insights
 */
export const getEmotionInsights = async (childId) => {
  try {
    if (!db) return null;

    const insightsRef = doc(db, 'emotionInsights', childId);
    const insightsSnap = await getDoc(insightsRef);

    if (insightsSnap.exists()) {
      return insightsSnap.data().insights;
    }
    return null;
  } catch (error) {
    console.error('❌ Error getting emotion insights:', error);
    return null;
  }
};
