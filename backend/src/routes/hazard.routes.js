import express from 'express';
import multer from 'multer';
import { promises as fs } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { audioToLogMelSpectrogram, prepareSpectrogramForModel } from '../utils/audioProcessor.js';
import { prioritizeHazards, getHazardPriority } from '../utils/hazardPriority.js';
import { convertToWav } from "../utils/audioConverter.js";
import { predictWithModel } from '../utils/modelIntegration.js';
import { db, messaging } from '../firebase/admin.js';
import { createSoundDocument, validateSoundData } from '../models/sound.model.js';


const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SOUNDS_COLLECTION = 'sounds';
const USERS_COLLECTION = 'users';
const NOTIFICATIONS_COLLECTION = 'notifications';
// Minimum confidence threshold for saving detections (increased to reduce false positives)
const MIN_CONFIDENCE_THRESHOLD = parseFloat(process.env.MIN_CONFIDENCE_THRESHOLD || '0.65');
// False positive types to filter out
const FALSE_POSITIVE_TYPES = ['silence', 'background_noise', 'noise', 'static', 'white_noise', 'ambient', 'room_tone'];
// Deduplicate repeated detections/alerts (same user + hazard type within this window)
const SOUND_DEDUP_WINDOW_MS = parseInt(process.env.SOUND_DEDUP_WINDOW_MS || '60000', 10);
const PARENT_ALERT_DEDUP_WINDOW_MS = parseInt(process.env.PARENT_ALERT_DEDUP_WINDOW_MS || '60000', 10);
const CRACKLING_FIRE_CONFIRMATION_FRAMES = parseInt(process.env.CRACKLING_FIRE_CONFIRMATION_FRAMES || '5', 10);
const cracklingFireVotesByUser = new Map();
const PARENT_CRITICAL_MIN_CONFIDENCE = parseFloat(process.env.PARENT_CRITICAL_MIN_CONFIDENCE || '0.80');

function isNightTimeNow() {
  const hour = new Date().getHours();
  return hour >= 22 || hour < 6;
}

function isWhitelistedCriticalTypeForParent(hazardType) {
  const criticalTypes = new Set(['fire_alarm', 'smoke_alarm', 'gun_shot', 'siren']);
  // Keep parity with child screen rule: dog_barking is critical only at night.
  if (isNightTimeNow()) {
    criticalTypes.add('dog_barking');
  }
  return criticalTypes.has(hazardType);
}

function shouldNotifyParentForDetection(detection, priority) {
  const hazardType = String(detection?.type || '').toLowerCase();
  const confidence = Number(detection?.confidence || 0);

  // Parent should only receive truly critical alerts that child would see as critical.
  return (
    priority >= 9 &&
    confidence >= PARENT_CRITICAL_MIN_CONFIDENCE &&
    isWhitelistedCriticalTypeForParent(hazardType)
  );
}

function isCracklingFireMappedToFireAlarm(detection) {
  const hazardType = (detection?.type || '').toLowerCase();
  const originalClass = String(detection?.original_class || detection?.originalClass || '').toLowerCase();
  return hazardType === 'fire_alarm' && originalClass === 'crackling_fire';
}

function updateCracklingFireVote(userId, detections = []) {
  if (!userId) {
    return { matched: false, count: 0, confirmed: false };
  }

  const matched = Array.isArray(detections) && detections.some(isCracklingFireMappedToFireAlarm);
  const previous = cracklingFireVotesByUser.get(userId) || 0;
  const nextCount = matched
    ? Math.min(previous + 1, CRACKLING_FIRE_CONFIRMATION_FRAMES)
    : 0;

  cracklingFireVotesByUser.set(userId, nextCount);

  return {
    matched,
    count: nextCount,
    confirmed: nextCount >= CRACKLING_FIRE_CONFIRMATION_FRAMES,
  };
}

async function hasRecentDuplicateSound(userId, hazardType, dedupWindowMs = SOUND_DEDUP_WINDOW_MS) {
  if (!userId || !hazardType || dedupWindowMs <= 0) return false;

  try {
    const snapshot = await db.collection(SOUNDS_COLLECTION)
      .where('userId', '==', userId)
      .where('type', '==', hazardType)
      .limit(20)
      .get();

    const now = Date.now();
    return snapshot.docs.some((doc) => {
      const data = doc.data() || {};
      const ts = new Date(data.timestamp || data.createdAt || 0).getTime();
      return Number.isFinite(ts) && (now - ts) <= dedupWindowMs;
    });
  } catch (error) {
    console.warn(`⚠️ Error checking duplicate sound for ${userId}/${hazardType}:`, error.message);
    return false;
  }
}

async function hasRecentDuplicateParentAlert(parentId, alertData, dedupWindowMs = PARENT_ALERT_DEDUP_WINDOW_MS) {
  if (!parentId || dedupWindowMs <= 0) return false;

  try {
    const snapshot = await db.collection(NOTIFICATIONS_COLLECTION)
      .where('parentId', '==', parentId)
      .limit(50)
      .get();

    const now = Date.now();
    return snapshot.docs.some((doc) => {
      const data = doc.data() || {};
      if (data.type !== 'critical_hazard_alert') return false;
      if ((data.hazardType || '') !== (alertData.hazardType || '')) return false;
      if ((data.childUserId || '') !== (alertData.childUserId || '')) return false;

      const ts = new Date(data.timestamp || data.createdAt || 0).getTime();
      return Number.isFinite(ts) && (now - ts) <= dedupWindowMs;
    });
  } catch (error) {
    console.warn(`⚠️ Error checking duplicate parent alert for ${parentId}:`, error.message);
    return false;
  }
}

