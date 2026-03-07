import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { LoginScreen, RegisterScreen } from '../screens/auth';
import { ParentDashboard, AddChildScreen } from '../screens/parent';
import LearningProgressScreen from '../screens/parent/LearningProgressScreen';
import { ChildDashboard, LearnSigns, PlayGame } from '../screens/child';
import GameSelectScreen from '../screens/child/GameSelectScreen';
import PlayGameTimed from '../screens/child/PlayGameTimed';
import { HazardDetectionScreen } from '../screens/common';
import PlacesScreen from '../screens/parent/PlacesScreen';
import HazardHistoryScreen from '../screens/parent/HazardHistoryScreen';


const Stack = createNativeStackNavigator();

// Navigation component that handles role-based routing
export default function AppNavigator() {
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
          <Stack.Screen name="LearningProgress" component={LearningProgressScreen} />
          <Stack.Screen name="ParentPlaces" component={PlacesScreen} />
          <Stack.Screen name="HazardHistory" component={HazardHistoryScreen} />
          <Stack.Screen name="HazardDetection" component={HazardDetectionScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />

        </>
      ) : isChild ? (
        // Child screens
        <>
          <Stack.Screen name="ChildDashboard" component={ChildDashboard} />
          <Stack.Screen name="GameSelect" component={GameSelectScreen} />
          <Stack.Screen name="LearnSigns" component={LearnSigns} />
          <Stack.Screen name="PlayGame" component={PlayGame} />
          <Stack.Screen name="PlayGameTimed" component={PlayGameTimed} />
          <Stack.Screen name="HazardDetection" component={HazardDetectionScreen} />
        </>

      ) : (
        // Fallback to login if role is unknown
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

