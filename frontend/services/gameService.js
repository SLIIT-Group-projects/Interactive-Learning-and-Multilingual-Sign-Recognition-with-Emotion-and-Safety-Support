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
} from 'firebase/firestore';
import { db } from './firebaseConfig';

/**
 * Save a game session with parent-child linking
 * @param {Object} sessionData - Session data
 * @param {string} sessionData.childId - Child UID
 * @param {string} sessionData.parentId - Parent UID
 * @param {string} sessionData.gameMode - 'practice' | 'quiz' | 'challenge'
 * @param {number} sessionData.totalQuestions - Total questions
 * @param {number} sessionData.correctAnswers - Correct answers
 * @param {number} sessionData.timeTaken - Time taken in seconds
 * @param {string} sessionData.difficultyLevel - Difficulty level
 * @returns {Promise<string>} Session ID
 */
export const saveGameSession = async (sessionData) => {
  try {
    if (!db) {
      console.warn('⚠️ Firestore not initialized - skipping saveGameSession');
      return null;
    }

    const {
      childId,
      parentId,
      gameMode,
      totalQuestions,
      correctAnswers,
      timeTaken,
      difficultyLevel = 'medium',
    } = sessionData;

    // Validate required fields
    if (!childId || !parentId || !gameMode || !totalQuestions || correctAnswers === undefined) {
      throw new Error('Missing required session data fields');
    }

    // Calculate accuracy
    const accuracy = totalQuestions > 0 
      ? (correctAnswers / totalQuestions) * 100 
      : 0;

    // Generate session ID
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const sessionDoc = {
      sessionId: sessionId,
      childId: childId,
      parentId: parentId,
      gameMode: gameMode,
      totalQuestions: totalQuestions,
      correctAnswers: correctAnswers,
      accuracy: Math.round(accuracy * 100) / 100,
      timeTaken: timeTaken || 0,
      difficultyLevel: difficultyLevel,
      createdAt: serverTimestamp(),
    };

    const sessionRef = doc(db, 'gameSessions', sessionId);
    await setDoc(sessionRef, sessionDoc);

    console.log('✅ Game session saved:', sessionId, {
      childId,
      parentId,
      accuracy: sessionDoc.accuracy,
    });

    return sessionId;
  } catch (error) {
    console.error('❌ Error saving game session:', error);
    throw error;
  }
};

/**
 * Update letter performance for a child
 * @param {string} childId - Child UID
 * @param {string} parentId - Parent UID
 * @param {string} letter - Letter (A-Z)
 * @param {boolean} isCorrect - Whether answer was correct
 * @param {number} responseTime - Response time in milliseconds
 * @returns {Promise<void>}
 */
export const updateLetterPerformance = async (
  childId,
  parentId,
  letter,
  isCorrect,
  responseTime = 0
) => {
  try {
    if (!db) {
      console.warn('⚠️ Firestore not initialized - skipping updateLetterPerformance');
      return;
    }

    if (!childId || !parentId || !letter) {
      throw new Error('childId, parentId, and letter are required');
    }

    const docId = `${childId}_${letter.toUpperCase()}`;
    const letterRef = doc(db, 'letterPerformance', docId);

    // Check if document exists
    const { getDoc, updateDoc, increment } = await import('firebase/firestore');
    const letterSnap = await getDoc(letterRef);

    if (letterSnap.exists()) {
      // Update existing document
      const currentData = letterSnap.data();
      const currentAttempts = currentData.attempts || 0;
      const currentAvgTime = currentData.averageResponseTime || 0;

      // Calculate new average response time
      const totalTime = currentAvgTime * currentAttempts + responseTime;
      const newAttempts = currentAttempts + 1;
      const newAvgTime = newAttempts > 0 ? totalTime / newAttempts : 0;

      await updateDoc(letterRef, {
        attempts: increment(1),
        correct: isCorrect ? increment(1) : currentData.correct,
        incorrect: !isCorrect ? increment(1) : currentData.incorrect,
        averageResponseTime: Math.round(newAvgTime * 100) / 100,
        lastPracticed: serverTimestamp(),
      });

      console.log(`✅ Updated letter performance: ${letter} for child ${childId}`);
    } else {
      // Create new document
      const letterData = {
        childId: childId,
        parentId: parentId,
        letter: letter.toUpperCase(),
        attempts: 1,
        correct: isCorrect ? 1 : 0,
        incorrect: isCorrect ? 0 : 1,
        averageResponseTime: responseTime,
        lastPracticed: serverTimestamp(),
      };

      await setDoc(letterRef, letterData);
      console.log(`✅ Created letter performance: ${letter} for child ${childId}`);
    }
  } catch (error) {
    console.error('❌ Error updating letter performance:', error);
    throw error;
  }
};