/**
 * Save detected sounds to database
 * Only saves identified hazard alerts (recognized hazard types with sufficient confidence)
 * @param {Array} detections - Array of detection objects
 * @param {Object} context - Context information (userId, location, etc.)
 * @param {string} audioFileUrl - Optional URL/path to audio file
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<Array>} Array of saved sound document IDs
 */
async function saveSoundsToDatabase(detections, context = {}, audioFileUrl = null, metadata = {}) {
  const savedSoundIds = [];

  // Minimum confidence threshold for saving (increased to reduce false positives)
  const MIN_CONFIDENCE_THRESHOLD = parseFloat(process.env.SAVE_CONFIDENCE_THRESHOLD || '0.65');

  try {
    console.log(`💾 Attempting to save ${detections.length} detections to database...`);
    for (const detection of detections) {
      const hazardType = detection.type || 'unknown';
      const confidence = detection.confidence || 0;
      
      // Get base priority from hazard type (from env config)
      const basePriority = getHazardPriority(hazardType);
      // Use calculated priority from detection (set by prioritizeHazards) if available
      const calculatedPriority = detection.priority !== undefined ? detection.priority : basePriority;
      
      // For saving, use base priority to determine if it's critical
      // This ensures critical hazard types (fire_alarm, smoke_alarm, etc.) are saved even if urgency score is low
      const priority = basePriority >= 9 ? basePriority : calculatedPriority;

      console.log(`🔍 Checking detection: ${hazardType} (confidence: ${confidence.toFixed(2)}, basePriority: ${basePriority}, calculatedPriority: ${calculatedPriority}, finalPriority: ${priority})`);

      // Save all identified sounds (not just critical):
      // 1. Must have sufficient confidence
      // 2. Must not be 'unknown' type
      // 3. Must have a valid userId (to associate with user)
      const hasSufficientConfidence = confidence >= MIN_CONFIDENCE_THRESHOLD;
      const isValidType = hazardType !== 'unknown';
      const hasUserId = context.userId !== null && context.userId !== undefined;

      if (!hasSufficientConfidence || !isValidType) {
        console.log(`⏭️ Skipping save - ${hazardType} (confidence: ${confidence.toFixed(2)}, priority: ${priority}) - ${!hasSufficientConfidence ? 'insufficient confidence' : 'invalid type'}`);
        continue;
      }

      if (!hasUserId) {
        console.warn(`⚠️ Warning: Saving sound without userId - ${hazardType}`);
      }

      const isCriticalAlert = (basePriority >= 9 || calculatedPriority >= 9);
      const isCracklingFireMappedAlert = isCracklingFireMappedToFireAlarm(detection);

      // Skip duplicate records for rapid repeated detections of the same hazard.
      if (hasUserId) {
        const isDuplicateSound = await hasRecentDuplicateSound(context.userId, hazardType);
        if (isDuplicateSound) {
          console.log(`⏭️ Skipping duplicate ${isCriticalAlert ? 'CRITICAL ' : ''}sound: ${hazardType} for user ${context.userId} (within ${SOUND_DEDUP_WINDOW_MS}ms window)`);
          continue;
        }
      }

      console.log(`✅ Will save ${isCriticalAlert ? 'CRITICAL' : 'identified'} sound: ${hazardType} (confidence: ${confidence.toFixed(2)}, priority: ${priority}, userId: ${context.userId || 'none'})`);

      // Clean context to remove undefined values
      const cleanContext = {};
      for (const [key, value] of Object.entries(context)) {
        if (value !== undefined) {
          cleanContext[key] = value;
        }
      }

      // Normalize timestamp to proper ISO string format
      let normalizedTimestamp;
      if (detection.timestamp) {
        try {
          // Parse and convert to proper ISO string (handles Python timestamps without Z)
          const date = new Date(detection.timestamp);
          normalizedTimestamp = date.toISOString();
        } catch (e) {
          // If parsing fails, use current time
          normalizedTimestamp = new Date().toISOString();
        }
      } else {
        normalizedTimestamp = new Date().toISOString();
      }

      const soundData = {
        userId: context.userId || null,
        type: hazardType,
        confidence: confidence,
        timestamp: normalizedTimestamp,
        location: context.location || null,
        context: {
          ...cleanContext,
          detectionId: detection.id || null,
        },
        audioFileUrl: audioFileUrl || null,
        metadata: {
          ...metadata,
          ...(detection.metadata || {}),
        },
        priority: priority, // Use the final priority (base priority for critical hazards)
        isHazard: true, // All detections from hazard endpoint are hazards
        status: 'detected',
      };
      
      console.log(`📝 Sound data to save:`, {
        userId: soundData.userId,
        type: soundData.type,
        confidence: soundData.confidence,
        priority: soundData.priority,
        hasLocation: !!soundData.location,
        locationType: soundData.location?.type,
        coordinates: soundData.location?.coordinates,
      });

      // Validate before saving
      const validation = validateSoundData(soundData);
      if (validation.valid) {
        const soundDoc = createSoundDocument(soundData);
        const docRef = await db.collection(SOUNDS_COLLECTION).add(soundDoc);
        savedSoundIds.push(docRef.id);
        console.log(`💾 Saved ${isCriticalAlert ? 'CRITICAL' : 'identified'} alert: ${hazardType} (confidence: ${confidence.toFixed(2)}, priority: ${priority}, ID: ${docRef.id})`);
        
        // If this is a critical alert and has a userId, notify the parent.
        // Notification gating is aligned with child-side critical alert rules.
        if (isCriticalAlert && context.userId) {
          if (!shouldNotifyParentForDetection(detection, priority)) {
            console.log(
              `⏭️ Skipping parent notification for ${hazardType} (priority=${priority}, confidence=${confidence.toFixed(2)}) - not a parent-notifiable critical alert`
            );
            continue;
          }

          if (isCracklingFireMappedAlert && !context.cracklingFireVote?.confirmed) {
            const voteCount = context.cracklingFireVote?.count || 0;
            console.log(
              `⏳ Suppressing parent notification for crackling_fire→fire_alarm (${voteCount}/${CRACKLING_FIRE_CONFIRMATION_FRAMES} frames)`
            );
            continue;
          }
          try {
            // Get parent ID from child user ID
            const parentId = await getParentIdFromChild(context.userId);
            
            if (parentId) {
              // Get child name for notification
              let childName = 'Your child';
              try {
                const childDoc = await db.collection(USERS_COLLECTION).doc(context.userId).get();
                if (childDoc.exists) {
                  childName = childDoc.data().name || childName;
                }
              } catch (nameError) {
                console.warn('⚠️ Could not fetch child name:', nameError);
              }
              
              // Create notification for parent
              await notifyParent(parentId, {
                hazardType: hazardType,
                childUserId: context.userId,
                childName: childName,
                location: context.location,
                soundId: docRef.id,
                priority: priority,
                confidence: confidence,
              });
              
              console.log(`📬 Parent notification sent for critical alert: ${hazardType}`);
            } else {
              console.log(`ℹ️ No parent found for user ${context.userId} (may be a parent account)`);
            }
          } catch (notificationError) {
            // Don't fail the save if notification fails
            console.error('❌ Error sending parent notification:', notificationError);
          }
        }
      } else {
        console.warn(`⚠️ Skipped saving invalid sound data:`, validation.errors);
      }
    }
  } catch (error) {
    console.error('❌ Error saving sounds to database:', error);
    // Don't throw - we don't want to fail the detection if storage fails
  }

  return savedSoundIds;
}

