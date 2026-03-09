import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

/**
 * Save game emotion session data
 * @param {Object} emotionData - Emotion session data
 * @param {string} emotionData.gameSessionId - Game session ID
 * @param {string} emotionData.childId - Child UID
 * @param {string} emotionData.parentId - Parent UID
 * @param {string} emotionData.behavior - Final behavior prediction
 * @param {number} emotionData.behaviorConfidence - Behavior confidence
 * @param {string} emotionData.finalEmotion - Dominant emotion
 * @param {string} emotionData.engagementLevel - Engagement level (LOW/MEDIUM/HIGH)
 * @param {Object} emotionData.emotionDistribution - Emotion distribution
 * @param {Object} emotionData.handSummary - Hand movement summary
 * @param {number} emotionData.duration - Session duration in ms
 * @param {Array} emotionData.confusionLetters - Letters child got confused with
 * @param {number} emotionData.totalQuestions - Total questions in game
 * @param {number} emotionData.correctAnswers - Correct answers
 * @returns {Promise<string>} Emotion session ID
 */
export const saveGameEmotionSession = async (emotionData) => {
  try {
    if (!db) {
      console.warn('⚠️ Firestore not initialized - skipping saveGameEmotionSession');
      return null;
    }

    const {
      gameSessionId,
      childId,
      parentId,
      behavior,
      behaviorConfidence,
      finalEmotion,
      engagementLevel,
      emotionDistribution,
      handSummary,
      duration,
      confusionLetters = [],
      totalQuestions,
      correctAnswers,
    } = emotionData;

    // Validate required fields
    if (!gameSessionId || !childId || !parentId) {
      throw new Error('Missing required emotion session data fields');
    }

    // Generate emotion session ID
    const emotionSessionId = `emotion_${gameSessionId}`;

    const emotionDoc = {
      emotionSessionId,
      gameSessionId,
      childId,
      parentId,
      behavior: behavior || 'Cannot detect',
      behaviorConfidence: behaviorConfidence || 0,
      finalEmotion: finalEmotion || 'neutral',
      engagementLevel: engagementLevel || 'LOW',
      emotionDistribution: emotionDistribution || {},
      handSummary: handSummary || {},
      duration: duration || 0,
      confusionLetters: confusionLetters || [],
      totalQuestions: totalQuestions || 0,
      correctAnswers: correctAnswers || 0,
      accuracy: totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0,
      createdAt: serverTimestamp(),
    };

    const emotionRef = doc(db, 'gameEmotionSessions', emotionSessionId);
    await setDoc(emotionRef, emotionDoc);

    console.log('✅ Game emotion session saved:', emotionSessionId);

    // Also update daily stats
    await updateDailyEmotionStats(childId, parentId, emotionDoc);

    return emotionSessionId;
  } catch (error) {
    console.error('❌ Error saving game emotion session:', error);
    throw error;
  }
};

/**
 * Update daily emotion statistics
 * @param {string} childId - Child UID
 * @param {string} parentId - Parent UID
 * @param {Object} emotionData - Emotion data from session
 */
export const updateDailyEmotionStats = async (childId, parentId, emotionData) => {
  try {
    if (!db) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateKey = today.toISOString().split('T')[0]; // YYYY-MM-DD

    const dailyDocId = `${childId}_${dateKey}`;
    const dailyRef = doc(db, 'emotionDailyStats', dailyDocId);

    const dailySnap = await getDoc(dailyRef);

    const behavior = emotionData.behavior || 'Cannot detect';
    const finalEmotion = emotionData.finalEmotion || 'neutral';
    const engagementLevel = emotionData.engagementLevel || 'LOW';

    if (dailySnap.exists()) {
      // Update existing daily stats
      const current = dailySnap.data();
      const sessions = (current.sessions || 0) + 1;
      const totalConfusion = (current.totalConfusion || 0) + (emotionData.confusionLetters?.length || 0);
      const totalDuration = (current.totalDuration || 0) + (emotionData.duration || 0);
      const totalCorrect = (current.totalCorrect || 0) + (emotionData.correctAnswers || 0);
      const totalQuestions = (current.totalQuestions || 0) + (emotionData.totalQuestions || 0);

      // Update behavior counts
      const behaviorCounts = current.behaviorCounts || {};
      behaviorCounts[behavior] = (behaviorCounts[behavior] || 0) + 1;

      // Update emotion counts
      const emotionCounts = current.emotionCounts || {};
      emotionCounts[finalEmotion] = (emotionCounts[finalEmotion] || 0) + 1;

      // Update engagement counts
      const engagementCounts = current.engagementCounts || {};
      engagementCounts[engagementLevel] = (engagementCounts[engagementLevel] || 0) + 1;

      // Merge confusion letters
      const confusionLetters = [...(current.confusionLetters || []), ...(emotionData.confusionLetters || [])];

      await setDoc(dailyRef, {
        ...current,
        sessions,
        totalConfusion,
        totalDuration,
        totalCorrect,
        totalQuestions,
        behaviorCounts,
        emotionCounts,
        engagementCounts,
        confusionLetters,
        lastUpdated: serverTimestamp(),
      }, { merge: true });
    } else {
      // Create new daily stats
      const behaviorCounts = {};
      behaviorCounts[behavior] = 1;

      const emotionCounts = {};
      emotionCounts[finalEmotion] = 1;

      const engagementCounts = {};
      engagementCounts[engagementLevel] = 1;

      await setDoc(dailyRef, {
        childId,
        parentId,
        date: dateKey,
        sessions: 1,
        totalConfusion: emotionData.confusionLetters?.length || 0,
        totalDuration: emotionData.duration || 0,
        totalCorrect: emotionData.correctAnswers || 0,
        totalQuestions: emotionData.totalQuestions || 0,
        behaviorCounts,
        emotionCounts,
        engagementCounts,
        confusionLetters: emotionData.confusionLetters || [],
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
      });
    }

    console.log('✅ Daily emotion stats updated for:', dateKey);
  } catch (error) {
    console.error('❌ Error updating daily emotion stats:', error);
  }
};

