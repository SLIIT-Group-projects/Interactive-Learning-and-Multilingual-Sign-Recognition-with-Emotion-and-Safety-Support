# Firestore Integration Guide for PlayGame Component

This guide shows how to integrate Firestore analytics into your `PlayGame.js` component.

## 📋 Overview

The integration will:
1. Track letter performance for each answer
2. Save game session when game completes
3. Calculate response times
4. Store all data in Firestore for analytics

## 🔧 Step 1: Add Imports

Add these imports at the top of `PlayGame.js`:

```javascript
import {
  updateLetterPerformance,
  saveGameSession,
  createMockStudent,
} from '../services/firestoreService';
```

## 📊 Step 2: Initialize Mock Data (Optional)

Add this to your `useEffect` hook to ensure mock data exists:

```javascript
useEffect(() => {
  generateNewQuestion();
  testAPIConnection();
  
  // Initialize mock data
  const initMockData = async () => {
    try {
      await createMockStudent();
    } catch (error) {
      console.warn('Failed to initialize mock data:', error);
    }
  };
  initMockData();
}, []);
```

## ⏱️ Step 3: Track Response Time

Add state to track when question starts:

```javascript
const [questionStartTime, setQuestionStartTime] = useState(null);

// Update generateNewQuestion to set start time
const generateNewQuestion = () => {
  // ... existing code ...
  setQuestionStartTime(Date.now()); // Add this line
};
```

## ✅ Step 4: Update Letter Performance After Each Answer

Modify the `handleCapture` function to track letter performance:

```javascript
const handleCapture = async () => {
  // ... existing capture and API call code ...
  
  // After getting the result
  const result = await response.json();
  
  // Calculate response time
  const responseTime = questionStartTime 
    ? Date.now() - questionStartTime 
    : 0;
  
  // Update letter performance in Firestore
  try {
    await updateLetterPerformance(
      'student_001', // TODO: Get from context/state when auth is implemented
      targetLetter,
      result.isCorrect,
      responseTime
    );
  } catch (error) {
    console.warn('Failed to update letter performance:', error);
    // Don't block UI if Firestore fails
  }
  
  // ... rest of existing code ...
};
```

## 💾 Step 5: Save Game Session When Game Completes

Modify `handleNextQuestion` to save session data:

```javascript
const handleNextQuestion = async () => {
  if (currentQuestion < TOTAL_QUESTIONS - 1) {
    setCurrentQuestion(currentQuestion + 1);
    generateNewQuestion();
  } else {
    // Game complete - save session
    const gameStartTime = /* track this at game start */;
    const totalTime = Math.floor((Date.now() - gameStartTime) / 1000);
    
    try {
      await saveGameSession({
        studentId: 'student_001', // TODO: Get from context/state
        gameMode: 'practice', // or 'quiz' or 'challenge'
        totalQuestions: TOTAL_QUESTIONS,
        correctAnswers: score,
        timeTaken: totalTime,
        difficultyLevel: 'medium', // You can make this dynamic
      });
      console.log('✅ Game session saved successfully');
    } catch (error) {
      console.warn('Failed to save game session:', error);
    }
    
    alert(`Game Complete! Your score: ${score} / ${TOTAL_QUESTIONS}`);
    
    // Reset game
    setCurrentQuestion(0);
    setScore(0);
    generateNewQuestion();
  }
};
```

## 🎯 Step 6: Track Game Start Time

Add state for game start time:

```javascript
const [gameStartTime, setGameStartTime] = useState(null);

// Set when component mounts or game starts
useEffect(() => {
  setGameStartTime(Date.now());
  // ... rest of initialization
}, []);
```

## 📝 Complete Integration Example

Here's a complete example of the modified sections:

```javascript
import React, { useState, useEffect, useRef, useCallback } from "react";
// ... other imports ...
import {
  updateLetterPerformance,
  saveGameSession,
  createMockStudent,
} from '../services/firestoreService';

const PlayGame = ({ navigation }) => {
  // ... existing state ...
  const [questionStartTime, setQuestionStartTime] = useState(null);
  const [gameStartTime, setGameStartTime] = useState(null);
  const STUDENT_ID = 'student_001'; // TODO: Get from context/state

  useEffect(() => {
    setGameStartTime(Date.now());
    generateNewQuestion();
    testAPIConnection();
    
    // Initialize mock data
    const initMockData = async () => {
      try {
        await createMockStudent();
      } catch (error) {
        console.warn('Failed to initialize mock data:', error);
      }
    };
    initMockData();
  }, []);

  const generateNewQuestion = () => {
    // ... existing code ...
    setQuestionStartTime(Date.now()); // Track question start
  };

  const handleCapture = async () => {
    // ... existing capture code ...
    
    // After getting result from API
    const result = await response.json();
    
    // Calculate response time
    const responseTime = questionStartTime 
      ? Date.now() - questionStartTime 
      : 0;
    
    // Update letter performance
    try {
      await updateLetterPerformance(
        STUDENT_ID,
        targetLetter,
        result.isCorrect,
        responseTime
      );
    } catch (error) {
      console.warn('Failed to update letter performance:', error);
    }
    
    // ... rest of existing code ...
  };

  const handleNextQuestion = async () => {
    if (currentQuestion < TOTAL_QUESTIONS - 1) {
      setCurrentQuestion(currentQuestion + 1);
      generateNewQuestion();
    } else {
      // Game complete
      const totalTime = gameStartTime 
        ? Math.floor((Date.now() - gameStartTime) / 1000)
        : 0;
      
      try {
        await saveGameSession({
          studentId: STUDENT_ID,
          gameMode: 'practice',
          totalQuestions: TOTAL_QUESTIONS,
          correctAnswers: score,
          timeTaken: totalTime,
          difficultyLevel: 'medium',
        });
        console.log('✅ Game session saved');
      } catch (error) {
        console.warn('Failed to save game session:', error);
      }
      
      alert(`Game Complete! Your score: ${score} / ${TOTAL_QUESTIONS}`);
      
      // Reset game
      setCurrentQuestion(0);
      setScore(0);
      setGameStartTime(Date.now());
      generateNewQuestion();
    }
  };

  // ... rest of component ...
};
```

## 🎨 Step 7: Add Game Mode Selection (Optional)

You can add game mode selection to your UI:

```javascript
const [gameMode, setGameMode] = useState('practice'); // 'practice' | 'quiz' | 'challenge'

// Then use it when saving session:
await saveGameSession({
  // ... other fields ...
  gameMode: gameMode,
});
```

## 🔍 Step 8: Verify Integration

1. Run your app and play a game
2. Check Firebase Console → Firestore Database
3. You should see:
   - Documents in `gameSessions` collection
   - Documents in `letterPerformance` collection
4. Check console logs for success messages

## ⚠️ Error Handling

All Firestore operations are wrapped in try-catch blocks to prevent UI blocking. If Firestore is unavailable:
- The app will continue to work normally
- You'll see warning messages in console
- Data won't be saved, but gameplay won't be affected

## 🚀 Next Steps

1. **Integrate with ParentDashboard** - Use `getStudentAnalytics()` to display progress
2. **Add difficulty levels** - Track and save difficulty per session
3. **Implement user context** - Replace hardcoded `STUDENT_ID` with actual user data
4. **Add session history** - Display past sessions in ChildDashboard

## 📚 Related Files

- `firestoreService.js` - All Firestore functions
- `exampleUsage.js` - More usage examples
- `FIREBASE_SETUP.md` - Firebase setup instructions





