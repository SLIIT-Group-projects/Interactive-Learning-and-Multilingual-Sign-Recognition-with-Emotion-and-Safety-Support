import express from 'express';
import multer from 'multer';
import { promises as fs } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { audioToLogMelSpectrogram, spectrogramToImage, prepareSpectrogramForModel } from '../utils/audioProcessor.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = join(__dirname, '../../uploads');
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `audio-${uniqueSuffix}.wav`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || 10485760) // 10MB default
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
 * POST /api/audio/process
 * Process audio file and convert to spectrogram
 */
router.post('/process', upload.single('audio'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No audio file provided'
      });
    }

    const audioBuffer = await fs.readFile(req.file.path);
    
    // Convert to Log-Mel Spectrogram
    const result = await audioToLogMelSpectrogram(audioBuffer);
    
    // Clean up uploaded file
    await fs.unlink(req.file.path).catch(console.error);
    
    res.json({
      success: true,
      data: {
        shape: result.shape,
        metadata: result.metadata,
        message: 'Audio processed successfully'
      }
    });
  } catch (error) {
    // Clean up file on error
    if (req.file) {
      await fs.unlink(req.file.path).catch(console.error);
    }
    next(error);
  }
});

/**
 * POST /api/audio/spectrogram
 * Get spectrogram as image
 */
router.post('/spectrogram', upload.single('audio'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No audio file provided'
      });
    }

    const audioBuffer = await fs.readFile(req.file.path);
    
    // Convert to Log-Mel Spectrogram
    const result = await audioToLogMelSpectrogram(audioBuffer);
    
    // Convert to image
    const width = parseInt(req.query.width || 224);
    const height = parseInt(req.query.height || 224);
    const imageBuffer = await spectrogramToImage(result.spectrogram, width, height);
    
    // Clean up uploaded file
    await fs.unlink(req.file.path).catch(console.error);
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', 'inline; filename=spectrogram.png');
    res.send(imageBuffer);
  } catch (error) {
    if (req.file) {
      await fs.unlink(req.file.path).catch(console.error);
    }
    next(error);
  }
});

/**
 * POST /api/audio/prepare-model-input
 * Prepare spectrogram data for model inference
 */
router.post('/prepare-model-input', upload.single('audio'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No audio file provided'
      });
    }

    const audioBuffer = await fs.readFile(req.file.path);
    
    // Convert to Log-Mel Spectrogram
    const result = await audioToLogMelSpectrogram(audioBuffer);
    
    // Prepare for model input
    const targetShape = req.body.shape ? JSON.parse(req.body.shape) : [224, 224];
    const prepared = prepareSpectrogramForModel(result.spectrogram, targetShape);
    
    // Clean up uploaded file
    await fs.unlink(req.file.path).catch(console.error);
    
    res.json({
      success: true,
      data: {
        input: Array.from(prepared.data), // Convert Float32Array to regular array for JSON
        shape: prepared.shape,
        originalShape: prepared.originalShape,
        metadata: result.metadata
      }
    });
  } catch (error) {
    if (req.file) {
      await fs.unlink(req.file.path).catch(console.error);
    }
    next(error);
  }
});

export default router;