/**
 * Get parent ID from child user ID
 * @param {string} childUserId - Child user ID
 * @returns {Promise<string|null>} Parent user ID or null
 */
async function getParentIdFromChild(childUserId) {
  if (!childUserId) return null;
  
  try {
    const userDoc = await db.collection(USERS_COLLECTION).doc(childUserId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      const parentId = userData.parentId || null;
      console.log(`👨‍👩‍👧 Found parent ${parentId} for child ${childUserId}`);
      return parentId;
    }
    console.warn(`⚠️ User ${childUserId} not found`);
    return null;
  } catch (error) {
    console.error(`❌ Error getting parent ID for child ${childUserId}:`, error);
    return null;
  }
}

/**
 * Format location for display
 * @param {Object} location - Location object (GeoJSON Point or with lat/lng)
 * @returns {string} Formatted location string
 */
function formatLocation(location) {
  if (!location) return 'Location not available';
  
  // If location has coordinates array [longitude, latitude]
  if (location.coordinates && Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
    const [lng, lat] = location.coordinates;
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
  
  // If location has latitude and longitude properties
  if (location.latitude !== undefined && location.longitude !== undefined) {
    return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
  }
  
  return 'Location not available';
}

/**
 * Send Expo Push Notification
 * @param {string} expoPushToken - Expo push token
 * @param {Object} notification - Notification data
 * @returns {Promise<void>}
 */
async function sendExpoPushNotification(expoPushToken, notification) {
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        {
          to: expoPushToken,
          sound: 'default',
          title: notification.title,
          body: notification.body,
          data: notification.data,
          priority: 'high',
          channelId: 'critical_alerts',
        },
      ]),
    });

    const result = await response.json();
    if (result.data && result.data.status === 'ok') {
      console.log('✅ Expo push notification sent successfully');
    } else {
      console.error('❌ Expo push notification failed:', result);
      throw new Error('Expo push notification failed');
    }
  } catch (error) {
    console.error('❌ Error sending Expo push notification:', error);
    throw error;
  }
}

/**
 * Create a notification for parent when child triggers critical alert
 * Also sends push notification (FCM or Expo) if parent has token
 * @param {string} parentId - Parent user ID
 * @param {Object} alertData - Alert data (hazard type, child info, location, etc.)
 * @returns {Promise<string|null>} Notification document ID or null
 */
