import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase configuration from environment variables
const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '';
const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 
  (projectId ? `${projectId}.firebaseapp.com` : '');

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: authDomain,
  projectId: projectId,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 
    (projectId ? `${projectId}.appspot.com` : ''),
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
};

// Validate that required config values are present
const validateConfig = () => {
  const requiredFields = ['apiKey', 'projectId', 'authDomain'];
  const missingFields = requiredFields.filter(
    (field) => !firebaseConfig[field]
  );

  if (missingFields.length > 0) {
    console.warn(
      `⚠️ Firebase config missing: ${missingFields.join(', ')}. Using mock mode.`
    );
    return false;
  }
  
  // Validate authDomain format
  if (firebaseConfig.authDomain && !firebaseConfig.authDomain.includes('.firebaseapp.com')) {
    console.warn('⚠️ authDomain format may be incorrect. Expected: {projectId}.firebaseapp.com');
  }
  
  return true;
};

// Initialize Firebase
let app;
let db;
let auth;

try {
  if (validateConfig()) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    
    // Initialize Auth - use platform-specific initialization
    try {
      if (Platform.OS === 'web') {
        // For web, use getAuth (browser handles persistence automatically)
        auth = getAuth(app);
        console.log('✅ Firebase initialized successfully (Web)');
      } else {
        // For React Native (iOS/Android), use initializeAuth with AsyncStorage persistence
        auth = initializeAuth(app, {
          persistence: getReactNativePersistence(AsyncStorage),
        });
        console.log('✅ Firebase initialized successfully with Auth persistence (React Native)');
      }
    } catch (authError) {
      // If auth is already initialized, get the existing instance
      if (authError.code === 'auth/already-initialized') {
        auth = getAuth(app);
        console.log('✅ Firebase initialized (Auth already initialized)');
      } else {
        console.error('❌ Auth initialization error:', authError);
        // Fallback to getAuth for web compatibility
        if (Platform.OS === 'web') {
          auth = getAuth(app);
          console.log('✅ Firebase Auth fallback initialized (Web)');
        } else {
          throw authError;
        }
      }
    }
  } else {
    console.warn('⚠️ Firebase not initialized - using mock mode');
    db = null;
    auth = null;
  }
} catch (error) {
  console.error('❌ Firebase initialization error:', error);
  db = null;
  auth = null;
}

export { db, app, auth };
export default db;


