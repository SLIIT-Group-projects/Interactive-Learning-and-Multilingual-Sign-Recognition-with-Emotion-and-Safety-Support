import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, Modal, Text, TouchableOpacity, Linking, Alert, Animated, Easing } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
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
import ParentAlertDetailsScreen from '../screens/parent/ParentAlertDetailsScreen';
import notificationService from '../../services/notification.service';
import { registerPushToken, setupNotificationListener } from '../services/pushNotification.service';


const Stack = createNativeStackNavigator();
const PARENT_ROUTE_NAMES = new Set([
  'ParentDashboard',
  'AddChild',
  'LearningProgress',
  'ParentPlaces',
  'HazardHistory',
  'ParentAlertDetails',
  'HazardDetection',
]);

const getHazardVisual = (hazardType = '') => {
  const normalizedType = String(hazardType || '').toLowerCase();

  if (normalizedType.includes('fire') || normalizedType.includes('smoke')) {
    return { emoji: '🔥', icon: 'local-fire-department', color: '#dc2626', label: 'Fire Risk' };
  }
  if (normalizedType.includes('glass')) {
    return { emoji: '💥', icon: 'broken-image', color: '#f97316', label: 'Glass Breaking' };
  }
  if (normalizedType.includes('alarm')) {
    return { emoji: '🚨', icon: 'sensors', color: '#ef4444', label: 'Alarm Detected' };
  }
  if (normalizedType.includes('horn') || normalizedType.includes('car')) {
    return { emoji: '🚗', icon: 'directions-car', color: '#f59e0b', label: 'Traffic Hazard' };
  }
  if (normalizedType.includes('dog')) {
    return { emoji: '🐕', icon: 'pets', color: '#8b5cf6', label: 'Aggressive Animal Sound' };
  }

  return { emoji: '⚠️', icon: 'warning-amber', color: '#dc2626', label: 'Critical Hazard' };
};

// Navigation component that handles role-based routing
export default function AppNavigator({ navigationRef }) {
  const { userData, loading, isAuthenticated, isParent, isChild } = useAuth();
  const [criticalOverlayAlert, setCriticalOverlayAlert] = useState(null);
  const shownCriticalNotificationIdsRef = useRef(new Set());
  const hazardPulseAnim = useRef(new Animated.Value(1)).current;
  const navigateToHazardHistory = useCallback((...args) => {
    if (navigationRef?.current?.isReady?.()) {
      navigationRef.current.navigate(...args);
    }
  }, [navigationRef]);
  const isCheckingNotificationsRef = useRef(false);
  const notificationPollIntervalRef = useRef(null);

  const isParentRouteActive = () => {
    const currentRouteName = navigationRef?.current?.getCurrentRoute?.()?.name;
    if (!currentRouteName) return true; // During initial navigation setup, allow.
    return PARENT_ROUTE_NAMES.has(currentRouteName);
  };

  const isCriticalNotification = (notification) => {
    return notification?.type === 'critical_hazard_alert' || Number(notification?.priority || 0) >= 9;
  };

  const checkForCriticalNotifications = async ({ initializeOnly = false } = {}) => {
    if (!userData?.uid || !isParent || !isParentRouteActive() || isCheckingNotificationsRef.current) return;

    isCheckingNotificationsRef.current = true;
    try {
      const notifications = await notificationService.getNotifications(userData.uid, {
        unreadOnly: true,
        limit: 20,
      });

      if (initializeOnly) {
        notifications.forEach((item) => {
          shownCriticalNotificationIdsRef.current.add(item.id);
        });
        return;
      }

      const newestUnseenCritical = notifications.find(
        (item) =>
          isCriticalNotification(item) &&
          !shownCriticalNotificationIdsRef.current.has(item.id)
      );

      if (newestUnseenCritical) {
        shownCriticalNotificationIdsRef.current.add(newestUnseenCritical.id);
        setCriticalOverlayAlert(newestUnseenCritical);
      }
    } catch (error) {
      console.error('Error checking critical notifications:', error);
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

    registerPushToken(userData.uid).catch((error) => {
      console.error('Error registering push token:', error);
    });

    checkForCriticalNotifications({ initializeOnly: true });

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

    // Extra safety: never keep multiple poll loops alive.
    if (notificationPollIntervalRef.current) {
      clearInterval(notificationPollIntervalRef.current);
      notificationPollIntervalRef.current = null;
    }

    notificationPollIntervalRef.current = setInterval(() => {
      checkForCriticalNotifications();
    }, 5000);

    return () => {
      cleanupNotificationListener?.();
      if (notificationPollIntervalRef.current) {
        clearInterval(notificationPollIntervalRef.current);
        notificationPollIntervalRef.current = null;
      }
    };
  }, [isAuthenticated, isParent, userData?.uid, navigateToHazardHistory]);

  useEffect(() => {
    if (!criticalOverlayAlert) {
      hazardPulseAnim.setValue(1);
      return undefined;
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(hazardPulseAnim, {
          toValue: 1.12,
          duration: 550,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(hazardPulseAnim, {
          toValue: 1,
          duration: 550,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [criticalOverlayAlert, hazardPulseAnim]);

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

  const hazardVisual = getHazardVisual(
    criticalOverlayAlert?.hazardType || criticalOverlayAlert?.type || ''
  );

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
            <Stack.Screen name="ParentPlaces" component={PlacesScreen} />
            <Stack.Screen name="HazardHistory" component={HazardHistoryScreen} />
            <Stack.Screen name="ParentAlertDetails" component={ParentAlertDetailsScreen} />
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

      <Modal
        transparent
        animationType="fade"
        visible={isAuthenticated && isParent && !!criticalOverlayAlert}
        onRequestClose={handleDismissCriticalOverlay}
      >
        <View className="flex-1 bg-black/70 justify-center items-center px-6">
          <View className="bg-white rounded-3xl p-6 w-full max-w-md border-2 border-red-500">
            <View className="items-center">
              <Animated.View
                style={{
                  transform: [{ scale: hazardPulseAnim }],
                  marginBottom: 12,
                }}
              >
                <View
                  style={{
                    backgroundColor: `${hazardVisual.color}22`,
                    borderColor: hazardVisual.color,
                    borderWidth: 2,
                    borderRadius: 999,
                    padding: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 30, marginBottom: 2 }}>{hazardVisual.emoji}</Text>
                  <MaterialIcons name={hazardVisual.icon} size={34} color={hazardVisual.color} />
                </View>
              </Animated.View>
              <Text style={{ color: hazardVisual.color, fontWeight: '700', marginBottom: 6 }}>
                {hazardVisual.label}
              </Text>
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
    </>
  );
}

