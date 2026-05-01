import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { Vibration, Platform } from 'react-native';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Vibration patterns for different hazard levels
 * [wait, vibrate, wait, vibrate, ...]
 */
export const VIBRATION_PATTERNS = {
  // Ultra-strong pulsing pattern for critical alerts (Long vibrations, tiny gaps)
  critical: [0, 1200, 80, 1200, 80, 1200, 80, 1200],
  // Strong double-pulse pattern for high priority
  high: [0, 600, 120, 600, 120, 600],
  // Standard pulse for medium priority
  medium: [0, 400, 200, 400],
  // Subtle pulse for low priority
  low: [0, 200],
};

/**
 * Hazard Alert Service
 * Handles alert triggering (haptics and notifications) for hazard detection
 * Note: For database operations, use hazardDatabase.service.ts
 */
class HazardAlertService {
  private vibrationInterval: NodeJS.Timeout | null = null;

  /**
   * Trigger a one-time alert (haptic and notification)
   */
  async triggerAlert(hazard: any): Promise<void> {
    try {
      const { type, priority } = hazard;
      const isCritical = priority >= 9;

      // 1. Trigger Intense Haptics
      if (isCritical) {
        // Multi-stage haptic feedback for critical hazards
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setTimeout(async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }, 300);
        setTimeout(async () => {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }, 600);
      } else if (priority >= 7) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 400);
      } else {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      // 2. Send Local Notification
      const title = isCritical ? '🚨 CRITICAL ALERT' : '⚠️ Hazard Detected';
      const body = `Detected: ${this.formatHazardType(type)}`;

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { hazardId: hazard.id, type },
          sound: true,
          vibrate: VIBRATION_PATTERNS[isCritical ? 'critical' : priority >= 7 ? 'high' : 'medium'],
          priority: isCritical ? Notifications.AndroidNotificationPriority.MAX : Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // send immediately
      });
    } catch (error) {
      console.error('Error triggering alert:', error);
    }
  }

  /**
   * Start a continuous vibration loop (mostly for iOS consistency)
   */
  async startContinuousVibration(level: 'critical' | 'high' | 'medium' = 'critical'): Promise<void> {
    await this.stopAlert(); // Clear any existing

    const pattern = VIBRATION_PATTERNS[level];

    if (Platform.OS === 'android') {
      // Android supports repeating patterns natively
      Vibration.vibrate(pattern, true);
    } else {
      // iOS: Vibration.vibrate() is fixed-length (~400ms). 
      // We use a combination of Vibration and Haptics for a "strong" feel.
      const triggerVibration = async () => {
        try {
          Vibration.vibrate(); // Fixed 400ms on iOS
          
          if (level === 'critical') {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); // Triple pulse
            setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 200);
            setTimeout(() => Vibration.vibrate(), 500); // Second pulse
          } else if (level === 'high') {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 300);
          } else {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
        } catch (err) {
          console.warn('iOS Haptics error:', err);
        }
      };

      // Faster loop for critical, slower for others
      const interval = level === 'critical' ? 1000 : 1500;
      
      triggerVibration();
      this.vibrationInterval = setInterval(triggerVibration, interval);
    }
  }

  /**
   * Stop any ongoing alerts and vibrations
   */
  async stopAlert(): Promise<void> {
    try {
      if (this.vibrationInterval) {
        clearInterval(this.vibrationInterval);
        this.vibrationInterval = null;
      }
      Vibration.cancel();
      await Notifications.dismissAllNotificationsAsync();
    } catch (error) {
      console.error('Error stopping alert:', error);
    }
  }

  /**
   * Format hazard type for display
   */
  private formatHazardType(type: string): string {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

export const hazardAlertService = new HazardAlertService();
export default hazardAlertService;