/**
 * Get daily emotion stats for a child
 * @param {string} childId - Child UID
 * @param {string} date - Date string (YYYY-MM-DD) or null for today
 * @returns {Promise<Object>} Daily stats
 */
export const getDailyEmotionStats = async (childId, date = null) => {
  try {
    if (!db) return null;

    const targetDate = date || new Date().toISOString().split('T')[0];
    const dailyDocId = `${childId}_${targetDate}`;
    const dailyRef = doc(db, 'emotionDailyStats', dailyDocId);
    const dailySnap = await getDoc(dailyRef);

    if (dailySnap.exists()) {
      return { id: dailySnap.id, ...dailySnap.data() };
    }
    return null;
  } catch (error) {
    console.error('❌ Error getting daily emotion stats:', error);
    return null;
  }
};

/**
 * Get weekly emotion stats for a child
 * @param {string} childId - Child UID
 * @param {number} weeksBack - Number of weeks back (default 1)
 * @returns {Promise<Array>} Array of daily stats
 */
export const getWeeklyEmotionStats = async (childId, weeksBack = 1) => {
  try {
    if (!db) return [];

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (weeksBack * 7));

    const stats = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split('T')[0];
      const dailyStats = await getDailyEmotionStats(childId, dateKey);
      if (dailyStats) {
        stats.push(dailyStats);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return stats;
  } catch (error) {
    console.error('❌ Error getting weekly emotion stats:', error);
    return [];
  }
};

/**
 * Get emotion sessions for a parent's children
 * @param {string} parentId - Parent UID
 * @param {number} limitCount - Maximum number of sessions
 * @returns {Promise<Array>} Array of emotion sessions
 */
export const getParentEmotionSessions = async (parentId, limitCount = 50) => {
  try {
    if (!db) return [];

    const sessionsQuery = query(
      collection(db, 'gameEmotionSessions'),
      where('parentId', '==', parentId),
      limit(limitCount * 2)
    );

    const sessionsSnapshot = await getDocs(sessionsQuery);
    const sessions = [];

    sessionsSnapshot.forEach((doc) => {
      sessions.push({ id: doc.id, ...doc.data() });
    });

    // Sort by createdAt descending
    sessions.sort((a, b) => {
      const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt || 0);
      const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt || 0);
      return bTime - aTime;
    });

    return sessions.slice(0, limitCount);
  } catch (error) {
    console.error('❌ Error getting parent emotion sessions:', error);
    return [];
  }
};

/**
 * Get emotion sessions for a specific child
 * @param {string} childId - Child UID
 * @param {number} limitCount - Maximum number of sessions
 * @returns {Promise<Array>} Array of emotion sessions
 */
export const getChildEmotionSessions = async (childId, limitCount = 50) => {
  try {
    if (!db) return [];

    const sessionsQuery = query(
      collection(db, 'gameEmotionSessions'),
      where('childId', '==', childId),
      limit(limitCount * 2)
    );

    const sessionsSnapshot = await getDocs(sessionsQuery);
    const sessions = [];

    sessionsSnapshot.forEach((doc) => {
      sessions.push({ id: doc.id, ...doc.data() });
    });

    // Sort by createdAt descending
    sessions.sort((a, b) => {
      const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt || 0);
      const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt || 0);
      return bTime - aTime;
    });

    return sessions.slice(0, limitCount);
  } catch (error) {
    console.error('❌ Error getting child emotion sessions:', error);
    return [];
  }
};

