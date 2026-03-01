import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  updateDoc,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

// ============================================
// MOCK DATA CREATION FUNCTIONS
// ============================================

/**
 * Creates a mock parent if it doesn't exist
 * @returns {Promise<string>} parentId
 */
export const createMockParent = async () => {
  try {
    if (!db) {
      console.warn('⚠️ Firestore not initialized - skipping createMockParent');
      return 'parent_001';
    }

    const parentId = 'parent_001';
    const parentRef = doc(db, 'parents', parentId);

    // Check if parent already exists
    const parentSnap = await getDoc(parentRef);

    if (!parentSnap.exists()) {
      const parentData = {
        parentId: parentId,
        name: 'Mock Parent',
        email: 'parent@test.com',
        linkedStudents: ['student_001'],
        createdAt: serverTimestamp(),
      };

      await setDoc(parentRef, parentData);
      console.log('✅ Mock parent created:', parentId);
    } else {
      console.log('ℹ️ Mock parent already exists:', parentId);
    }

    return parentId;
  } catch (error) {
    console.error('❌ Error creating mock parent:', error);
    throw error;
  }
};

/**
 * Creates a mock student if it doesn't exist
 * @returns {Promise<string>} studentId
 */
export const createMockStudent = async () => {
  try {
    if (!db) {
      console.warn('⚠️ Firestore not initialized - skipping createMockStudent');
      return 'student_001';
    }

    const studentId = 'student_001';
    const studentRef = doc(db, 'students', studentId);

    // Check if student already exists
    const studentSnap = await getDoc(studentRef);

    if (!studentSnap.exists()) {
      const studentData = {
        studentId: studentId,
        name: 'Test Student',
        age: 7,
        gradeLevel: 'Grade 1',
        parentId: 'parent_001',
        createdAt: serverTimestamp(),
      };

      await setDoc(studentRef, studentData);
      console.log('✅ Mock student created:', studentId);
    } else {
      console.log('ℹ️ Mock student already exists:', studentId);
    }

    return studentId;
  } catch (error) {
    console.error('❌ Error creating mock student:', error);
    throw error;
  }
};

// ============================================
// GAME SESSION FUNCTIONS
// ============================================

/**
 * Saves a game session to Firestore
 * @param {Object} sessionData - Session data object
 * @param {string} sessionData.studentId - Student ID
 * @param {string} sessionData.gameMode - 'practice' | 'quiz' | 'challenge'
 * @param {number} sessionData.totalQuestions - Total questions in session
 * @param {number} sessionData.correctAnswers - Number of correct answers
 * @param {number} sessionData.timeTaken - Time taken in seconds
 * @param {string} sessionData.difficultyLevel - Difficulty level
 * @returns {Promise<string>} sessionId
 */
export const saveGameSession = async (sessionData) => {
  try {
    if (!db) {
      console.warn('⚠️ Firestore not initialized - skipping saveGameSession');
      return null;
    }

    const {
      studentId,
      gameMode,
      totalQuestions,
      correctAnswers,
      timeTaken,
      difficultyLevel = 'medium',
    } = sessionData;

    // Validate required fields
    if (!studentId || !gameMode || !totalQuestions || correctAnswers === undefined) {
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
      studentId: studentId,
      date: serverTimestamp(),
      gameMode: gameMode,
      totalQuestions: totalQuestions,
      correctAnswers: correctAnswers,
      accuracy: Math.round(accuracy * 100) / 100, // Round to 2 decimal places
      timeTaken: timeTaken || 0,
      difficultyLevel: difficultyLevel,
    };

    const sessionRef = doc(db, 'gameSessions', sessionId);
    await setDoc(sessionRef, sessionDoc);

    console.log('✅ Game session saved:', sessionId, {
      accuracy: sessionDoc.accuracy,
      correctAnswers,
      totalQuestions,
    });

    return sessionId;
  } catch (error) {
    console.error('❌ Error saving game session:', error);
    throw error;
  }
};

// ============================================
// LETTER PERFORMANCE FUNCTIONS
// ============================================

/**
 * Updates letter performance for a student
 * @param {string} studentId - Student ID
 * @param {string} letter - Letter (A-Z)
 * @param {boolean} isCorrect - Whether the answer was correct
 * @param {number} responseTime - Response time in milliseconds
 * @returns {Promise<void>}
 */
