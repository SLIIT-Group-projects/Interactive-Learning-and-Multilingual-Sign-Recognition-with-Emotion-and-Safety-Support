import apiService from './api.service';

/**
 * Notification Service
 * Handles fetching and managing notifications for parents
 */

export interface Notification {
  id: string;
  parentId: string;
  type: string;
  title: string;
  message: string;
  hazardType?: string;
  childUserId?: string;
  childName?: string;
  location?: any;
  locationText?: string; // Formatted location string for display
  soundId?: string;
  priority?: number;
  timestamp: string;
  read: boolean;
  createdAt?: string;
  updatedAt?: string;
}

class NotificationService {
  /**
   * Get all notifications for a parent
   */
  async getNotifications(parentId: string, params?: {
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<Notification[]> {
    try {
      const queryParams: any = {
        parentId,
        sortBy: 'timestamp',
        order: 'desc',
        ...params,
      };

      const response = await apiService.client.get('/api/notifications', {
        params: queryParams,
      });

      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching notifications:', error);
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    try {
      await apiService.client.patch(`/api/notifications/${notificationId}`, {
        read: true,
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a parent
   */
  async markAllAsRead(parentId: string): Promise<void> {
    try {
      await apiService.client.patch('/api/notifications/mark-all-read', {
        parentId,
      });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Delete a notification
   */
  async deleteNotification(notificationId: string): Promise<void> {
    try {
      await apiService.client.delete(`/api/notifications/${notificationId}`);
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw error;
    }
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(parentId: string): Promise<number> {
    try {
      const notifications = await this.getNotifications(parentId, {
        unreadOnly: true,
        limit: 1000, // Get all unread
      });
      return notifications.length;
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;
