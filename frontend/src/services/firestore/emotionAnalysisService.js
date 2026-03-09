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

/**
 * Get current week data (Monday to Sunday) with all 7 days
 * @param {string} childId - Child UID
 * @returns {Promise<Array>} Array of daily stats for current week
 */
export const getCurrentWeekData = async (childId) => {
  try {
    if (!db) return [];

    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Calculate Monday of current week
    const monday = new Date(today);
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    monday.setDate(today.getDate() + daysToMonday);
    monday.setHours(0, 0, 0, 0);

    const weekData = [];
    
    // Get data for all 7 days of the week
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(monday);
      currentDate.setDate(monday.getDate() + i);
      const dateKey = currentDate.toISOString().split('T')[0];
      
      const dailyStats = await getDailyEmotionStats(childId, dateKey);
      
      weekData.push({
        date: dateKey,
        dayName: currentDate.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNumber: currentDate.getDate(),
        isToday: dateKey === today.toISOString().split('T')[0],
        data: dailyStats || null,
      });
    }

    return weekData;
  } catch (error) {
    console.error('❌ Error getting current week data:', error);
    return [];
  }
};

/**
 * Generate predictive insights based on patterns
 * @param {string} childId - Child UID
 * @param {Array} weekData - Current week data
 * @param {Object} insights - Existing insights
 * @returns {Promise<Object>} Predictive insights
 */