async function notifyParent(parentId, alertData) {
  if (!parentId) {
    console.warn('⚠️ No parent ID provided for notification');
    return null;
  }

  try {
    // Skip duplicate parent alerts when the same critical sound repeats rapidly.
    const isDuplicateParentAlert = await hasRecentDuplicateParentAlert(parentId, alertData);
    if (isDuplicateParentAlert) {
      console.log(`⏭️ Skipping duplicate parent alert for ${alertData.hazardType} (child: ${alertData.childUserId}, parent: ${parentId})`);
      return null;
    }

    // Format location for message
    const locationText = formatLocation(alertData.location);
    const hazardTypeFormatted = (alertData.hazardType || 'Critical hazard')
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    // Create message with location
    let message = `${alertData.childName || 'Your child'} detected: ${hazardTypeFormatted}`;
    if (alertData.location) {
      message += `\n📍 Location: ${locationText}`;
    }

    const notificationData = {
      parentId: parentId,
      type: 'critical_hazard_alert',
      title: '🚨 Critical Alert Detected',
      message: message,
      hazardType: alertData.hazardType,
      childUserId: alertData.childUserId,
      childName: alertData.childName || 'Your child',
      location: alertData.location || null,
      locationText: locationText, // Store formatted location text for easy display
      soundId: alertData.soundId || null,
      priority: alertData.priority || 9,
      timestamp: new Date().toISOString(),
      read: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Create Firestore notification document
    const notificationRef = await db.collection(NOTIFICATIONS_COLLECTION).add(notificationData);
    console.log(`📬 Created notification ${notificationRef.id} for parent ${parentId} with location: ${locationText}`);

    // Send push notification if parent has token (FCM or Expo)
    try {
      const parentDoc = await db.collection(USERS_COLLECTION).doc(parentId).get();
      if (parentDoc.exists) {
        const parentData = parentDoc.data();
        const fcmToken = parentData.fcmToken || parentData.fcmTokens?.[0];
        const expoPushToken = parentData.expoPushToken;
        
        // Try FCM first (for production builds)
        if (fcmToken && fcmToken.startsWith && !fcmToken.startsWith('ExponentPushToken')) {
          try {
            const fcmMessage = {
              token: fcmToken,
              notification: {
                title: '🚨 Critical Alert Detected',
                body: message,
              },
              data: {
                type: 'critical_hazard_alert',
                notificationId: notificationRef.id,
                hazardType: alertData.hazardType || '',
                childUserId: alertData.childUserId || '',
                childName: alertData.childName || 'Your child',
                priority: String(alertData.priority || 9),
                soundId: alertData.soundId || '',
                locationText: locationText || '',
              },
              android: {
                priority: 'high',
                notification: {
                  channelId: 'critical_alerts',
                  sound: 'default',
                  priority: 'high',
                  visibility: 'public',
                },
              },
              apns: {
                payload: {
                  aps: {
                    sound: 'default',
                    badge: 1,
                    alert: {
                      title: '🚨 Critical Alert Detected',
                      body: message,
                    },
                    'content-available': 1,
                  },
                },
              },
            };

            const response = await messaging.send(fcmMessage);
            console.log(`📱 FCM push notification sent successfully to parent ${parentId}:`, response);
          } catch (fcmError) {
            console.error(`❌ Error sending FCM push notification:`, fcmError);
            // Fall through to try Expo push
          }
        }
        
        // Try Expo Push Notification (for Expo Go)
        if (expoPushToken || (fcmToken && fcmToken.startsWith && fcmToken.startsWith('ExponentPushToken'))) {
          const token = expoPushToken || fcmToken;
          await sendExpoPushNotification(token, {
            title: '🚨 Critical Alert Detected',
            body: message,
            data: {
              type: 'critical_hazard_alert',
              notificationId: notificationRef.id,
              hazardType: alertData.hazardType || '',
              childUserId: alertData.childUserId || '',
              childName: alertData.childName || 'Your child',
              priority: String(alertData.priority || 9),
              soundId: alertData.soundId || '',
              locationText: locationText || '',
            },
          });
          console.log(`📱 Expo push notification sent successfully to parent ${parentId}`);
        }
        
        if (!fcmToken && !expoPushToken) {
          console.log(`ℹ️ No push token found for parent ${parentId} - skipping push notification`);
        }
      } else {
        console.warn(`⚠️ Parent document ${parentId} not found - skipping push notification`);
      }
    } catch (pushError) {
      // Don't fail the notification creation if push fails
      console.error(`❌ Error sending push notification to parent ${parentId}:`, pushError);
      // Continue - Firestore notification was already created
    }

    return notificationRef.id;
  } catch (error) {
    console.error(`❌ Error creating notification for parent ${parentId}:`, error);
    return null;
  }
}

/**
 * Notify parent after child completes a post-critical safety check
 * @param {string} parentId - Parent user ID
 * @param {Object} safetyData - Safety check payload
 * @returns {Promise<string|null>} Notification document ID or null
 */
async function notifyParentSafetyCheck(parentId, safetyData) {
  if (!parentId) {
    console.warn('⚠️ No parent ID provided for safety-check notification');
    return null;
  }

  try {
    const hazardTypeFormatted = (safetyData.hazardType || 'Critical hazard')
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const safeText = safetyData.childConfirmedSafe
      ? '✅ Child reported they are safe.'
      : '⚠️ Child may still need help.';

    const questionSummary = (safetyData.responses || [])
      .map((item, idx) => `Q${idx + 1}: ${item.answer ? 'Yes' : 'No'}`)
      .join(', ');

    let message = `${safetyData.childName || 'Your child'} completed safety check for ${hazardTypeFormatted}.\n${safeText}`;
    if (questionSummary) {
      message += `\n${questionSummary}`;
    }

    const notificationData = {
      parentId: parentId,
      type: 'critical_safety_check',
      title: '🛡️ Child Safety Check Update',
      message,
      hazardType: safetyData.hazardType || null,
      childUserId: safetyData.childUserId || null,
      childName: safetyData.childName || 'Your child',
      soundId: safetyData.soundId || null,
      childConfirmedSafe: !!safetyData.childConfirmedSafe,
      responses: safetyData.responses || [],
      timestamp: new Date().toISOString(),
      read: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const notificationRef = await db.collection(NOTIFICATIONS_COLLECTION).add(notificationData);

    try {
      const parentDoc = await db.collection(USERS_COLLECTION).doc(parentId).get();
      if (parentDoc.exists) {
        const parentData = parentDoc.data();
        const fcmToken = parentData.fcmToken || parentData.fcmTokens?.[0];
        const expoPushToken = parentData.expoPushToken;

        if (fcmToken && fcmToken.startsWith && !fcmToken.startsWith('ExponentPushToken')) {
          try {
            const fcmMessage = {
              token: fcmToken,
              notification: {
                title: '🛡️ Child Safety Check Update',
                body: message,
              },
              data: {
                type: 'critical_safety_check',
                notificationId: notificationRef.id,
                soundId: safetyData.soundId || '',
                childUserId: safetyData.childUserId || '',
                hazardType: safetyData.hazardType || '',
                childConfirmedSafe: String(!!safetyData.childConfirmedSafe),
              },
            };
            await messaging.send(fcmMessage);
          } catch (fcmError) {
            console.error('❌ Error sending FCM safety-check push:', fcmError);
          }
        }

        if (expoPushToken || (fcmToken && fcmToken.startsWith && fcmToken.startsWith('ExponentPushToken'))) {
          const token = expoPushToken || fcmToken;
          await sendExpoPushNotification(token, {
            title: '🛡️ Child Safety Check Update',
            body: message,
            data: {
              type: 'critical_safety_check',
              notificationId: notificationRef.id,
              soundId: safetyData.soundId || '',
              childUserId: safetyData.childUserId || '',
              hazardType: safetyData.hazardType || '',
              childConfirmedSafe: String(!!safetyData.childConfirmedSafe),
            },
          });
        }
      }
    } catch (pushError) {
      console.error(`❌ Error sending safety-check push notification to parent ${parentId}:`, pushError);
    }

    return notificationRef.id;
  } catch (error) {
    console.error(`❌ Error creating safety-check notification for parent ${parentId}:`, error);
    return null;
  }
}

/**
 * Get the last known location for a user from the sounds collection
 * @param {string} userId - User ID
 * @returns {Promise<string|null>} Last known location string or null
 */
async function getLastKnownLocation(userId) {
  if (!userId) return null;

  try {
    const lastSoundSnapshot = await db.collection(SOUNDS_COLLECTION)
      .where('userId', '==', userId)
      .where('location', '!=', null)
      .orderBy('location') // Necessary for the != filter in Firestore
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (!lastSoundSnapshot.empty) {
      const lastSound = lastSoundSnapshot.docs[0].data();
      console.log(`📍 Found last known location for user ${userId}: ${lastSound.location}`);
      return lastSound.location;
    }
  } catch (error) {
    console.warn(`⚠️ Error fetching last known location for user ${userId}:`, error.message);
    // Fallback search without specific ordering if index might be missing
    try {
      const fallbackSnapshot = await db.collection(SOUNDS_COLLECTION)
        .where('userId', '==', userId)
        .limit(20)
        .get();

      const lastWithLocation = fallbackSnapshot.docs
        .map(doc => doc.data())
        .filter(data => data.location)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

      if (lastWithLocation) {
        return lastWithLocation.location;
      }
    } catch (fallbackError) {
      console.error('❌ Fallback location search failed:', fallbackError.message);
    }
  }
  return null;
}

// Ensure uploads directory exists
const uploadsDir = join(__dirname, '../../uploads');
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const originalExt = file.originalname.split('.').pop();
    cb(null, `hazard-${uniqueSuffix}.${originalExt}`);

  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || 10485760) // 10MB
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files or files with audio extensions
    // React Native may send files with different mimetypes
    const audioMimeTypes = ['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/ogg'];
    const audioExtensions = ['.wav', '.wave', '.mp3', '.m4a', '.aac', '.ogg'];

    const isAudioMime = file.mimetype && (
      file.mimetype.startsWith('audio/') ||
      audioMimeTypes.includes(file.mimetype)
    );
    const isAudioExtension = audioExtensions.some(ext =>
      file.originalname.toLowerCase().endsWith(ext)
    );

    if (isAudioMime || isAudioExtension || !file.mimetype) {
      // Allow files without mimetype (React Native sometimes doesn't send it)
      cb(null, true);
    } else {
      cb(new Error(`Only audio files are allowed! Received: ${file.mimetype || 'unknown'}`), false);
    }
  }
});

