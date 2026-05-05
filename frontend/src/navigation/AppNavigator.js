import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, Modal, Text, TouchableOpacity, Linking, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { LoginScreen, RegisterScreen } from '../screens/auth';
import { ParentDashboard, AddChildScreen } from '../screens/parent';
import LearningProgressScreen from '../screens/parent/LearningProgressScreen';
import EmotionDashboardScreen from '../screens/parent/EmotionDashboardScreen';
import { ChildDashboard, LearnSigns, PlayGame } from '../screens/child';
import GameSelectScreen from '../screens/child/GameSelectScreen';
import PlayGameTimed from '../screens/child/PlayGameTimed';
import PlayWordGame from '../screens/child/PlayWordGame';
import StoriesListScreen from '../screens/child/StoriesListScreen';
import StoryReadingScreen from '../screens/child/StoryReadingScreen';
import { HazardDetectionScreen } from '../screens/common';
import PlacesScreen from '../screens/parent/PlacesScreen';
import HazardHistoryScreen from '../screens/parent/HazardHistoryScreen';
import ParentAlertDetailsScreen from '../screens/parent/ParentAlertDetailsScreen';
import SignDetectionScreen from '../../app/(tabs)/sign-detection';
import notificationService from '../../services/notification.service';
import hazardAlertService from '../../services/hazardAlert.service';
import { registerPushToken, setupNotificationListener } from '../services/pushNotification.service';
import GlobalHazardAlert from '../components/common/GlobalHazardAlert';


const Stack = createNativeStackNavigator();