/**
 * Save story reading emotion session data
 * @param {Object} emotionData - Emotion session data from story reading
 * @param {string} emotionData.sessionId - Story reading session ID
 * @param {string} emotionData.storyId - Story ID
 * @param {string} emotionData.storyTitle - Story title
 * @param {string} emotionData.childId - Child UID
 * @param {string} emotionData.parentId - Parent UID
 * @param {string} emotionData.behavior - Final behavior prediction
 * @param {number} emotionData.behaviorConfidence - Behavior confidence
 * @param {string} emotionData.finalEmotion - Dominant emotion
 * @param {string} emotionData.engagementLevel - Engagement level (LOW/MEDIUM/HIGH)
 * @param {Object} emotionData.emotionDistribution - Emotion distribution
 * @param {Object} emotionData.handSummary - Hand movement summary
 * @param {number} emotionData.duration - Session duration in seconds
 * @returns {Promise<string>} Emotion session ID
 */
export const saveStoryEmotionSession = async (emotionData) => {
  try {
    if (!db) {
      console.warn('⚠️ Firestore not initialized - skipping saveStoryEmotionSession');
      return null;
    }

    const {
      sessionId,
      storyId,
      storyTitle,
      childId,
      parentId,
      behavior,
      behaviorConfidence,
      finalEmotion,
      engagementLevel,
      emotionDistribution,
      handSummary,
      duration,
    } = emotionData;

    // Validate required fields
    if (!sessionId || !childId || !parentId) {
      throw new Error('Missing required story emotion session data fields');
    }

    // Generate emotion session ID
    const emotionSessionId = `story_emotion_${sessionId}`;

    const emotionDoc = {
      emotionSessionId,
      sessionId,
      storyId: storyId || null,
      storyTitle: storyTitle || 'Unknown Story',
      sessionType: 'story_reading', // Distinguish from game sessions
      childId,
      parentId,
      behavior: behavior || 'Cannot detect',
      behaviorConfidence: behaviorConfidence || 0,
      finalEmotion: finalEmotion || 'neutral',
      engagementLevel: engagementLevel || 'LOW',
      emotionDistribution: emotionDistribution || {},
      handSummary: handSummary || {},
      duration: duration || 0,
      createdAt: serverTimestamp(),
    };

    const emotionRef = doc(db, 'storyEmotionSessions', emotionSessionId);
    await setDoc(emotionRef, emotionDoc);

    console.log('✅ Story emotion session saved:', emotionSessionId);

    // Also update daily stats (reuse same function, it handles both types)
    await updateDailyEmotionStats(childId, parentId, {
      ...emotionDoc,
      confusionLetters: [], // Stories don't have confusion letters
      totalQuestions: 0,
      correctAnswers: 0,
    });

    return emotionSessionId;
  } catch (error) {
    console.error('❌ Error saving story emotion session:', error);
    throw error;
  }
};

/**
 * Get story emotion sessions for a specific child
 * @param {string} childId - Child UID
 * @param {number} limitCount - Maximum number of sessions
 * @returns {Promise<Array>} Array of story emotion sessions
 */
export const getChildStoryEmotionSessions = async (childId, limitCount = 50) => {
  try {
    if (!db) return [];

    // Query without orderBy to avoid requiring composite index
    // We'll sort in memory instead
    const sessionsQuery = query(
      collection(db, 'storyEmotionSessions'),
      where('childId', '==', childId),
      limit(limitCount * 2) // Get more to account for sorting
    );

    const sessionsSnapshot = await getDocs(sessionsQuery);
    const sessions = [];

    sessionsSnapshot.forEach((doc) => {
      sessions.push({ id: doc.id, ...doc.data() });
    });

    // Sort by createdAt descending in memory
    sessions.sort((a, b) => {
      const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt || 0);
      const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt || 0);
      return bTime - aTime;
    });

    // Return only the requested limit after sorting
    return sessions.slice(0, limitCount);
  } catch (error) {
    console.error('❌ Error getting child story emotion sessions:', error);
    return [];
  }
};

/**
 * Get all emotion sessions (both game and story) for a parent's children
 * @param {string} parentId - Parent UID
 * @param {number} limitCount - Maximum number of sessions per type
 * @returns {Promise<Object>} Object with gameSessions and storySessions arrays
 */
export const getAllParentEmotionSessions = async (parentId, limitCount = 50) => {
  try {
    if (!db) return { gameSessions: [], storySessions: [] };

    // Get game sessions
    const gameSessionsQuery = query(
      collection(db, 'gameEmotionSessions'),
      where('parentId', '==', parentId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    // Get story sessions
    const storySessionsQuery = query(
      collection(db, 'storyEmotionSessions'),
      where('parentId', '==', parentId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const [gameSnapshot, storySnapshot] = await Promise.all([
      getDocs(gameSessionsQuery),
      getDocs(storySessionsQuery),
    ]);

    const gameSessions = [];
    gameSnapshot.forEach((doc) => {
      gameSessions.push({ id: doc.id, ...doc.data() });
    });

    const storySessions = [];
    storySnapshot.forEach((doc) => {
      storySessions.push({ id: doc.id, ...doc.data() });
    });

    return { gameSessions, storySessions };
  } catch (error) {
    console.error('❌ Error getting all parent emotion sessions:', error);
    return { gameSessions: [], storySessions: [] };
  }
};