/**
 * POST /api/hazard/detect
 * Detect hazardous sounds from audio input
 * This endpoint processes audio and returns detected hazards with prioritization
 */


router.post('/detect', upload.single('audio'), async (req, res, next) => {
  try {
    console.log('📥 Received hazard detection request');
    console.log('📦 Request headers:', {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length'],
    });
    console.log('📦 Request body keys:', Object.keys(req.body));
    console.log('📁 File:', req.file ? `${req.file.filename} (${req.file.size} bytes)` : 'No file');
    console.log('📁 Files:', req.files ? Object.keys(req.files) : 'No files');

    if (!req.file) {
      console.error('❌ No audio file provided');
      console.error('📋 Request details:', {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body,
      });
      return res.status(400).json({
        error: 'No audio file provided',
        details: 'Make sure the file is sent with field name "audio"'
      });
    }

    // Get context if provided
    const context = req.body.context ? JSON.parse(req.body.context) : {};
    const timestamp = new Date().toISOString();
    const location = context.location || null;
    
    // CRITICAL: Check audio file size - reject if too small (likely silence/noise)
    const MIN_AUDIO_SIZE_BYTES = 10000; // ~10KB minimum for valid audio chunk
    if (req.file.size < MIN_AUDIO_SIZE_BYTES) {
      console.warn(`⚠️ Audio file too small (${req.file.size} bytes) - likely silence or noise, skipping detection`);
      return res.json({
        success: true,
        data: {
          detections: [],
          highestPriority: null,
          metadata: {
            message: 'Audio too quiet or silent - no detection performed',
            audioSize: req.file.size,
            skipped: true
          }
        }
      });
    }
    
    // Log context for debugging
    console.log('📋 Context received:', {
      userId: context.userId,
      hasLocation: !!context.location,
      locationType: context.location?.type,
      coordinates: context.location?.coordinates,
      time: context.time
    });

    const wavPath = req.file.path + "-converted.wav";

    console.log('🔄 Converting audio to WAV format...');
    try {
      await convertToWav(req.file.path, wavPath);
      console.log('✅ Audio converted to WAV:', wavPath);
    } catch (convertError) {
      console.error('❌ Audio conversion error:', convertError);
      // Clean up uploaded file
      await fs.unlink(req.file.path).catch(console.error);
      return res.status(500).json({
        error: 'Failed to convert audio file',
        details: convertError.message
      });
    }

    // Use the real trained model for prediction
    // The model expects WAV files and uses YAMNet embeddings internally
    let detections = [];
    try {
      console.log('🤖 Running model inference...');
      console.log('📁 WAV file path:', wavPath);
      console.log('📊 File exists:', await fs.access(wavPath).then(() => true).catch(() => false));

      const startTime = Date.now();
      detections = await predictWithModel(wavPath, context);
      const inferenceTime = Date.now() - startTime;

      console.log(`✅ Model returned ${detections.length} detections in ${inferenceTime}ms`);
      console.log('📋 Detections:', JSON.stringify(detections, null, 2));
    } catch (error) {
      console.error('❌ Model inference error:', error);
      console.error('❌ Error stack:', error.stack);
      // Fallback to mock if model fails (for development/testing)
      console.warn('⚠️ Falling back to mock inference');
      try {
        const wavBuffer = await fs.readFile(wavPath);
        const result = await audioToLogMelSpectrogram(wavBuffer);
        const prepared = prepareSpectrogramForModel(result.spectrogram);
        detections = await mockModelInference(prepared.data, context);
        console.log(`✅ Mock inference returned ${detections.length} detections`);
      } catch (mockError) {
        console.error('❌ Mock inference also failed:', mockError);
        // Clean up files
        await fs.unlink(wavPath).catch(console.error);
        await fs.unlink(req.file.path).catch(console.error);
        return res.status(500).json({
          error: 'Model inference failed',
          details: error.message
        });
      }
    }

    // Cleanup converted WAV file
    await fs.unlink(wavPath).catch(console.error);

    // Filter out false positives and low-quality detections
    const MIN_LOUDNESS_THRESHOLD = 0.02; // Minimum RMS loudness (normalized 0-1)
    const filteredDetections = detections.filter(detection => {
      const hazardType = (detection.type || '').toLowerCase();
      const loudness = detection.loudness || 0;
      const confidence = detection.confidence || 0;
      
      // Filter out false positive types
      if (FALSE_POSITIVE_TYPES.some(fp => hazardType.includes(fp))) {
        console.log(`🚫 Filtering out false positive type: ${detection.type}`);
        return false;
      }
      
      // Filter out detections with very low loudness (likely silence or noise)
      if (loudness < MIN_LOUDNESS_THRESHOLD) {
        console.log(`🔇 Filtering out ${detection.type} - too quiet (loudness: ${loudness.toFixed(3)} < ${MIN_LOUDNESS_THRESHOLD})`);
        return false;
      }
      
      // Filter out very low confidence detections
      if (confidence < 0.60) {
        console.log(`📉 Filtering out ${detection.type} - low confidence (${(confidence * 100).toFixed(1)}% < 60%)`);
        return false;
      }
      
      return true;
    });

    if (filteredDetections.length === 0 && detections.length > 0) {
      console.log(`🔇 All ${detections.length} detections filtered out due to low loudness (silence/noise)`);
      return res.json({
        success: true,
        data: {
          detections: [],
          highestPriority: null,
          metadata: {
            message: 'Audio too quiet - all detections filtered',
            originalDetections: detections.length,
            filtered: true
          }
        }
      });
    }

    // Prioritize detected hazards
    const prioritized = prioritizeHazards(filteredDetections, context);
    
    console.log(`📊 Prioritized ${prioritized.length} detections (from ${filteredDetections.length} after filtering):`, prioritized.map(d => ({
      type: d.type,
      confidence: d.confidence?.toFixed(2),
      priority: d.priority,
      urgencyScore: d.urgencyScore?.toFixed(2),
      loudness: d.loudness?.toFixed(3)
    })));

    // Clean up uploaded file - mark as deleted to avoid double-unlink
    const uploadedFilePath = req.file.path;
    await fs.unlink(uploadedFilePath).catch(console.error);
    req.file.deleted = true;

    // Determine if critical alert needed
    // Use the priority field from prioritized detections (not getHazardPriority)
    const criticalHazards = prioritized.filter(h => (h.priority !== undefined ? h.priority : getHazardPriority(h.type)) >= 9);
    const needsImmediateAlert = criticalHazards.length > 0;
    
    console.log(`🚨 Critical hazards found: ${criticalHazards.length}, needsImmediateAlert: ${needsImmediateAlert}`);

    // Use last known location if critical and location is missing
    let finalLocation = location;
    if (needsImmediateAlert && !finalLocation) {
      const userId = context.userId || req.body.userId;
      const lastLocation = await getLastKnownLocation(userId);
      if (lastLocation) {
        finalLocation = lastLocation;
        console.log(`🚨 Critical alert triggered! Used last known location: ${finalLocation}`);
      }
    }

    // Save detected sounds to database
    const audioMetadata = {
      processingTime: Date.now() - new Date(timestamp).getTime(),
      detectionsCount: detections.length,
    };

    // Prepare context for saving - ensure userId and location are included
    const saveContext = {
      ...context,
      userId: context.userId || req.body.userId || null,
      location: finalLocation || context.location || null,
      time: context.time || timestamp,
    };
    saveContext.cracklingFireVote = updateCracklingFireVote(saveContext.userId, prioritized);
    
    console.log('💾 Saving with context:', {
      userId: saveContext.userId,
      hasLocation: !!saveContext.location,
      locationType: saveContext.location?.type,
      coordinates: saveContext.location?.coordinates,
      cracklingFireVote: saveContext.cracklingFireVote,
    });
    
    // Note: audioFileUrl is null since we delete the file after processing
    // If you want to store audio files, upload them to Firebase Storage first
    const savedSoundIds = await saveSoundsToDatabase(
      prioritized,
      saveContext,
      null, // audioFileUrl - set to null since file is deleted
      audioMetadata
    );

    const responseData = {
      success: true,
      data: {
        timestamp,
        location: finalLocation,
        detections: prioritized,
        critical: needsImmediateAlert,
        highestPriority: prioritized.length > 0 ? prioritized[0] : null,
        metadata: {
          ...audioMetadata,
          savedSoundIds, // Include IDs of saved sound records
          highestPrioritySoundId: savedSoundIds.length > 0 ? savedSoundIds[0] : null,
          cracklingFireVote: saveContext.cracklingFireVote,
        }
      }
    };

    console.log('📤 Sending response:', {
      detectionsCount: prioritized.length,
      critical: needsImmediateAlert,
      savedSoundIds: savedSoundIds.length
    });

    res.json(responseData);
  } catch (error) {
    if (req.file && !req.file.deleted) {
      await fs.unlink(req.file.path).catch(console.error);
      req.file.deleted = true;
    }
    next(error);
  }
});

