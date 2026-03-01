import apiService from './api.service';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

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
 * Handles fetching and managing hazard alerts from the database
 */

export interface HazardAlert {
  id: string;
  userId: string | null;
  type: string;
  confidence: number;
  timestamp: string;
  location: any;
  context: any;
  priority: number;
  isHazard: boolean;
  status: string;
  metadata?: {
    processingTime?: number;
    detectionsCount?: number;
    [key: string]: any;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface HazardStats {
  total: number;
  byType: Record<string, number>;
  hazards: number;
  averageConfidence: number;
  byStatus: Record<string, number>;
}

class HazardAlertService {
  /**
   * Get all hazard alerts with optional filtering
   */
  async getHazardAlerts(params?: {
    userId?: string;
    type?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<HazardAlert[]> {
    try {
      const queryParams: any = {
        isHazard: 'true',
        sortBy: 'timestamp',
        order: 'desc',
        ...params,
      };

      const response = await apiService.client.get('/api/sounds', {
        params: queryParams,
      });

      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching hazard alerts:', error);
      throw error;
    }
  }

  /**
   * Get a specific hazard alert by ID
   */
  async getHazardAlert(id: string): Promise<HazardAlert> {
    try {
      const response = await apiService.client.get(`/api/sounds/${id}`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching hazard alert:', error);
      throw error;
    }
  }

  /**
   * Get hazard statistics summary
   */
  async getHazardStats(params?: {
    userId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<HazardStats> {
    try {
      const response = await apiService.client.get('/api/sounds/stats/summary', {
        params: {
          ...params,
          isHazard: 'true',
        },
      });

      return response.data.data;
    } catch (error) {
      console.error('Error fetching hazard stats:', error);
      throw error;
    }
  }

  /**
   * Update hazard alert status
   */
  async updateAlertStatus(id: string, status: string): Promise<HazardAlert> {
    try {
      const response = await apiService.client.patch(`/api/sounds/${id}`, {
        status,
      });
      return response.data.data;
    } catch (error) {
      console.error('Error updating alert status:', error);
      throw error;
    }
  }

  /**
   * Delete a hazard alert
   */
  async deleteAlert(id: string): Promise<void> {
    try {
      await apiService.client.delete(`/api/sounds/${id}`);
    } catch (error) {
      console.error('Error deleting alert:', error);
      throw error;
    }
  }

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
