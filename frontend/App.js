import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator } from 'react-native';
import './global.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import ChildDashboard from './screens/ChildDashboard';
import LearnSigns from './screens/LearnSigns';
import PlayGame from './screens/PlayGame';
import ParentDashboard from './screens/ParentDashboard';
import AddChildScreen from './screens/AddChildScreen';

const Stack = createNativeStackNavigator();

// Navigation component that handles role-based routing
function AppNavigator() {
  const { userData, loading, isAuthenticated, isParent, isChild } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  // Determine initial route based on authentication and role
  let initialRouteName = 'Login';
  if (isAuthenticated) {
    if (isParent) {
      initialRouteName = 'ParentDashboard';
    } else if (isChild) {
      initialRouteName = 'ChildDashboard';
    }
  }

  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerShown: false,
      }}
    >
      {!isAuthenticated ? (
        // Auth screens
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      ) : isParent ? (
        // Parent screens
        <>
          <Stack.Screen name="ParentDashboard" component={ParentDashboard} />
          <Stack.Screen name="AddChild" component={AddChildScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
        </>
      ) : isChild ? (
        // Child screens
        <>
          <Stack.Screen name="ChildDashboard" component={ChildDashboard} />
          <Stack.Screen name="LearnSigns" component={LearnSigns} />
          <Stack.Screen name="PlayGame" component={PlayGame} />
        </>
      ) : (
        // Fallback to login if role is unknown
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="auto" />
        <AppNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}

