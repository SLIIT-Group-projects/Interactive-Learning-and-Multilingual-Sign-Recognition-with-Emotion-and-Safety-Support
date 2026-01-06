import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import './global.css';
import ChildDashboard from './screens/ChildDashboard';
import LearnSigns from './screens/LearnSigns';
import PlayGame from './screens/PlayGame';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator
        initialRouteName="ChildDashboard"
        screenOptions={{
          headerShown: false, // We're using custom headers in our screens
        }}
      >
        <Stack.Screen name="ChildDashboard" component={ChildDashboard} />
        <Stack.Screen name="LearnSigns" component={LearnSigns} />
        <Stack.Screen name="PlayGame" component={PlayGame} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

