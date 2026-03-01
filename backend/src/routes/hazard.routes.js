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
import { db } from '../firebase/admin.js';
import { createSoundDocument, validateSoundData } from '../models/sound.model.js';


const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SOUNDS_COLLECTION = 'sounds';

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

  // Minimum confidence threshold for saving (higher than model threshold to only save confident detections)
  const MIN_CONFIDENCE_THRESHOLD = parseFloat(process.env.SAVE_CONFIDENCE_THRESHOLD || '0.4');

  try {
    for (const detection of detections) {
      const hazardType = detection.type || 'unknown';
      const confidence = detection.confidence || 0;
      const priority = detection.priority || getHazardPriority(hazardType);

      // Only save identified hazard alerts:
      // 1. Must be a recognized hazard type (priority > 0 means it's in the hazard priorities list)
      // 2. Must have sufficient confidence
      // 3. Must not be 'unknown' type
      const isRecognizedHazard = priority > 0 && hazardType !== 'unknown';
      const hasSufficientConfidence = confidence >= MIN_CONFIDENCE_THRESHOLD;

      if (!isRecognizedHazard || !hasSufficientConfidence) {
        console.log(`⏭️ Skipping save - ${hazardType} (confidence: ${confidence.toFixed(2)}, priority: ${priority}) - not a recognized hazard alert`);
        continue;
      }

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
        priority: priority,
        isHazard: true, // All detections from hazard endpoint are hazards
        status: 'detected',
      };

      // Validate before saving
      const validation = validateSoundData(soundData);
      if (validation.valid) {
        const soundDoc = createSoundDocument(soundData);
        const docRef = await db.collection(SOUNDS_COLLECTION).add(soundDoc);
        savedSoundIds.push(docRef.id);
        console.log(`💾 Saved hazard alert: ${hazardType} (confidence: ${confidence.toFixed(2)}, priority: ${priority}, ID: ${docRef.id})`);
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

    // Prioritize detected hazards
    const prioritized = prioritizeHazards(detections, context);

    // Clean up uploaded file - mark as deleted to avoid double-unlink
    const uploadedFilePath = req.file.path;
    await fs.unlink(uploadedFilePath).catch(console.error);
    req.file.deleted = true;

    // Determine if critical alert needed
    const criticalHazards = prioritized.filter(h => getHazardPriority(h.type) >= 9);
    const needsImmediateAlert = criticalHazards.length > 0;

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

    // Note: audioFileUrl is null since we delete the file after processing
    // If you want to store audio files, upload them to Firebase Storage first
    const savedSoundIds = await saveSoundsToDatabase(
      prioritized,
      { ...context, userId: context.userId || req.body.userId, location: finalLocation },
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
    const criticalHazards = prioritized.filter(h => getHazardPriority(h.type) >= 9);
    const needsImmediateAlert = criticalHazards.length > 0;

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

    const savedSoundIds = await saveSoundsToDatabase(
      prioritized,
      { ...context, userId: context.userId || req.body.userId, location: finalLocation },
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
