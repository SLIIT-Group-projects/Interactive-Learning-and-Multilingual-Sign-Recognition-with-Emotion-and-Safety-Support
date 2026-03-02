// /**
//  * Login Screen
//  * Google Sign-In with Firebase Authentication
//  */

// import React, { useState } from 'react';
// import {
//   View,
//   Text,
//   StyleSheet,
//   TouchableOpacity,
//   ActivityIndicator,
//   Alert,
//   Image,
// } from 'react-native';
// import { ThemedText } from '@/components/themed-text';
// import { ThemedView } from '@/components/themed-view';
// import { useRouter } from 'expo-router';
// import authService from '@/services/auth.service';

// export default function LoginScreen() {
//   const [loading, setLoading] = useState(false);
//   const router = useRouter();

//   const handleGoogleSignIn = async () => {
//     try {
//       setLoading(true);
//       await authService.signInWithGoogle();
//       // Navigation will be handled by auth state change in _layout.tsx
//       router.replace('/(tabs)');
//     } catch (error: any) {
//       console.error('Login error:', error);
//       Alert.alert(
//         'Sign In Failed',
//         error.message || 'Failed to sign in with Google. Please try again.',
//         [{ text: 'OK' }]
//       );
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <ThemedView style={styles.container}>
//       <View style={styles.content}>
//         <ThemedText type="title" style={styles.title}>
//           Welcome
//         </ThemedText>
//         <ThemedText style={styles.subtitle}>
//           Sign in to start recording and analyzing sounds
//         </ThemedText>

//         <TouchableOpacity
//           style={[styles.googleButton, loading && styles.buttonDisabled]}
//           onPress={handleGoogleSignIn}
//           disabled={loading}
//         >
//           {loading ? (
//             <ActivityIndicator color="#fff" />
//           ) : (
//             <>
//               <Image
//                 source={{
//                   uri: 'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg',
//                 }}
//                 style={styles.googleIcon}
//               />
//               <Text style={styles.buttonText}>Sign in with Google</Text>
//             </>
//           )}
//         </TouchableOpacity>

//         <ThemedText style={styles.footer}>
//           Your recordings will be securely stored and associated with your account
//         </ThemedText>
//       </View>
//     </ThemedView>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     justifyContent: 'center',
//     alignItems: 'center',
//     padding: 20,
//   },
//   content: {
//     width: '100%',
//     maxWidth: 400,
//     alignItems: 'center',
//   },
//   title: {
//     fontSize: 32,
//     fontWeight: 'bold',
//     marginBottom: 12,
//     textAlign: 'center',
//   },
//   subtitle: {
//     fontSize: 16,
//     textAlign: 'center',
//     marginBottom: 40,
//     opacity: 0.7,
//   },
//   googleButton: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'center',
//     backgroundColor: '#4285F4',
//     paddingVertical: 14,
//     paddingHorizontal: 24,
//     borderRadius: 8,
//     width: '100%',
//     marginBottom: 20,
//     shadowColor: '#000',
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.1,
//     shadowRadius: 4,
//     elevation: 3,
//   },
//   buttonDisabled: {
//     opacity: 0.6,
//   },
//   googleIcon: {
//     width: 20,
//     height: 20,
//     marginRight: 12,
//   },
//   buttonText: {
//     color: '#fff',
//     fontSize: 16,
//     fontWeight: '600',
//   },
//   footer: {
//     fontSize: 12,
//     textAlign: 'center',
//     opacity: 0.6,
//     marginTop: 20,
//   },
// });

/**
 * Login Screen
 * Google Sign-In with Firebase Authentication
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRouter } from 'expo-router';
import authService from '@/services/auth.service';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleGoogleSignIn = async () => {
    // TEMPORARY: Bypass Google Sign-In for development
    // TODO: Uncomment the code below when ready to enable Google Sign-In
    router.replace('/(tabs)');
    return;

    /* COMMENTED OUT - Google Sign-In (enable when ready)
    try {
      setLoading(true);
      await authService.signInWithGoogle();
      // Navigation will be handled by auth state change in _layout.tsx
      router.replace('/(tabs)');
    } catch (error: any) {
      console.error('Login error:', error);
      Alert.alert(
        'Sign In Failed',
        error.message || 'Failed to sign in with Google. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
    */
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Welcome
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          Sign in to start recording and analyzing sounds
        </ThemedText>

        <TouchableOpacity
          style={[styles.googleButton, loading && styles.buttonDisabled]}
          onPress={handleGoogleSignIn}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Image
                source={{
                  uri: 'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg',
                }}
                style={styles.googleIcon}
              />
              <Text style={styles.buttonText}>Sign in with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <ThemedText style={styles.footer}>
          Your recordings will be securely stored and associated with your account
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    opacity: 0.7,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4285F4',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  googleIcon: {
    width: 20,
    height: 20,
    marginRight: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.6,
    marginTop: 20,
  },
});

