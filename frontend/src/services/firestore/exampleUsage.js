/**
 * Example Usage of Firestore Service
 * 
 * This file demonstrates how to use the Firestore service functions
 * in your React Native components.
 */

import {
  createMockParent,
  createMockStudent,
  saveGameSession,
  updateLetterPerformance,
  getStudentAnalytics,
  getStudentGameSessions,
  getLetterPerformance,
} from './firestoreService';

// ============================================
// Example 1: Initialize Mock Data
// ============================================
export const initializeMockData = async () => {
  try {
    console.log('Initializing mock data...');
    
    // Create mock parent
    const parentId = await createMockParent();
    console.log('Parent ID:', parentId);
    
    // Create mock student
    const studentId = await createMockStudent();
    console.log('Student ID:', studentId);
    
    return { parentId, studentId };
  } catch (error) {
    console.error('Error initializing mock data:', error);
  }
};

// ============================================
// Example 2: Save Game Session After Game Ends
// ============================================
export const saveGameSessionExample = async () => {
  try {
    const studentId = 'student_001';
    
    // Example: Game just finished
    const sessionData = {
      studentId: studentId,
      gameMode: 'practice', // or 'quiz' or 'challenge'
      totalQuestions: 10,
      correctAnswers: 8,
      timeTaken: 300, // seconds
      difficultyLevel: 'medium', // 'easy', 'medium', 'hard'
    };
    
    const sessionId = await saveGameSession(sessionData);
    console.log('Game session saved with ID:', sessionId);
    
    return sessionId;
  } catch (error) {
    console.error('Error saving game session:', error);
  }
};

// ============================================
// Example 3: Update Letter Performance After Each Answer
// ============================================
export const updateLetterPerformanceExample = async () => {
  try {
    const studentId = 'student_001';
    const letter = 'A';
    const isCorrect = true;
    const responseTime = 1500; // milliseconds
    
    await updateLetterPerformance(studentId, letter, isCorrect, responseTime);
    console.log(`Letter ${letter} performance updated`);
  } catch (error) {
    console.error('Error updating letter performance:', error);
  }
};

// ============================================
// Example 4: Get Student Analytics for Dashboard
// ============================================
export const getAnalyticsExample = async () => {
  try {
    const studentId = 'student_001';
    
    const analytics = await getStudentAnalytics(studentId);
    
    console.log('📊 Student Analytics:');
    console.log('Total Sessions:', analytics.totalSessions);
    console.log('Average Accuracy:', analytics.averageAccuracy + '%');
    console.log('Total Practice Time:', analytics.totalPracticeTime, 'seconds');
    console.log('Weekly Accuracy:', analytics.weeklyAccuracy + '%');
    console.log('Overall Improvement:', analytics.overallImprovement + '%');
    
    console.log('\n📉 Weak Letters:');
    analytics.mostWeakLetters.forEach((letter) => {
      console.log(`  ${letter.letter}: ${letter.accuracy}% (${letter.attempts} attempts)`);
    });
    
    console.log('\n📈 Strong Letters:');
    analytics.mostStrongLetters.forEach((letter) => {
      console.log(`  ${letter.letter}: ${letter.accuracy}% (${letter.attempts} attempts)`);
    });
    
    return analytics;
  } catch (error) {
    console.error('Error getting analytics:', error);
  }
};

// ============================================
// Example 5: Get Game Session History
// ============================================
export const getGameSessionsExample = async () => {
  try {
    const studentId = 'student_001';
    const sessions = await getStudentGameSessions(studentId, 10); // Get last 10 sessions
    
    console.log('📜 Game Session History:');
    sessions.forEach((session) => {
      console.log(`  ${session.date?.toDate?.() || session.date}: ${session.accuracy}% accuracy`);
    });
    
    return sessions;
  } catch (error) {
    console.error('Error getting game sessions:', error);
  }
};

// ============================================
// Example 6: Get Specific Letter Performance
// ============================================
export const getLetterPerformanceExample = async () => {
  try {
    const studentId = 'student_001';
    const letter = 'A';
    
    const performance = await getLetterPerformance(studentId, letter);
    
    if (performance) {
      console.log(`📝 Letter ${letter} Performance:`);
      console.log('  Attempts:', performance.attempts);
      console.log('  Correct:', performance.correct);
      console.log('  Incorrect:', performance.incorrect);
      console.log('  Accuracy:', ((performance.correct / performance.attempts) * 100).toFixed(2) + '%');
      console.log('  Avg Response Time:', performance.averageResponseTime, 'ms');
    } else {
      console.log(`No performance data for letter ${letter}`);
    }
    
    return performance;
  } catch (error) {
    console.error('Error getting letter performance:', error);
  }
};

// ============================================
// Example 7: Complete Game Flow Integration
// ============================================
export const completeGameFlowExample = async () => {
  try {
    const studentId = 'student_001';
    let totalQuestions = 0;
    let correctAnswers = 0;
    const startTime = Date.now();
    const letterAnswers = []; // Track each answer
    
    // Simulate game questions
    const questions = [
      { letter: 'A', isCorrect: true, responseTime: 1500 },
      { letter: 'B', isCorrect: false, responseTime: 2000 },
      { letter: 'A', isCorrect: true, responseTime: 1200 },
      { letter: 'C', isCorrect: true, responseTime: 1800 },
    ];
    
    // Process each answer
    for (const question of questions) {
      totalQuestions++;
      if (question.isCorrect) correctAnswers++;
      
      // Update letter performance for each answer
      await updateLetterPerformance(
        studentId,
        question.letter,
        question.isCorrect,
        question.responseTime
      );
      
      letterAnswers.push(question);
    }
    
    // Calculate total time
    const timeTaken = Math.floor((Date.now() - startTime) / 1000);
    
    // Save game session
    const sessionId = await saveGameSession({
      studentId: studentId,
      gameMode: 'practice',
      totalQuestions: totalQuestions,
      correctAnswers: correctAnswers,
      timeTaken: timeTaken,
      difficultyLevel: 'medium',
    });
    
    console.log('✅ Game completed and saved:', sessionId);
    
    // Get updated analytics
    const analytics = await getStudentAnalytics(studentId);
    console.log('📊 Updated Analytics:', analytics);
    
    return { sessionId, analytics };
  } catch (error) {
    console.error('Error in complete game flow:', error);
  }
};