// Navigation component that handles role-based routing
export default function AppNavigator({ navigationRef }) {
  const { userData, loading, isAuthenticated, isParent, isChild } = useAuth();
  const [criticalOverlayAlert, setCriticalOverlayAlert] = useState(null);
  const shownCriticalNotificationIdsRef = useRef(new Set());
  const navigateToHazardHistory = useCallback((...args) => {
    if (navigationRef?.current?.isReady?.()) {
      navigationRef.current.navigate(...args);
    }
  }, [navigationRef]);
  const isCheckingNotificationsRef = useRef(false);

  const isCriticalNotification = (notification) => {
    return notification?.type === 'critical_hazard_alert' || Number(notification?.priority || 0) >= 9;
  };

  /**
   * One-time check for notifications to populate seen IDs
   */
  const initializeSeenNotifications = async () => {
    if (!userData?.uid || isCheckingNotificationsRef.current) return;

    isCheckingNotificationsRef.current = true;
    try {
      const notifications = await notificationService.getNotifications(userData.uid, {
        unreadOnly: true,
        limit: 20,
      });

      notifications.forEach((item) => {
        shownCriticalNotificationIdsRef.current.add(item.id);
      });
    } catch (error) {
      console.error('Error initializing seen notifications:', error);
    } finally {
      isCheckingNotificationsRef.current = false;
    }
  };

  useEffect(() => {
    shownCriticalNotificationIdsRef.current = new Set();
    setCriticalOverlayAlert(null);
  }, [userData?.uid]);

  useEffect(() => {
    if (!isAuthenticated || !isParent || !userData?.uid) return undefined;

    // Register for push notifications
    registerPushToken(userData.uid).catch((error) => {
      if (!error?.message?.includes('projectId')) {
        console.error('Error registering push token:', error);
      }
    });

    // Populate initially seen notifications to avoid old alerts popping up
    initializeSeenNotifications();

    // Subscribe to real-time notifications
    const unsubscribeNotifications = notificationService.subscribeToNotifications(
      userData.uid,
      (notifications) => {
        // Handle incoming critical notifications
        const newestUnseenCritical = notifications.find(
          (item) =>
            isCriticalNotification(item) &&
            !shownCriticalNotificationIdsRef.current.has(item.id)
        );

        if (newestUnseenCritical) {
          shownCriticalNotificationIdsRef.current.add(newestUnseenCritical.id);
          setCriticalOverlayAlert(newestUnseenCritical);
        }

        // Keep seen IDs updated
        notifications.forEach(item => {
          if (isCriticalNotification(item)) {
            shownCriticalNotificationIdsRef.current.add(item.id);
          }
        });
      },
      { unreadOnly: true, limit: 10 }
    );

    // Set up Expo notification listeners
    const cleanupNotificationListener = setupNotificationListener(
      { navigate: navigateToHazardHistory },
      {
        onCriticalAlert: (incomingAlert) => {
          if (!incomingAlert?.id) return;
          if (shownCriticalNotificationIdsRef.current.has(incomingAlert.id)) return;
          shownCriticalNotificationIdsRef.current.add(incomingAlert.id);
          setCriticalOverlayAlert(incomingAlert);
        },
      }
    );

    return () => {
      cleanupNotificationListener?.();
      unsubscribeNotifications?.();
    };
  }, [isAuthenticated, isParent, userData?.uid, navigateToHazardHistory]);

  useEffect(() => {
    if (criticalOverlayAlert) {
      // Trigger a strong continuous vibration for the parent when a critical alert is shown
      hazardAlertService.startContinuousVibration('critical');
    } else {
      hazardAlertService.stopAlert();
    }

    return () => {
      hazardAlertService.stopAlert();
    };
  }, [criticalOverlayAlert]);

  const handleDismissCriticalOverlay = () => {
    setCriticalOverlayAlert(null);
  };

  const handleOpenCriticalAlert = async () => {
    const alertToOpen = criticalOverlayAlert;
    setCriticalOverlayAlert(null);
    if (!alertToOpen) return;

    if (alertToOpen.id && !alertToOpen.read) {
      try {
        await notificationService.markAsRead(alertToOpen.id);
      } catch (error) {
        console.error('Error marking critical notification as read:', error);
      }
    }

    navigateToHazardHistory('ParentAlertDetails', {
      notificationId: alertToOpen?.id || null,
      alertData: alertToOpen || null,
    });
  };

  const getMapsUrlFromAlert = (alertData) => {
    const location = alertData?.location;

    // GeoJSON format: { coordinates: [longitude, latitude] }
    if (
      location?.coordinates &&
      Array.isArray(location.coordinates) &&
      location.coordinates.length >= 2
    ) {
      const [lng, lat] = location.coordinates;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
      }
    }

    // Flat lat/lng format: { latitude, longitude }
    if (
      Number.isFinite(location?.latitude) &&
      Number.isFinite(location?.longitude)
    ) {
      return `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
    }

    // Parse coordinates from location text like "6.123456, 79.987654"
    const locationText = alertData?.locationText || '';
    const coordinateMatch = locationText.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (coordinateMatch) {
      const lat = Number.parseFloat(coordinateMatch[1]);
      const lng = Number.parseFloat(coordinateMatch[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
      }
    }

    if (locationText.trim()) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationText)}`;
    }

    return null;
  };

  const handleOpenLocationInMaps = async () => {
    const mapsUrl = getMapsUrlFromAlert(criticalOverlayAlert);
    if (!mapsUrl) {
      Alert.alert('Location Unavailable', 'No location information is available for this alert.');
      return;
    }

    try {
      const canOpen = await Linking.canOpenURL(mapsUrl);
      if (!canOpen) {
        Alert.alert('Unable to Open Maps', 'Could not open maps on this device.');
        return;
      }
      await Linking.openURL(mapsUrl);
    } catch (error) {
      console.error('Error opening maps URL:', error);
      Alert.alert('Error', 'Failed to open maps.');
    }
  };

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
    <>
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
            <Stack.Screen name="EmotionDashboard" component={EmotionDashboardScreen} />
            <Stack.Screen name="ParentPlaces" component={PlacesScreen} />
            <Stack.Screen name="HazardHistory" component={HazardHistoryScreen} />
            <Stack.Screen name="ParentAlertDetails" component={ParentAlertDetailsScreen} />
            <Stack.Screen name="HazardDetection" component={HazardDetectionScreen} />
            <Stack.Screen name="SignDetection" component={SignDetectionScreen} />
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
            <Stack.Screen name="PlayWordGame" component={PlayWordGame} />
            <Stack.Screen name="StoriesList" component={StoriesListScreen} />
            <Stack.Screen name="StoryReading" component={StoryReadingScreen} />
            <Stack.Screen name="HazardDetection" component={HazardDetectionScreen} />
          </>
        ) : (
          // Fallback to login if role is unknown
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>

      <Modal
        transparent
        animationType="fade"
        visible={isAuthenticated && isParent && !!criticalOverlayAlert}
        onRequestClose={handleDismissCriticalOverlay}
      >
        <View className="flex-1 bg-black/70 justify-center items-center px-6">
          <View className="bg-white rounded-3xl p-6 w-full max-w-md border-2 border-red-500">
            <View className="items-center">
              <View className="bg-red-100 rounded-full p-4 mb-3">
                <MaterialIcons name="warning-amber" size={42} color="#dc2626" />
              </View>
              <Text className="text-2xl font-bold text-red-700 text-center">
                Critical Safety Alert
              </Text>
              <Text className="text-base text-gray-700 mt-3 text-center">
                {criticalOverlayAlert?.message || 'Your child may be unsafe. Please check immediately.'}
              </Text>
              {criticalOverlayAlert?.childName ? (
                <Text className="text-sm font-semibold text-gray-700 mt-3">
                  Child: {criticalOverlayAlert.childName}
                </Text>
              ) : null}
              {criticalOverlayAlert?.locationText ? (
                <Text className="text-xs text-gray-500 mt-1 text-center">
                  Location: {criticalOverlayAlert.locationText}
                </Text>
              ) : null}
            </View>

            <View className="flex-row mt-6">
              <TouchableOpacity
                onPress={handleOpenLocationInMaps}
                className="flex-1 bg-blue-500 rounded-xl py-3 mr-2"
              >
                <Text className="text-center font-semibold text-white">Open Map</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDismissCriticalOverlay}
                className="flex-1 bg-gray-200 rounded-xl py-3 mx-1"
              >
                <Text className="text-center font-semibold text-gray-700">Dismiss</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleOpenCriticalAlert}
                className="flex-1 bg-red-500 rounded-xl py-3 ml-2"
              >
                <Text className="text-center font-semibold text-white">View More Details</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <GlobalHazardAlert />
    </>
  );
}
