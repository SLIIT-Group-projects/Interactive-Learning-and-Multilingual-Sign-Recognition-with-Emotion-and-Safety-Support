# Firebase Firestore Setup Guide

This guide will help you set up Firebase Firestore for the ASL Learning App.

## 🔥 Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Follow the setup wizard:
   - Enter project name (e.g., "asl-learning-app")
   - Enable/disable Google Analytics (optional)
   - Click "Create project"

## 📊 Step 2: Enable Firestore Database

1. In Firebase Console, go to **Build** → **Firestore Database**
2. Click **Create database**
3. Choose **Start in test mode** (for development)
4. Select a location (choose closest to your users)
5. Click **Enable**

## 🔑 Step 3: Get Firebase Configuration

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Scroll down to **Your apps** section
3. Click the **Web** icon (`</>`) to add a web app
4. Register your app with a nickname (e.g., "ASL Learning Web")
5. Copy the Firebase configuration object

You'll see something like:
```javascript
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAxWAEsxF-VDmM_9qJIpN4b-aAFYVDgkOE",
  authDomain: "signlanguageproject-eb8d8.firebaseapp.com",
  projectId: "signlanguageproject-eb8d8",
  storageBucket: "signlanguageproject-eb8d8.firebasestorage.app",
  messagingSenderId: "977819571660",
  appId: "1:977819571660:web:ebf09b38525050a40d3969",
  measurementId: "G-ZVL63BQHQX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
```

## ⚙️ Step 4: Configure Environment Variables

1. In the `frontend/` directory, create a `.env` file:
   ```bash
   cd frontend
   touch .env
   ```

2. Add your Firebase credentials to `.env`:
   ```env
   EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key_here
   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
   ```

3. **Important**: The `.env` file is already in `.gitignore` - never commit it!

## 🔒 Step 5: Set Up Firestore Security Rules

1. In Firebase Console, go to **Firestore Database** → **Rules**
2. For development, use these rules:
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```
3. Click **Publish**

⚠️ **Security Note**: These rules allow anyone to read/write. Update them when implementing authentication!

## ✅ Step 6: Verify Installation

1. Restart your Expo development server:
   ```bash
   cd frontend
   npm start
   ```

2. The app should now connect to Firestore. Check the console for:
   - `✅ Firebase initialized successfully`

3. Test by initializing mock data (see usage examples below)

## 🧪 Step 7: Test the Integration

You can test the integration by importing and using the service functions:

```javascript
import { 
  createMockParent, 
  createMockStudent,
  saveGameSession 
} from './services/firestoreService';

// Initialize mock data
await createMockParent();
await createMockStudent();

// Test saving a game session
await saveGameSession({
  studentId: 'student_001',
  gameMode: 'practice',
  totalQuestions: 10,
  correctAnswers: 8,
  timeTaken: 300,
  difficultyLevel: 'medium'
});
```

## 📱 Step 8: Integration with PlayGame Screen

To integrate with your existing `PlayGame.js` screen:

1. Import the service functions:
   ```javascript
   import { 
     updateLetterPerformance, 
     saveGameSession 
   } from '../services/firestoreService';
   ```

2. Update letter performance after each answer:
   ```javascript
   // After checking if answer is correct
   if (result.isCorrect) {
     await updateLetterPerformance(
       'student_001', // or get from context/state
       targetLetter,
       true,
       responseTime
     );
   }
   ```

3. Save game session when game ends:
   ```javascript
   // In handleNextQuestion when game is complete
   if (currentQuestion === TOTAL_QUESTIONS - 1) {
     await saveGameSession({
       studentId: 'student_001',
       gameMode: 'practice',
       totalQuestions: TOTAL_QUESTIONS,
       correctAnswers: score,
       timeTaken: totalTime,
       difficultyLevel: 'medium'
     });
   }
   ```

## 🐛 Troubleshooting

### Firebase not initializing
- Check that `.env` file exists and has correct values
- Verify all environment variables start with `EXPO_PUBLIC_`
- Restart Expo development server after creating `.env`

### Permission denied errors
- Check Firestore security rules in Firebase Console
- Ensure rules allow read/write operations

### Network errors
- Check internet connection
- Verify Firebase project is active
- Check Firebase Console for any service outages

### Mock mode warnings
- This is normal if Firebase config is missing
- Functions will still work but won't save to Firestore
- Add Firebase config to enable real database operations

## 📚 Next Steps

1. **Integrate with PlayGame screen** - Save sessions and letter performance
2. **Update ParentDashboard** - Display analytics using `getStudentAnalytics()`
3. **Update ChildDashboard** - Show progress and achievements
4. **Implement Authentication** - Replace mock data with real user data
5. **Set up proper security rules** - Based on authentication

## 🔗 Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
- [Expo Environment Variables](https://docs.expo.dev/guides/environment-variables/)