/**
 * Get all game sessions for a parent's children
 * @param {string} parentId - Parent UID
 * @param {number} limitCount - Maximum number of sessions
 * @returns {Promise<Array>} Array of game sessions
 */
export const getParentGameSessions = async (parentId, limitCount = 50) => {
  try {
    if (!db) {
      console.warn('⚠️ Firestore not initialized - returning empty array');
      return [];
    }

    if (!parentId) {
      console.warn('⚠️ No parentId provided - returning empty array');
      return [];
    }

    // Query without orderBy first to avoid index requirement, then sort in memory
    const sessionsQuery = query(
      collection(db, 'gameSessions'),
      where('parentId', '==', parentId),
      limit(limitCount * 2) // Get more to sort and limit
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

    // Return limited results
    return sessions.slice(0, limitCount);
  } catch (error) {
    console.error('❌ Error getting parent game sessions:', error);
    throw error;
  }
};

/**
 * Get game sessions for a specific child
 * @param {string} childId - Child UID
 * @param {number} limitCount - Maximum number of sessions
 * @returns {Promise<Array>} Array of game sessions
 */
export const getChildGameSessions = async (childId, limitCount = 50) => {
  try {
    if (!db) {
      console.warn('⚠️ Firestore not initialized - returning empty array');
      return [];
    }

    if (!childId) {
      console.warn('⚠️ No childId provided - returning empty array');
      return [];
    }

    // Query without orderBy first to avoid index requirement, then sort in memory
    const sessionsQuery = query(
      collection(db, 'gameSessions'),
      where('childId', '==', childId),
      limit(limitCount * 2) // Get more to sort and limit
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

    // Return limited results
    return sessions.slice(0, limitCount);
  } catch (error) {
    console.error('❌ Error getting child game sessions:', error);
    throw error;
  }
};

/**
 * Get analytics for a child
 * @param {string} childId - Child UID
 * @param {string} parentId - Parent UID
 * @returns {Promise<Object>} Analytics object
 */
export const getChildAnalytics = async (childId, parentId) => {
  try {
    if (!db) {
      console.warn('⚠️ Firestore not initialized - returning mock analytics');
      return getMockAnalytics();
    }

    // Get all game sessions for this child
    const sessions = await getChildGameSessions(childId, 100);

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
        incorrect: data.incorrect || 0,
        accuracy: data.attempts > 0 
          ? (data.correct / data.attempts) * 100 
          : 0,
        averageResponseTime: data.averageResponseTime || 0,
        lastPracticed: data.lastPracticed,
      });
    });

    // Calculate analytics
    const totalSessions = sessions.length;
    const totalAccuracy = sessions.reduce((sum, session) => sum + (session.accuracy || 0), 0);
    const averageAccuracy = totalSessions > 0 
      ? Math.round((totalAccuracy / totalSessions) * 100) / 100 
      : 0;
    const totalPracticeTime = sessions.reduce((sum, session) => sum + (session.timeTaken || 0), 0);

    // Get weak and strong letters
    const weakLetters = [...letterPerformance]
      .filter((lp) => lp.attempts > 0)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5)
      .map((lp) => ({
        letter: lp.letter,
        accuracy: Math.round(lp.accuracy * 100) / 100,
        attempts: lp.attempts,
      }));

    const strongLetters = [...letterPerformance]
      .filter((lp) => lp.attempts > 0)
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 5)
      .map((lp) => ({
        letter: lp.letter,
        accuracy: Math.round(lp.accuracy * 100) / 100,
        attempts: lp.attempts,
      }));

    return {
      totalSessions,
      averageAccuracy: Math.round(averageAccuracy * 100) / 100,
      totalPracticeTime,
      mostWeakLetters: weakLetters,
      mostStrongLetters: strongLetters,
      letterPerformance: letterPerformance.sort((a, b) => a.letter.localeCompare(b.letter)),
    };
  } catch (error) {
    console.error('❌ Error getting child analytics:', error);
    throw error;
  }
};

const getMockAnalytics = () => {
  return {
    totalSessions: 0,
    averageAccuracy: 0,
    totalPracticeTime: 0,
    mostWeakLetters: [],
    mostStrongLetters: [],
    letterPerformance: [],
  };
};

