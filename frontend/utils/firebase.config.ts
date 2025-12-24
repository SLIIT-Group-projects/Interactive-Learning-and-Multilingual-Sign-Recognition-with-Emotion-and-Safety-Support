/**
 * Firebase Configuration
 * 
 * To set up Firebase:
 * 1. Go to https://console.firebase.google.com/
 * 2. Create a new project or select existing one
 * 3. Add an Android/iOS app (or Web app for testing)
 * 4. Copy your config values below
 * 5. Enable Authentication > Sign-in method > Google
 * 6. Enable Storage > Get Started
 * 7. Enable Firestore Database > Create database > Start in test mode (or production with rules)
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getFirestore, Firestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { Platform } from 'react-native';

// Firebase config values extracted from your GoogleService-Info.plist and google-services.json
// Project: deaf-kids
// Bundle ID / Package: dead.kids
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyAc7oThHw97N0V5SaUIWIl2zOtJH7E2qhQ", // iOS API Key (use Android key for Android builds)
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "deaf-kids.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "deaf-kids",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "deaf-kids.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "532720185132",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:532720185132:ios:8fe1d9ecb0323b9a1a4689", // iOS App ID (use Android App ID for Android builds)
};

// Initialize Firebase
let app: FirebaseApp;
let auth: Auth;
let storage: FirebaseStorage;
let db: Firestore;

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  storage = getStorage(app);
  db = getFirestore(app);
  
  // Disable persistence in simulator/development to avoid SQLite errors
  // Firestore persistence uses SQLite which can cause issues in simulators
  if (Platform.OS !== 'web') {
    // Skip enabling persistence in React Native to avoid SQLite errors
    // The app will work without offline persistence
    console.log('Firestore initialized without persistence (to avoid SQLite errors in simulator)');
  } else {
    // For web, try to enable persistence but catch errors gracefully
    try {
      enableIndexedDbPersistence(db).catch((err) => {
        if (err.code === 'failed-precondition') {
          console.warn('Firestore persistence already enabled in another tab');
        } else if (err.code === 'unimplemented') {
          console.warn('Firestore persistence not supported in this browser');
        } else {
          console.warn('Firestore persistence error:', err);
        }
      });
    } catch (error) {
      console.warn('Could not enable Firestore persistence:', error);
    }
  }
} else {
  app = getApps()[0];
  auth = getAuth(app);
  storage = getStorage(app);
  db = getFirestore(app);
}

export { app, auth, storage, db };
export default app;