export const updateLetterPerformance = async (
  studentId,
  letter,
  isCorrect,
  responseTime = 0
) => {
  try {
    if (!db) {
      console.warn('⚠️ Firestore not initialized - skipping updateLetterPerformance');
      return;
    }

    if (!studentId || !letter) {
      throw new Error('studentId and letter are required');
    }

    const docId = `${studentId}_${letter.toUpperCase()}`;
    const letterRef = doc(db, 'letterPerformance', docId);

    // Check if document exists
    const letterSnap = await getDoc(letterRef);

    if (letterSnap.exists()) {
      // Update existing document
      const currentData = letterSnap.data();
      const currentAttempts = currentData.attempts || 0;
      const currentCorrect = currentData.correct || 0;
      const currentIncorrect = currentData.incorrect || 0;
      const currentAvgTime = currentData.averageResponseTime || 0;

      // Calculate new average response time
      const totalTime = currentAvgTime * currentAttempts + responseTime;
      const newAttempts = currentAttempts + 1;
      const newAvgTime = newAttempts > 0 ? totalTime / newAttempts : 0;

      await updateDoc(letterRef, {
        attempts: increment(1),
        correct: isCorrect ? increment(1) : currentCorrect,
        incorrect: !isCorrect ? increment(1) : currentIncorrect,
        averageResponseTime: Math.round(newAvgTime * 100) / 100, // Round to 2 decimals
        lastPracticed: serverTimestamp(),
      });

      console.log(`✅ Updated letter performance: ${letter} for student ${studentId}`);
    } else {
      // Create new document
      const letterData = {
        studentId: studentId,
        letter: letter.toUpperCase(),
        attempts: 1,
        correct: isCorrect ? 1 : 0,
        incorrect: isCorrect ? 0 : 1,
        averageResponseTime: responseTime,
        lastPracticed: serverTimestamp(),
      };

      await setDoc(letterRef, letterData);
      console.log(`✅ Created letter performance: ${letter} for student ${studentId}`);
    }
  } catch (error) {
    console.error('❌ Error updating letter performance:', error);
    throw error;
  }
};

// ============================================
// ANALYTICS FUNCTIONS
// ============================================

/**
 * Gets comprehensive analytics for a student
 * @param {string} studentId - Student ID
 * @returns {Promise<Object>} Analytics object
 */
