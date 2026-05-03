import apiService from './api.service';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Firestore
} from 'firebase/firestore';
import { db } from '../src/services/firebase/firebaseConfig';

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
  responses?: Array<{
    question?: string;
    answer?: boolean;
  }>;
  childConfirmedSafe?: boolean;
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

  /**
   * Get a single notification by ID for a parent
   */
  async getNotificationById(parentId: string, notificationId: string): Promise<Notification | null> {
    try {
      const notifications = await this.getNotifications(parentId, {
        limit: 200,
      });
      return notifications.find((item) => item.id === notificationId) || null;
    } catch (error) {
      console.error('Error getting notification by ID:', error);
      return null;
    }
  }

  /**
   * Subscribe to notifications for a parent in real-time
   * @param parentId Parent user ID
   * @param callback Callback function with notifications array
   * @param params Query parameters
   * @returns Unsubscribe function
   */
  subscribeToNotifications(
    parentId: string,
    callback: (notifications: Notification[]) => void,
    params: { unreadOnly?: boolean; limit?: number } = {}
  ): () => void {
    if (!db) {
      console.error('Firestore not initialized');
      return () => { };
    }

    try {
      const notificationsRef = collection(db as Firestore, 'notifications');
      let q = query(
        notificationsRef,
        where('parentId', '==', parentId),
        orderBy('timestamp', 'desc'),
        limit(params.limit || 50)
      );

      if (params.unreadOnly) {
        // Note: Firestore might require a composite index for this query (parentId == X AND read == false ORDER BY timestamp DESC)
        // If it fails due to index, we might need to filter in memory or tell the user to create index
        q = query(q, where('read', '==', false));
      }

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const notifications: Notification[] = [];
        snapshot.forEach((doc) => {
          notifications.push({
            id: doc.id,
            ...doc.data(),
          } as Notification);
        });
        callback(notifications);
      }, (error) => {
        console.error('Error in notifications snapshot:', error);
        if (error.code === 'permission-denied') {
          console.warn('💡 Tip: This usually means your Firestore security rules are blocking the query or a composite index is missing.');
          console.warn('Check that your rules allow reading the "notifications" collection where parentId == your UID.');
        }
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error subscribing to notifications:', error);
      return () => { };
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;
