import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Hazard Alert Service
 * Handles alert triggering (haptics and notifications) for hazard detection
 * Note: For database operations, use hazardDatabase.service.ts
 */
class HazardAlertService {
  /**
   * Trigger an alert (haptic and notification)
   */
  async triggerAlert(hazard: any): Promise<void> {
    try {
      const { type, priority } = hazard;
      const isCritical = priority >= 9;

      // 1. Trigger Haptics
      if (isCritical) {
        // More intense haptics for critical hazards
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        // Repeat after a short delay for urgency
        setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error), 500);
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
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
          priority: isCritical ? Notifications.AndroidNotificationPriority.MAX : Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // send immediately
      });
    } catch (error) {
      console.error('Error triggering alert:', error);
    }
  }

  /**
   * Stop any ongoing alerts
   */
  async stopAlert(): Promise<void> {
    try {
      // For now, we just clear notifications
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