export const getStudentAnalytics = async (studentId) => {
  try {
    if (!db) {
      console.warn('⚠️ Firestore not initialized - returning mock analytics');
      return getMockAnalytics();
    }

    if (!studentId) {
      throw new Error('studentId is required');
    }

    // Get all game sessions for this student
    const sessionsQuery = query(
      collection(db, 'gameSessions'),
      where('studentId', '==', studentId),
      orderBy('date', 'desc')
    );
    const sessionsSnapshot = await getDocs(sessionsQuery);

    const sessions = [];
    sessionsSnapshot.forEach((doc) => {
      sessions.push({ id: doc.id, ...doc.data() });
    });

    // Get all letter performance data
    const letterPerfQuery = query(
      collection(db, 'letterPerformance'),
      where('studentId', '==', studentId)
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
    
    // Calculate average accuracy
    const totalAccuracy = sessions.reduce((sum, session) => sum + (session.accuracy || 0), 0);
    const averageAccuracy = totalSessions > 0 
      ? Math.round((totalAccuracy / totalSessions) * 100) / 100 
      : 0;

    // Calculate total practice time
    const totalPracticeTime = sessions.reduce((sum, session) => sum + (session.timeTaken || 0), 0);

    // Get most weak letters (bottom 5 by accuracy)
    const weakLetters = [...letterPerformance]
      .filter((lp) => lp.attempts > 0)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5)
      .map((lp) => ({
        letter: lp.letter,
        accuracy: Math.round(lp.accuracy * 100) / 100,
        attempts: lp.attempts,
      }));

    // Get most strong letters (top 5 by accuracy)
    const strongLetters = [...letterPerformance]
      .filter((lp) => lp.attempts > 0)
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 5)
      .map((lp) => ({
        letter: lp.letter,
        accuracy: Math.round(lp.accuracy * 100) / 100,
        attempts: lp.attempts,
      }));

    // Calculate weekly accuracy average (last 7 days)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const recentSessions = sessions.filter((session) => {
      const sessionDate = session.date?.toDate ? session.date.toDate() : new Date(session.date);
      return sessionDate >= oneWeekAgo;
    });

    const weeklyAccuracy = recentSessions.length > 0
      ? recentSessions.reduce((sum, session) => sum + (session.accuracy || 0), 0) / recentSessions.length
      : 0;

    // Calculate overall improvement (compare first half vs second half of sessions)
    let overallImprovement = 0;
    if (sessions.length >= 2) {
      const midpoint = Math.floor(sessions.length / 2);
      const firstHalf = sessions.slice(midpoint);
      const secondHalf = sessions.slice(0, midpoint);

      const firstHalfAvg = firstHalf.length > 0
        ? firstHalf.reduce((sum, s) => sum + (s.accuracy || 0), 0) / firstHalf.length
        : 0;
      
      const secondHalfAvg = secondHalf.length > 0
        ? secondHalf.reduce((sum, s) => sum + (s.accuracy || 0), 0) / secondHalf.length
        : 0;

      overallImprovement = Math.round((secondHalfAvg - firstHalfAvg) * 100) / 100;
    }

    const analytics = {
      totalSessions,
      averageAccuracy: Math.round(averageAccuracy * 100) / 100,
      totalPracticeTime, // in seconds
      weeklyAccuracy: Math.round(weeklyAccuracy * 100) / 100,
      overallImprovement,
      mostWeakLetters: weakLetters,
      mostStrongLetters: strongLetters,
      letterPerformance: letterPerformance.sort((a, b) => a.letter.localeCompare(b.letter)),
    };

    console.log('✅ Student analytics retrieved:', {
      totalSessions,
      averageAccuracy: analytics.averageAccuracy,
    });

    return analytics;
  } catch (error) {
    console.error('❌ Error getting student analytics:', error);
    throw error;
  }
};

/**
 * Returns mock analytics when Firestore is not available
 * @returns {Object} Mock analytics object
 */
const getMockAnalytics = () => {
  return {
    totalSessions: 0,
    averageAccuracy: 0,
    totalPracticeTime: 0,
    weeklyAccuracy: 0,
    overallImprovement: 0,
    mostWeakLetters: [],
    mostStrongLetters: [],
    letterPerformance: [],
  };
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Gets all game sessions for a student
 * @param {string} studentId - Student ID
 * @param {number} limitCount - Maximum number of sessions to return
 * @returns {Promise<Array>} Array of game sessions
 */
export const getStudentGameSessions = async (studentId, limitCount = 50) => {
  try {
    if (!db) {
      console.warn('⚠️ Firestore not initialized - returning empty array');
      return [];
    }

    const sessionsQuery = query(
      collection(db, 'gameSessions'),
      where('studentId', '==', studentId),
      orderBy('date', 'desc'),
      limit(limitCount)
    );

    const sessionsSnapshot = await getDocs(sessionsQuery);
    const sessions = [];

    sessionsSnapshot.forEach((doc) => {
      sessions.push({ id: doc.id, ...doc.data() });
    });

    return sessions;
  } catch (error) {
    console.error('❌ Error getting game sessions:', error);
    throw error;
  }
};

/**
 * Gets letter performance for a specific letter
 * @param {string} studentId - Student ID
 * @param {string} letter - Letter (A-Z)
 * @returns {Promise<Object|null>} Letter performance data or null
 */
export const getLetterPerformance = async (studentId, letter) => {
  try {
    if (!db) {
      console.warn('⚠️ Firestore not initialized - returning null');
      return null;
    }

    const docId = `${studentId}_${letter.toUpperCase()}`;
    const letterRef = doc(db, 'letterPerformance', docId);
    const letterSnap = await getDoc(letterRef);

    if (letterSnap.exists()) {
      return { id: letterSnap.id, ...letterSnap.data() };
    }

    return null;
  } catch (error) {
    console.error('❌ Error getting letter performance:', error);
    throw error;
  }
};





