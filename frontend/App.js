import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import './global.css';
import { AuthProvider, HazardDetectionProvider } from './src/contexts';
import { AppNavigator } from './src/navigation';

const navigationRef = createNavigationContainerRef();

export default function App() {
  return (
    <AuthProvider>
      <HazardDetectionProvider>
        <NavigationContainer ref={navigationRef}>
          <StatusBar style="auto" />
          <AppNavigator navigationRef={navigationRef} />
        </NavigationContainer>
      </HazardDetectionProvider>
    </AuthProvider>
  );
}