/**
 * POST /api/hazard/detect-stream
 * Real-time hazard detection endpoint (for continuous audio streaming)
 * Accepts multiple audio chunks and aggregates results
 */
router.post('/detect-stream', upload.array('audio', 10), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No audio files provided'
      });
    }

    const context = req.body.context ? JSON.parse(req.body.context) : {};
    const results = [];
    const allDetections = [];

    // Process each audio chunk
    for (const file of req.files) {
      try {
        // Convert to WAV if needed
        const wavPath = file.path + "-converted.wav";
        await convertToWav(file.path, wavPath);

        // Use real model for prediction
        let detections = [];
        try {
          detections = await predictWithModel(wavPath, context);
        } catch (error) {
          console.error(`Error running model on chunk ${file.filename}:`, error);
          // Fallback to mock if model fails
          const audioBuffer = await fs.readFile(wavPath);
          const result = await audioToLogMelSpectrogram(audioBuffer);
          const prepared = prepareSpectrogramForModel(result.spectrogram);
          detections = await mockModelInference(prepared.data, context);
        }

        allDetections.push(...detections);

        // Cleanup files
        await fs.unlink(wavPath).catch(console.error);
        await fs.unlink(file.path).catch(console.error);
        file.deleted = true;
      } catch (err) {
        console.error(`Error processing chunk ${file.filename}:`, err);
        if (!file.deleted) {
          await fs.unlink(file.path).catch(console.error);
          file.deleted = true;
        }
      }
    }

    // Aggregate and prioritize all detections
    const prioritized = prioritizeHazards(allDetections, context);

    // Determine if critical alert needed
    // Use the priority field from prioritized detections (calculated from urgency score)
    // Fallback to getHazardPriority if priority is not set
    const criticalHazards = prioritized.filter(h => {
      const priority = h.priority !== undefined ? h.priority : getHazardPriority(h.type);
      return priority >= 9;
    });
    const needsImmediateAlert = criticalHazards.length > 0;
    
    console.log(`🚨 Critical hazards found: ${criticalHazards.length}, needsImmediateAlert: ${needsImmediateAlert}`);

    // Use last known location if critical and location is missing
    let finalLocation = context.location || null;
    if (needsImmediateAlert && !finalLocation) {
      const userId = context.userId || req.body.userId;
      const lastLocation = await getLastKnownLocation(userId);
      if (lastLocation) {
        finalLocation = lastLocation;
        console.log(`🚨 Critical streaming alert! Used last known location: ${finalLocation}`);
      }
    }

    // Save detected sounds to database
    const timestamp = new Date().toISOString();
    const audioMetadata = {
      chunkCount: req.files.length,
      processingMode: 'stream',
    };

    const saveContext = {
      ...context,
      userId: context.userId || req.body.userId,
      location: finalLocation,
    };
    saveContext.cracklingFireVote = updateCracklingFireVote(saveContext.userId, prioritized);

    const savedSoundIds = await saveSoundsToDatabase(
      prioritized,
      saveContext,
      null, // audioFileUrl
      audioMetadata
    );

    res.json({
      success: true,
      data: {
        timestamp,
        location: finalLocation,
        detections: prioritized,
        chunkCount: req.files.length,
        critical: needsImmediateAlert,
        highestPriority: prioritized.length > 0 ? prioritized[0] : null,
        metadata: {
          ...audioMetadata,
          savedSoundIds,
          highestPrioritySoundId: savedSoundIds.length > 0 ? savedSoundIds[0] : null,
          cracklingFireVote: saveContext.cracklingFireVote,
        }
      }
    });
  } catch (error) {
    // Clean up all files on error
    if (req.files) {
      for (const file of req.files) {
        if (!file.deleted) {
          await fs.unlink(file.path).catch(console.error);
          file.deleted = true;
        }
      }
    }
    next(error);
  }
});