export const generatePredictiveInsights = async (childId, weekData, insights) => {
  try {
    if (!weekData || weekData.length === 0) {
      return { hasPredictions: false };
    }

    const predictions = {
      hasPredictions: true,
      learningPatterns: [],
      attentionPatterns: [],
      emotionalPatterns: [],
      recommendations: [],
      riskLevel: 'low', // low, medium, high
    };

    // Calculate weekly averages
    const daysWithData = weekData.filter(d => d.data !== null);
    if (daysWithData.length === 0) {
      return { hasPredictions: false, message: 'Not enough data for predictions' };
    }

    // Calculate metrics
    let totalSessions = 0;
    let totalConfusion = 0;
    let totalCorrect = 0;
    let totalQuestions = 0;
    let highEngagementDays = 0;
    let lowEngagementDays = 0;
    let negativeEmotionDays = 0;

    daysWithData.forEach(day => {
      const data = day.data;
      totalSessions += data.sessions || 0;
      totalConfusion += data.totalConfusion || 0;
      totalCorrect += data.totalCorrect || 0;
      totalQuestions += data.totalQuestions || 0;

      // Count engagement levels
      const engagementCounts = data.engagementCounts || {};
      const high = engagementCounts.HIGH || 0;
      const medium = engagementCounts.MEDIUM || 0;
      const low = engagementCounts.LOW || 0;
      const total = high + medium + low;
      
      if (total > 0) {
        const avgEngagement = (high * 3 + medium * 2 + low * 1) / total;
        if (avgEngagement >= 2.5) highEngagementDays++;
        if (avgEngagement <= 1.5) lowEngagementDays++;
      }

      // Count negative emotions
      const emotionCounts = data.emotionCounts || {};
      const negativeEmotions = ['sad', 'angry', 'fear', 'disgust'];
      const hasNegative = negativeEmotions.some(emotion => 
        (emotionCounts[emotion] || 0) > 0
      );
      if (hasNegative) negativeEmotionDays++;
    });

    const avgSessionsPerDay = totalSessions / daysWithData.length;
    const avgConfusionPerDay = totalConfusion / daysWithData.length;
    const avgAccuracy = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;
    const lowEngagementRatio = lowEngagementDays / daysWithData.length;
    const negativeEmotionRatio = negativeEmotionDays / daysWithData.length;

    // Learning Pattern Predictions
    if (avgConfusionPerDay > 5 && avgAccuracy < 50) {
      predictions.learningPatterns.push({
        type: 'learning_difficulty',
        severity: avgConfusionPerDay > 8 ? 'high' : 'medium',
        title: 'Potential Learning Difficulty',
        message: `High confusion rate (${avgConfusionPerDay.toFixed(1)} letters/day) with low accuracy (${avgAccuracy.toFixed(1)}%) suggests the child may need additional support. Consider breaking lessons into smaller chunks or reviewing fundamentals.`,
        confidence: Math.min(85, 50 + (avgConfusionPerDay * 5)),
      });
    }

    if (avgConfusionPerDay > 3 && insights?.confusionPatterns?.mostConfusedLetters?.length > 0) {
      const topLetter = insights.confusionPatterns.mostConfusedLetters[0];
      predictions.learningPatterns.push({
        type: 'specific_letter_struggle',
        severity: 'medium',
        title: 'Letter Recognition Challenge',
        message: `Consistent struggle with letter "${topLetter.letter}" (${topLetter.count} times). This may indicate a specific learning challenge. Try multisensory approaches or visual aids.`,
        confidence: 75,
      });
    }

    // Attention Pattern Predictions
    if (lowEngagementRatio > 0.5 && avgSessionsPerDay < 2) {
      predictions.attentionPatterns.push({
        type: 'attention_deficit',
        severity: lowEngagementRatio > 0.7 ? 'high' : 'medium',
        title: 'Attention & Focus Concern',
        message: `Low engagement in ${(lowEngagementRatio * 100).toFixed(0)}% of sessions with few daily activities suggests attention challenges. Consider shorter sessions, frequent breaks, or activities that match the child's interests.`,
        confidence: Math.min(80, 40 + (lowEngagementRatio * 60)),
      });
    }

    if (avgSessionsPerDay < 1) {
      predictions.attentionPatterns.push({
        type: 'low_activity',
        severity: 'medium',
        title: 'Low Activity Level',
        message: `Average of ${avgSessionsPerDay.toFixed(1)} sessions per day. Consistent low activity may indicate lack of interest or motivation. Try varying activities or setting achievable goals.`,
        confidence: 70,
      });
    }

    // Emotional Pattern Predictions
    if (negativeEmotionRatio > 0.4) {
      predictions.emotionalPatterns.push({
        type: 'emotional_regulation',
        severity: negativeEmotionRatio > 0.6 ? 'high' : 'medium',
        title: 'Emotional Regulation Support Needed',
        message: `Negative emotions detected in ${(negativeEmotionRatio * 100).toFixed(0)}% of days. The child may benefit from emotional regulation strategies, stress management techniques, or a more supportive learning environment.`,
        confidence: Math.min(85, 50 + (negativeEmotionRatio * 50)),
      });
    }

    if (insights?.behaviorPatterns?.negativePercentage > 50) {
      predictions.emotionalPatterns.push({
        type: 'frustration_pattern',
        severity: 'high',
        title: 'High Frustration Pattern',
        message: `${insights.behaviorPatterns.negativePercentage}% of sessions show frustration. This pattern suggests the child may be overwhelmed. Consider reducing difficulty, increasing positive reinforcement, or consulting with a learning specialist.`,
        confidence: 80,
      });
    }

    // Calculate overall risk level
    const riskFactors = [
      avgConfusionPerDay > 5 && avgAccuracy < 50,
      lowEngagementRatio > 0.6,
      negativeEmotionRatio > 0.5,
      insights?.behaviorPatterns?.negativePercentage > 50,
    ].filter(Boolean).length;

    if (riskFactors >= 3) {
      predictions.riskLevel = 'high';
      predictions.recommendations.push({
        priority: 'high',
        title: 'Consider Professional Consultation',
        message: 'Multiple indicators suggest the child may benefit from professional assessment or specialized learning support. Early intervention can be very effective.',
      });
    } else if (riskFactors >= 2) {
      predictions.riskLevel = 'medium';
    }

    // Add positive patterns
    if (highEngagementDays > lowEngagementDays && avgAccuracy > 60) {
      predictions.recommendations.push({
        priority: 'low',
        title: 'Positive Learning Pattern',
        message: `Good engagement and accuracy (${avgAccuracy.toFixed(1)}%)! The child is responding well to current activities. Consider gradually increasing challenge level.`,
      });
    }

    return predictions;
  } catch (error) {
    console.error('❌ Error generating predictive insights:', error);
    return { hasPredictions: false };
  }
};
