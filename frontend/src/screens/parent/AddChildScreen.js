import React, { useState } from 'react';
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
import { registerChild } from '../../services/firestore/userService';

const AddChildScreen = ({ navigation }) => {
  const { userData } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddChild = async () => {
    // Validation
    if (!name || !email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    if (!userData || userData.role !== 'parent') {
      Alert.alert('Error', 'Only parents can create child accounts');
      return;
    }

    setLoading(true);
    try {
      await registerChild(email, password, name, userData.uid);
      
      Alert.alert(
        'Success',
        `Child account created for ${name}! They can now login with their email and password.`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      console.error('Add child error:', error);
      let errorMessage = 'Failed to create child account. Please try again.';

      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please use a stronger password.';
      }

      Alert.alert('Error', errorMessage);
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
          <MaterialIcons name="child-care" size={64} color="#8b5cf6" style={{ marginBottom: 16 }} />
          <Text className="text-4xl font-bold text-gray-800 mb-2">
            Add Child Account
          </Text>
          <Text className="text-lg text-gray-600 text-center px-4">
            Create an account for your child to start learning
          </Text>
        </View>

        <View className="bg-white rounded-3xl p-6 shadow-lg mb-6">
          <View className="mb-4">
            <Text className="text-lg font-semibold text-gray-700 mb-2">
              Child's Name
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Enter child's name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>

          <View className="mb-4">
            <Text className="text-lg font-semibold text-gray-700 mb-2">
              Child's Email
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Enter child's email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <View className="mb-4">
            <Text className="text-lg font-semibold text-gray-700 mb-2">
              Password
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Create a password (min 6 characters)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-700 mb-2">
              Confirm Password
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleAddChild}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-xl font-bold text-white">
                Create Child Account
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="p-2"
        >
          <Text className="text-purple-600 font-bold text-lg">Cancel</Text>
        </TouchableOpacity>
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

export default AddChildScreen;

