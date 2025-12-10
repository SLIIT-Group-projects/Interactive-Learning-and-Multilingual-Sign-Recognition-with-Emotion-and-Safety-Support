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


const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    console.log('📦 Request body keys:', Object.keys(req.body));
    console.log('📁 File:', req.file ? `${req.file.filename} (${req.file.size} bytes)` : 'No file');
    
    if (!req.file) {
      console.error('❌ No audio file provided');
      return res.status(400).json({
        error: 'No audio file provided'
      });
    }

    // Get context if provided
    const context = req.body.context ? JSON.parse(req.body.context) : {};
    const timestamp = new Date().toISOString();
    const location = context.location || null;

    const wavPath = req.file.path + "-converted.wav";

    await convertToWav(req.file.path, wavPath);

    // Use the real trained model for prediction
    // The model expects WAV files and uses YAMNet embeddings internally
    let detections = [];
    try {
      console.log('🤖 Running model inference...');
      detections = await predictWithModel(wavPath, context);
      console.log(`✅ Model returned ${detections.length} detections`);
    } catch (error) {
      console.error('❌ Model inference error:', error);
      // Fallback to mock if model fails (for development/testing)
      console.warn('⚠️ Falling back to mock inference');
      const wavBuffer = await fs.readFile(wavPath);
      const result = await audioToLogMelSpectrogram(wavBuffer);
      const prepared = prepareSpectrogramForModel(result.spectrogram);
      detections = await mockModelInference(prepared.data, context);
    }

    // Cleanup converted WAV file
    await fs.unlink(wavPath).catch(console.error);
    
    // Prioritize detected hazards
    const prioritized = prioritizeHazards(detections, context);
    
    // Clean up uploaded file
    await fs.unlink(req.file.path).catch(console.error);
    
    // Determine if critical alert needed
    const criticalHazards = prioritized.filter(h => getHazardPriority(h.type) >= 9);
    const needsImmediateAlert = criticalHazards.length > 0;
    
    res.json({
      success: true,
      data: {
        timestamp,
        location,
        detections: prioritized,
        critical: needsImmediateAlert,
        highestPriority: prioritized.length > 0 ? prioritized[0] : null,
        metadata: {
          processingTime: Date.now() - new Date(timestamp).getTime(),
          detectionsCount: detections.length
        }
      }
    });
  } catch (error) {
    if (req.file) {
      await fs.unlink(req.file.path).catch(console.error);
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
      } catch (err) {
        console.error(`Error processing chunk ${file.filename}:`, err);
        await fs.unlink(file.path).catch(console.error);
      }
    }

    // Aggregate and prioritize all detections
    const prioritized = prioritizeHazards(allDetections, context);
    
    res.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        location: context.location || null,
        detections: prioritized,
        chunkCount: req.files.length,
        critical: prioritized.some(h => getHazardPriority(h.type) >= 9),
        highestPriority: prioritized.length > 0 ? prioritized[0] : null
      }
    });
  } catch (error) {
    // Clean up all files on error
    if (req.files) {
      for (const file of req.files) {
        await fs.unlink(file.path).catch(console.error);
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
