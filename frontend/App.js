import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import './global.css';
import { AuthProvider } from './src/contexts/AuthContext';
import { AppNavigator } from './src/navigation';

const navigationRef = createNavigationContainerRef();

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer ref={navigationRef}>
        <StatusBar style="auto" />
        <AppNavigator navigationRef={navigationRef} />
      </NavigationContainer>
    </AuthProvider>
  );
}

