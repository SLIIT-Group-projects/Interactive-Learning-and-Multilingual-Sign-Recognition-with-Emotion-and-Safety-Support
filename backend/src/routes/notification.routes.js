import express from 'express';
import { db } from '../firebase/admin.js';

const router = express.Router();
const NOTIFICATIONS_COLLECTION = 'notifications';
const USERS_COLLECTION = 'users';
const MAX_NOTIFICATION_LIMIT = 200;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const isQuotaExceededError = (error) => {
  const code = error?.code;
  const message = String(error?.message || '').toLowerCase();
  return code === 8 || code === 'resource-exhausted' || message.includes('resource_exhausted') || message.includes('quota exceeded');
};

/**
 * GET /api/notifications
 * Get notifications for a parent
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      parentId,
      unreadOnly,
      limit = 50,
      offset = 0,
      sortBy = 'timestamp',
      order = 'desc',
    } = req.query;

    if (!parentId) {
      return res.status(400).json({
        error: 'parentId is required',
      });
    }

    const safeLimit = Math.min(parsePositiveInt(limit, 50), MAX_NOTIFICATION_LIMIT);
    const safeOffset = parsePositiveInt(offset, 0);
    const fetchSize = Math.min(safeLimit + safeOffset, MAX_NOTIFICATION_LIMIT);

    let query = db.collection(NOTIFICATIONS_COLLECTION)
      .where('parentId', '==', parentId);

    if (unreadOnly === 'true') {
      query = query.where('read', '==', false);
    }

    // Fetch only a bounded number of documents to avoid large Firestore reads.
    const snapshot = await query.limit(fetchSize).get();

    // Convert to array and sort in memory
    let notifications = [];
    snapshot.forEach((doc) => {
      notifications.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    // Sort by timestamp
    notifications.sort((a, b) => {
      const aTime = new Date(a.timestamp || a.createdAt || 0).getTime();
      const bTime = new Date(b.timestamp || b.createdAt || 0).getTime();
      return order === 'asc' ? aTime - bTime : bTime - aTime;
    });

    // Apply pagination
    const paginated = notifications.slice(safeOffset, safeOffset + safeLimit);

    res.json({
      success: true,
      data: paginated,
      total: notifications.length,
    });
  } catch (error) {
    if (isQuotaExceededError(error)) {
      return res.status(429).json({
        error: {
          message: 'Notification service is temporarily rate-limited. Please retry shortly.',
          code: 'RESOURCE_EXHAUSTED',
          retryAfterMs: 60000,
        },
      });
    }
    next(error);
  }
});

/**
 * PATCH /api/notifications/:id
 * Update a notification (e.g., mark as read)
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const notificationRef = db.collection(NOTIFICATIONS_COLLECTION).doc(id);
    const notificationDoc = await notificationRef.get();

    if (!notificationDoc.exists) {
      return res.status(404).json({
        error: 'Notification not found',
      });
    }

    await notificationRef.update({
      ...updates,
      updatedAt: new Date(),
    });

    const updatedDoc = await notificationRef.get();
    res.json({
      success: true,
      data: {
        id: updatedDoc.id,
        ...updatedDoc.data(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/notifications/mark-all-read
 * Mark all notifications as read for a parent
 */
router.patch('/mark-all-read', async (req, res, next) => {
  try {
    const { parentId } = req.body;

    if (!parentId) {
      return res.status(400).json({
        error: 'parentId is required',
      });
    }

    const snapshot = await db.collection(NOTIFICATIONS_COLLECTION)
      .where('parentId', '==', parentId)
      .where('read', '==', false)
      .get();

    const batch = db.batch();
    snapshot.forEach((doc) => {
      batch.update(doc.ref, {
        read: true,
        updatedAt: new Date(),
      });
    });

    await batch.commit();

    res.json({
      success: true,
      message: `Marked ${snapshot.size} notifications as read`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const notificationRef = db.collection(NOTIFICATIONS_COLLECTION).doc(id);
    const notificationDoc = await notificationRef.get();

    if (!notificationDoc.exists) {
      return res.status(404).json({
        error: 'Notification not found',
      });
    }

    await notificationRef.delete();

    res.json({
      success: true,
      message: 'Notification deleted',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/notifications/register-push-token
 * Register push token (FCM or Expo) for a parent to receive push notifications
 * Supports both FCM tokens and Expo push tokens
 */
router.post('/register-push-token', async (req, res, next) => {
  try {
    const { userId, pushToken } = req.body;
    // Support legacy 'fcmToken' parameter name
    const token = pushToken || req.body.fcmToken || req.body.expoPushToken;

    if (!userId || !token) {
      return res.status(400).json({
        error: 'userId and pushToken (or fcmToken/expoPushToken) are required',
      });
    }

    // Verify user exists and is a parent
    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    const userData = userDoc.data();
    if (userData.role !== 'parent') {
      return res.status(403).json({
        error: 'Only parents can register push tokens',
      });
    }

    // Determine token type and update accordingly
    const isExpoToken = token.startsWith('ExponentPushToken');
    const updateData = {
      updatedAt: new Date(),
    };

    if (isExpoToken) {
      updateData.expoPushToken = token;
      updateData.expoPushTokenUpdatedAt = new Date();
      console.log(`✅ Expo push token registered for parent ${userId}`);
    } else {
      updateData.fcmToken = token;
      updateData.fcmTokenUpdatedAt = new Date();
      console.log(`✅ FCM token registered for parent ${userId}`);
    }

    await userRef.update(updateData);

    res.json({
      success: true,
      message: `${isExpoToken ? 'Expo' : 'FCM'} push token registered successfully`,
      tokenType: isExpoToken ? 'expo' : 'fcm',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/notifications/register-fcm-token
 * Register FCM token for a parent to receive push notifications
 * @deprecated Use /register-push-token instead (supports both FCM and Expo)
 */
router.post('/register-fcm-token', async (req, res, next) => {
  // Use the same logic as register-push-token for backward compatibility
  req.body.pushToken = req.body.fcmToken;
  const { userId, pushToken } = req.body;
  const token = pushToken || req.body.fcmToken;

  if (!userId || !token) {
    return res.status(400).json({
      error: 'userId and fcmToken are required',
    });
  }

  try {
    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    const userData = userDoc.data();
    if (userData.role !== 'parent') {
      return res.status(403).json({
        error: 'Only parents can register FCM tokens',
      });
    }

    const isExpoToken = token.startsWith('ExponentPushToken');
    const updateData = {
      updatedAt: new Date(),
    };

    if (isExpoToken) {
      updateData.expoPushToken = token;
      updateData.expoPushTokenUpdatedAt = new Date();
    } else {
      updateData.fcmToken = token;
      updateData.fcmTokenUpdatedAt = new Date();
    }

    await userRef.update(updateData);

    res.json({
      success: true,
      message: 'Push token registered successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
