# Firestore Service Documentation

This directory contains Firebase Firestore integration for the ASL Learning App.

## 📁 Files

- **firebaseConfig.js** - Firebase initialization and configuration
- **firestoreService.js** - All Firestore operations and analytics functions

## 🔧 Setup

1. **Create Firebase Project**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create a new project
   - Enable Firestore Database
   - Get your configuration credentials

2. **Configure Environment Variables**
   - Copy `.env.example` to `.env` in the `frontend/` directory
   - Fill in your Firebase credentials

3. **Install Dependencies**
   ```bash
   npm install firebase
   ```

## 📊 Collections Structure

### 1. `students` Collection
```javascript
{
  studentId: string,
  name: string,
  age: number,
  gradeLevel: string,
  parentId: string,
  createdAt: timestamp
}
```

### 2. `parents` Collection
```javascript
{
  parentId: string,
  name: string,
  email: string,
  linkedStudents: [studentId],
  createdAt: timestamp
}
```

### 3. `gameSessions` Collection
```javascript
{
  sessionId: string,
  studentId: string,
  date: timestamp,
  gameMode: "practice" | "quiz" | "challenge",
  totalQuestions: number,
  correctAnswers: number,
  accuracy: number,
  timeTaken: number,
  difficultyLevel: string
}
```

### 4. `letterPerformance` Collection
```javascript
{
  studentId: string,
  letter: string,
  attempts: number,
  correct: number,
  incorrect: number,
  averageResponseTime: number,
  lastPracticed: timestamp
}
```

## 🚀 Usage Examples

### Initialize Mock Data
```javascript
import { createMockParent, createMockStudent } from './services/firestoreService';

// Create mock parent and student
await createMockParent();
await createMockStudent();
```

### Save Game Session
```javascript
import { saveGameSession } from './services/firestoreService';

const sessionId = await saveGameSession({
  studentId: 'student_001',
  gameMode: 'practice',
  totalQuestions: 10,
  correctAnswers: 8,
  timeTaken: 300, // seconds
  difficultyLevel: 'medium'
});
```

### Update Letter Performance
```javascript
import { updateLetterPerformance } from './services/firestoreService';

// When a student answers a letter
await updateLetterPerformance(
  'student_001',
  'A',
  true, // isCorrect
  1500 // responseTime in milliseconds
);
```

### Get Student Analytics
```javascript
import { getStudentAnalytics } from './services/firestoreService';

const analytics = await getStudentAnalytics('student_001');

console.log('Total Sessions:', analytics.totalSessions);
console.log('Average Accuracy:', analytics.averageAccuracy);
console.log('Weak Letters:', analytics.mostWeakLetters);
console.log('Strong Letters:', analytics.mostStrongLetters);
```

## 📈 Analytics Data Structure

The `getStudentAnalytics()` function returns:

```javascript
{
  totalSessions: number,
  averageAccuracy: number,
  totalPracticeTime: number, // in seconds
  weeklyAccuracy: number,
  overallImprovement: number,
  mostWeakLetters: [
    { letter: string, accuracy: number, attempts: number }
  ],
  mostStrongLetters: [
    { letter: string, accuracy: number, attempts: number }
  ],
  letterPerformance: [
    {
      letter: string,
      attempts: number,
      correct: number,
      incorrect: number,
      accuracy: number,
      averageResponseTime: number,
      lastPracticed: timestamp
    }
  ]
}
```

## ⚠️ Error Handling

All functions handle errors gracefully:
- If Firestore is not initialized, functions log warnings and return mock data
- Errors are logged to console with descriptive messages
- Functions throw errors that can be caught by calling code

## 🔒 Security Rules

Make sure to set up Firestore security rules in Firebase Console:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write for now (update with proper auth later)
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

**Note**: Update these rules when implementing authentication!