/**
 * POST /api/hazard/safety-check
 * Child post-critical safety confirmation flow:
 * - updates the related hazard sound document
 * - stores question responses in metadata.safetyCheck
 * - notifies parent with the answers
 */
router.post('/safety-check', async (req, res, next) => {
  try {
    const {
      soundId,
      userId,
      hazardType,
      childConfirmedSafe,
      responses = [],
    } = req.body || {};

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    let targetSoundId = soundId || null;
    let soundData = null;

    if (targetSoundId) {
      const soundDoc = await db.collection(SOUNDS_COLLECTION).doc(targetSoundId).get();
      if (soundDoc.exists) {
        soundData = soundDoc.data();
      } else {
        targetSoundId = null;
      }
    }

    // Fallback: find the latest critical hazard sound for this child if soundId was not provided.
    if (!targetSoundId) {
      const snapshot = await db.collection(SOUNDS_COLLECTION)
        .where('userId', '==', userId)
        .where('isHazard', '==', true)
        .limit(25)
        .get();

      const latestCritical = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(item => (item.priority || 0) >= 9)
        .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))[0];

      if (!latestCritical) {
        return res.status(404).json({ error: 'No critical hazard record found for this user' });
      }

      targetSoundId = latestCritical.id;
      soundData = latestCritical;
    }

    const docRef = db.collection(SOUNDS_COLLECTION).doc(targetSoundId);
    const safetyCheckPayload = {
      submittedAt: new Date().toISOString(),
      childConfirmedSafe: !!childConfirmedSafe,
      responses: Array.isArray(responses) ? responses : [],
    };

    await docRef.update({
      status: childConfirmedSafe ? 'child_confirmed_safe' : 'child_needs_help',
      'metadata.safetyCheck': safetyCheckPayload,
      updatedAt: new Date(),
    });

    // Notify parent
    const parentId = await getParentIdFromChild(userId);
    if (parentId) {
      let childName = 'Your child';
      try {
        const childDoc = await db.collection(USERS_COLLECTION).doc(userId).get();
        if (childDoc.exists) {
          childName = childDoc.data().name || childName;
        }
      } catch (nameError) {
        console.warn('⚠️ Could not fetch child name for safety check:', nameError);
      }

      await notifyParentSafetyCheck(parentId, {
        soundId: targetSoundId,
        childUserId: userId,
        childName,
        hazardType: hazardType || soundData?.type || null,
        childConfirmedSafe: !!childConfirmedSafe,
        responses: safetyCheckPayload.responses,
      });
    }

    return res.json({
      success: true,
      data: {
        soundId: targetSoundId,
        status: childConfirmedSafe ? 'child_confirmed_safe' : 'child_needs_help',
        safetyCheck: safetyCheckPayload,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/hazard/priorities
 * Get hazard priority configuration
 */
router.get('/priorities', (req, res) => {
  try {
    const priorities = JSON.parse(process.env.HAZARD_PRIORITIES || '{}');
    res.json({
      success: true,
      data: priorities
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load hazard priorities'
    });
  }
});

/**
 * Mock model inference function
 * TODO: Replace this with actual CNN model inference
 * This simulates what your trained model would return
 */
async function mockModelInference(spectrogramData, context) {
  // This is a placeholder - replace with actual model inference
  // Example structure:
  // const model = await tf.loadLayersModel(process.env.MODEL_PATH);
  // const input = tf.tensor4d([spectrogramData], [1, 224, 224, 1]);
  // const prediction = model.predict(input);
  // const classes = ['fire_alarm', 'car_horn', 'glass_breaking', 'dog_barking', ...];
  // return processModelOutput(prediction, classes);

  // Mock return for testing
  const mockResults = [
    {
      type: 'fire_alarm',
      confidence: 0.85,
      timestamp: new Date().toISOString()
    }
  ];

  return mockResults;
}

export default router;
