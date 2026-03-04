import express from 'express';
import { db } from '../firebase/admin.js';

const router = express.Router();
const NOTIFICATIONS_COLLECTION = 'notifications';

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

    let query = db.collection(NOTIFICATIONS_COLLECTION)
      .where('parentId', '==', parentId);

    if (unreadOnly === 'true') {
      query = query.where('read', '==', false);
    }

    // Fetch all matching documents
    const snapshot = await query.get();

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
    const paginated = notifications.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      success: true,
      data: paginated,
      total: notifications.length,
    });
  } catch (error) {
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

export default router;
