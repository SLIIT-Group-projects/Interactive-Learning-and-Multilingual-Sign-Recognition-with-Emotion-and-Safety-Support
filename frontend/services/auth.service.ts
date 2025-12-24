/**
 * Firebase Authentication Service
 * Handles Google Sign-In and authentication state
 */

import { 
  signInWithCredential, 
  signOut, 
  onAuthStateChanged,
  User,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from '../utils/firebase.config';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Complete the auth session for web
if (Platform.OS === 'web') {
  WebBrowser.maybeCompleteAuthSession();
}

// Google OAuth configuration
// Get these from Firebase Console > Authentication > Sign-in method > Google
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || 'your-google-client-id';
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || 'your-google-ios-client-id';
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || 'your-google-android-client-id';

class AuthService {
  private currentUser: User | null = null;
  private authStateListeners: Array<(user: User | null) => void> = [];

  constructor() {
    // Listen to auth state changes
    onAuthStateChanged(auth, (user) => {
      this.currentUser = user;
      this.notifyListeners(user);
      
      // Store user in AsyncStorage for persistence
      if (user) {
        AsyncStorage.setItem('user', JSON.stringify({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
        }));
      } else {
        AsyncStorage.removeItem('user');
      }
    });

    // Restore user from AsyncStorage on app start
    this.restoreUser();
  }

  private async restoreUser() {
    try {
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        // User will be restored by Firebase auth state listener
      }
    } catch (error) {
      console.error('Error restoring user:', error);
    }
  }

  /**
   * Sign in with Google
   * Supports Web and Mobile platforms using expo-auth-session
   */
  async signInWithGoogle(): Promise<User> {
    try {
      if (Platform.OS === 'web') {
        // Web platform - use popup
        const provider = new GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        
        const result = await signInWithPopup(auth, provider);
        return result.user;
      } else {
        // Mobile platform - use expo-auth-session
        return await this.signInWithGoogleMobile();
      }
    } catch (error: any) {
      console.error('Google Sign-In Error:', error);
      throw new Error(error.message || 'Failed to sign in with Google');
    }
  }

  /**
   * Sign in with Google on mobile using expo-auth-session
   * 
   * Note: For Firebase Auth, use the Web Client ID from Firebase Console > Authentication > Sign-in method > Google
   * The Web Client ID works for both iOS and Android when using OAuth flows.
   */
  private async signInWithGoogleMobile(): Promise<User> {
    try {
      // Get the OAuth client ID from Firebase
      // For Firebase Auth OAuth flows, use the Web Client ID (works for both iOS and Android)
      // You can get this from Firebase Console > Authentication > Sign-in method > Google
      // Priority: Web Client ID > Platform-specific IDs
      const clientId = 
        process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || 
        GOOGLE_CLIENT_ID ||
        Platform.select({
          ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || GOOGLE_IOS_CLIENT_ID,
          android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || GOOGLE_ANDROID_CLIENT_ID,
          default: undefined,
        });

      if (!clientId || clientId === 'your-google-client-id' || clientId.includes('your-google')) {
        const errorMessage = `
Google OAuth Client ID is not configured.

SETUP INSTRUCTIONS:
1. Go to Firebase Console: https://console.firebase.google.com/
2. Select your project: "deaf-kids"
3. Navigate to: Authentication > Sign-in method
4. Click on "Google" provider
5. Copy the "Web client ID" (format: xxxxxx-xxxxx.apps.googleusercontent.com)
6. Create a .env file in the frontend directory with:
   EXPO_PUBLIC_GOOGLE_CLIENT_ID=your-web-client-id-here.apps.googleusercontent.com
7. Restart your Expo development server

Note: The Web Client ID works for both iOS and Android when using OAuth flows.
If you don't see a Web client ID, you may need to enable Google Sign-In first.
        `.trim();
        throw new Error(errorMessage);
      }

      // Create the redirect URI
      // In development, Expo uses a proxy server (https://auth.expo.io/...)
      // In production, it uses the custom scheme (frontend://)
      const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'frontend', // Should match your app.json scheme
        path: 'redirect', // Optional path component
      });

      // Log the redirect URI for debugging (user needs to add this to Google Cloud Console)
      console.log('🔗 Redirect URI:', redirectUri);
      console.log('📝 Add this redirect URI to Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client IDs');

      // Create the auth request
      const request = new AuthSession.AuthRequest({
        clientId: clientId,
        scopes: ['openid', 'profile', 'email'],
        responseType: AuthSession.ResponseType.IdToken,
        redirectUri: redirectUri,
      });

      // Get the discovery document
      const discovery = {
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
      };

      // Prompt the user to authenticate
      const result = await request.promptAsync(discovery);

      if (result.type !== 'success') {
        if (result.type === 'error') {
          const errorMessage = result.error?.message || 'Unknown error';
          const errorCode = result.error?.code || 'unknown';
          
          // Provide helpful error messages for common issues
          if (errorCode === 'access_denied' || errorMessage.includes('access_denied') || errorMessage.includes('blocked')) {
            throw new Error(
              `Authorization access blocked. This usually means the redirect URI is not configured in Google Cloud Console.\n\n` +
              `Redirect URI used: ${redirectUri}\n\n` +
              `To fix this:\n` +
              `1. Go to Google Cloud Console: https://console.cloud.google.com/\n` +
              `2. Select project: "deaf-kids"\n` +
              `3. Navigate to: APIs & Services > Credentials\n` +
              `4. Click on your OAuth 2.0 Client ID (the Web client ID)\n` +
              `5. Under "Authorized redirect URIs", click "ADD URI"\n` +
              `6. Add: ${redirectUri}\n` +
              `7. Also add: frontend://redirect (for production)\n` +
              `8. Click "SAVE"\n` +
              `9. Try signing in again`
            );
          }
          throw new Error(`Google Sign-In Error: ${errorMessage} (Code: ${errorCode})`);
        }
        throw new Error(
          result.type === 'cancel' 
            ? 'Sign-in was cancelled' 
            : `Failed to complete Google sign-in: ${result.type}`
        );
      }

      // Get the ID token from the result
      const { id_token } = result.params;
      
      if (!id_token) {
        throw new Error('No ID token received from Google');
      }

      // Create a credential from the ID token
      const credential = GoogleAuthProvider.credential(id_token);
      
      // Sign in to Firebase with the credential
      const userCredential = await signInWithCredential(auth, credential);
      
      return userCredential.user;
    } catch (error: any) {
      console.error('Mobile Google Sign-In Error:', error);
      throw error;
    }
  }

  /**
   * Sign out
   */
  async signOut(): Promise<void> {
    try {
      await signOut(auth);
      await AsyncStorage.removeItem('user');
    } catch (error: any) {
      console.error('Sign-Out Error:', error);
      throw new Error(error.message || 'Failed to sign out');
    }
  }

  /**
   * Get current user
   */
  getCurrentUser(): User | null {
    return this.currentUser || auth.currentUser;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.getCurrentUser() !== null;
  }

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChanged(callback: (user: User | null) => void): () => void {
    this.authStateListeners.push(callback);
    
    // Call immediately with current user
    callback(this.getCurrentUser());
    
    // Return unsubscribe function
    return () => {
      const index = this.authStateListeners.indexOf(callback);
      if (index > -1) {
        this.authStateListeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(user: User | null) {
    this.authStateListeners.forEach(callback => callback(user));
  }
}

// Export singleton instance
export const authService = new AuthService();
export default authService;

