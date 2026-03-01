import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { loginUser } from '../../services/auth/authService';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { isAuthenticated, isParent, isChild, userData } = useAuth();

  // Navigate based on role after authentication
  useEffect(() => {
    if (isAuthenticated && userData) {
      if (isParent) {
        // Navigate to Parent Dashboard
        navigation.reset({
          index: 0,
          routes: [{ name: 'ParentDashboard' }],
        });
      } else if (isChild) {
        // Navigate to Child Dashboard
        navigation.reset({
          index: 0,
          routes: [{ name: 'ChildDashboard' }],
        });
      }
    }
  }, [isAuthenticated, isParent, isChild, userData, navigation]);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      // Login with Firebase Auth
      // AuthContext will automatically fetch user document and update state
      await loginUser(email, password);
      console.log('✅ Login successful');
      // Navigation will happen automatically via useEffect when auth state updates
    } catch (error) {
      console.error('Login error:', error);
      let errorMessage = 'Failed to login. Please try again.';

      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email.';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later.';
      }

      Alert.alert('Login Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-purple-50">
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center mb-8">
          <MaterialIcons name="waving-hand" size={64} color="#8b5cf6" style={{ marginBottom: 16 }} />
          <Text className="text-4xl font-bold text-gray-800 mb-2">
            Welcome Back!
          </Text>
          <Text className="text-lg text-gray-600 text-center">
            Sign in to continue learning
          </Text>
        </View>

        <View className="bg-white rounded-3xl p-6 shadow-lg mb-6">
          <View className="mb-4">
            <Text className="text-lg font-semibold text-gray-700 mb-2">
              Email
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-700 mb-2">
              Password
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-xl font-bold text-white">Login</Text>
            )}
          </TouchableOpacity>
        </View>

        <View className="items-center">
          <Text className="text-gray-600 mb-2">Don't have an account?</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Register')}
            className="p-2"
          >
            <Text className="text-purple-600 font-bold text-lg">
              Register as Parent
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  input: {
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#f9fafb',
  },
  button: {
    backgroundColor: '#8b5cf6',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default LoginScreen;

