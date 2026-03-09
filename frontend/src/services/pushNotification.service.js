import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Alert } from 'react-native';
import apiService from '../../services/api.service';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function resolveExpoProjectId() {
  return (
    process.env.EXPO_PUBLIC_EXPO_PROJECT_ID ||
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId ||
    null
  );
}

/**
 * Register push token for parent
 * @param {string} userId - Parent user ID
 * @returns {Promise<string|null>} Expo push token or null
 */
export async function registerPushToken(userId) {
  try {
    // Check if device supports notifications
    if (!Device.isDevice) {
      console.warn('⚠️ Push notifications only work on physical devices');
      Alert.alert(
        'Push Notifications',
        'Push notifications only work on physical devices, not simulators.'
      );
      return null;
    }

    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('⚠️ Notification permissions not granted');
      Alert.alert(
        'Permission Required',
        'Please enable notifications in your device settings to receive critical alerts.'
      );
      return null;
    }

    // Get Expo push token (projectId must be an Expo EAS UUID, not Firebase project ID)
    const projectId = resolveExpoProjectId();
    if (!projectId) {
      console.warn(
        '⚠️ Expo projectId missing. Skipping push token registration. Set EXPO_PUBLIC_EXPO_PROJECT_ID or expo.extra.eas.projectId.'
      );
      return null;
    }
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });

    const expoPushToken = tokenData.data;
    console.log('📱 Expo Push Token:', expoPushToken);

    // Register token with backend
    try {
      await apiService.post('/notifications/register-push-token', {
        userId: userId,
        pushToken: expoPushToken,
      });
      console.log('✅ Push token registered successfully');
      return expoPushToken;
    } catch (error) {
      console.error('❌ Error registering push token:', error);
      return null;
    }
  } catch (error) {
    console.error('❌ Error getting push token:', error);
    return null;
  }
}

/**
 * Set up notification listener
 * @param {Object} navigation - React Navigation object
 * @returns {Function} Cleanup function
 */
export function setupNotificationListener(navigation, options = {}) {
  const { onCriticalAlert } = options;

  // Handle notification received while app is foregrounded
  const notificationListener = Notifications.addNotificationReceivedListener(notification => {
    console.log('📬 Notification received:', notification);
    const data = notification.request.content.data;
    
    // Show alert for critical alerts
    if (data && data.type === 'critical_hazard_alert') {
      if (typeof onCriticalAlert === 'function') {
        onCriticalAlert({
          id: data.notificationId || `${Date.now()}`,
          type: data.type,
          title: notification.request.content.title || '🚨 Critical Alert',
          message: notification.request.content.body || 'A critical hazard has been detected',
          childName: data.childName,
          locationText: data.locationText,
          priority: Number(data.priority || 9),
          read: false,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      Alert.alert(
        notification.request.content.title || '🚨 Critical Alert',
        notification.request.content.body || 'A critical hazard has been detected',
        [
          {
            text: 'View Details',
            onPress: () => {
              if (navigation && data.notificationId) {
                navigation.navigate('HazardHistory', { 
                  notificationId: data.notificationId 
                });
              }
            },
          },
          { text: 'OK' },
        ]
      );
    }
  });

  // Handle notification tapped
  const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
    console.log('👆 Notification tapped:', response);
    const data = response.notification.request.content.data;
    
    // Navigate to hazard history or notification details
    if (data && data.type === 'critical_hazard_alert' && navigation) {
      if (data.notificationId) {
        navigation.navigate('HazardHistory', { 
          notificationId: data.notificationId 
        });
      } else {
        navigation.navigate('HazardHistory');
      }
    }
  });

  return () => {
    Notifications.removeNotificationSubscription(notificationListener);
    Notifications.removeNotificationSubscription(responseListener);
  };
}

/**
 * Get current notification permissions status
 * @returns {Promise<string>} Permission status ('granted', 'denied', 'undetermined')
 */
export async function getNotificationPermissions() {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/**
 * Request notification permissions
 * @returns {Promise<boolean>} True if granted, false otherwise
 */
export async function requestNotificationPermissions() {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}
