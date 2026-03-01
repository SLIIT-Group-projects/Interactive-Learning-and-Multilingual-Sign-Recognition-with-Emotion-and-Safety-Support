import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
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
    
    // Initialize Auth with AsyncStorage for persistence
    try {
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
      console.log('✅ Firebase initialized successfully with Auth persistence');
    } catch (authError) {
      // If auth is already initialized, get the existing instance
      if (authError.code === 'auth/already-initialized') {
        auth = getAuth(app);
        console.log('✅ Firebase initialized (Auth already initialized)');
      } else {
        throw authError;
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


