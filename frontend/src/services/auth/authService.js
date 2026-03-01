import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from '../firebase/firebaseConfig';

/**
 * Register a new user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<{user: Object, uid: string}>} User object and UID
 */
export const registerUser = async (email, password) => {
  try {
    if (!auth) {
      throw new Error('Firebase Auth not initialized. Please check your Firebase configuration and ensure Authentication is enabled in Firebase Console.');
    }

    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    return {
      user: userCredential.user,
      uid: userCredential.user.uid,
    };
  } catch (error) {
    console.error('❌ Registration error:', error);
    
    // Provide more helpful error messages
    if (error.code === 'auth/configuration-not-found') {
      throw new Error('Firebase Authentication is not enabled. Please enable it in Firebase Console: Build → Authentication → Get Started → Enable Email/Password');
    }
    
    throw error;
  }
};

/**
 * Login user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<{user: Object, uid: string}>} User object and UID
 */
export const loginUser = async (email, password) => {
  try {
    if (!auth) {
      throw new Error('Firebase Auth not initialized');
    }

    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    return {
      user: userCredential.user,
      uid: userCredential.user.uid,
    };
  } catch (error) {
    console.error('❌ Login error:', error);
    throw error;
  }
};

/**
 * Logout current user
 * @returns {Promise<void>}
 */
export const logoutUser = async () => {
  try {
    if (!auth) {
      throw new Error('Firebase Auth not initialized');
    }

    await signOut(auth);
    console.log('✅ User logged out successfully');
  } catch (error) {
    console.error('❌ Logout error:', error);
    throw error;
  }
};

/**
 * Get current authenticated user
 * @returns {Object|null} Current user or null
 */
export const getCurrentUser = () => {
  if (!auth) {
    return null;
  }
  return auth.currentUser;
};

/**
 * Subscribe to authentication state changes
 * @param {Function} callback - Callback function that receives user or null
 * @returns {Function} Unsubscribe function
 */
export const onAuthStateChange = (callback) => {
  if (!auth) {
    callback(null);
    return () => {}; // Return no-op unsubscribe function
  }

  return onAuthStateChanged(auth, callback);
};

