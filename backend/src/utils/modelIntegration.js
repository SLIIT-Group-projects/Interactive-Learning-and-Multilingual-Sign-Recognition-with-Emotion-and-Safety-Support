/**
 * Model Integration Utility
 * Uses HTTP API to communicate with persistent Python model server for fast inference
 * Falls back to subprocess mode if server is not available
 */

import { spawn } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Model server configuration
const MODEL_SERVER_URL = process.env.MODEL_SERVER_URL || 'http://127.0.0.1:5000';
const USE_MODEL_SERVER = process.env.USE_MODEL_SERVER !== 'false'; // Default to true

// Path to Python prediction script (for fallback)
const PYTHON_SCRIPT_PATH = join(__dirname, '../../models/predict.py');

// Python executable (can be overridden via environment)
const PYTHON_EXECUTABLE = process.env.PYTHON_EXECUTABLE || 'python';

// Confidence threshold for detections (for including multiple predictions)
// Increased from 0.4 to 0.5 to reduce false positives
const CONFIDENCE_THRESHOLD = parseFloat(process.env.MODEL_CONFIDENCE_THRESHOLD || '0.5');

// Minimum confidence required for top prediction
// Increased from 0.6 to 0.65 to reduce false positives while maintaining sensitivity
// Critical hazards can still alert with lower confidence via frontend smart filtering
const MIN_CONFIDENCE = parseFloat(process.env.MODEL_MIN_CONFIDENCE || '0.65');

/**
 * Check if model server is available
 * @returns {Promise<boolean>} True if server is available
 */
async function checkModelServer() {
  if (!USE_MODEL_SERVER) {
    return false;
  }

  try {
    const response = await fetch(`${MODEL_SERVER_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000) // 2 second timeout
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Run model inference via HTTP API (fast - models stay in memory)
 * @param {string} audioFilePath - Path to the audio file
 * @returns {Promise<Array>} Array of detection objects
 */
async function predictWithModelServer(audioFilePath) {
  const response = await fetch(`${MODEL_SERVER_URL}/predict`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      audio_path: audioFilePath,
      threshold: CONFIDENCE_THRESHOLD,
      min_confidence: MIN_CONFIDENCE
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Model server returned status ${response.status}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Model prediction failed');
  }

  // Add timestamp if not present
  const timestamp = new Date().toISOString();
  const detections = result.detections.map(detection => ({
    ...detection,
    timestamp: detection.timestamp || timestamp
  }));

  return detections;
}

/**
 * Run model inference via subprocess (fallback - slower but works without server)
 * @param {string} audioFilePath - Path to the audio file
 * @returns {Promise<Array>} Array of detection objects
 */
function predictWithSubprocess(audioFilePath) {
  return new Promise((resolve, reject) => {
    // Spawn Python process
    // Arguments: script_path, audio_file, threshold, min_confidence
    const pythonProcess = spawn(PYTHON_EXECUTABLE, [
      PYTHON_SCRIPT_PATH,
      audioFilePath,
      CONFIDENCE_THRESHOLD.toString(),
      MIN_CONFIDENCE.toString()
    ]);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      // Log stderr but don't treat as error (Python prints warnings to stderr)
      console.log('Python stderr:', data.toString());
    });

    pythonProcess.on('error', (error) => {
      console.error('Failed to spawn Python process:', error);
      reject(new Error(`Failed to start Python process: ${error.message}. Make sure Python is installed and accessible.`));
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Python script failed with code:', code);
        console.error('Python stderr:', stderr);
        reject(new Error(`Python script failed with exit code ${code}: ${stderr || 'Unknown error'}`));
        return;
      }

      try {
        // Extract JSON from stdout (handle cases where panns_inference prints to stdout)
        // Look for lines that start with '{' (JSON object)
        const lines = stdout.trim().split('\n');
        let jsonLine = '';

        // Find the last line that looks like JSON (starts with '{')
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (line.startsWith('{')) {
            jsonLine = line;
            break;
          }
        }

        if (!jsonLine) {
          // Fallback: try parsing entire stdout
          jsonLine = stdout.trim();
        }

        // Parse JSON output
        const result = JSON.parse(jsonLine);

        if (!result.success) {
          reject(new Error(result.error || 'Model prediction failed'));
          return;
        }

        // Add timestamp if not present
        const timestamp = new Date().toISOString();
        const detections = result.detections.map(detection => ({
          ...detection,
          timestamp: detection.timestamp || timestamp,
          loudness: detection.loudness !== undefined ? detection.loudness : (result.loudness || 0.5),
          duration: detection.duration !== undefined ? detection.duration : (result.duration || 4.0)
        }));

        resolve(detections);
      } catch (parseError) {
        console.error('Failed to parse Python output:', parseError);
        console.error('Python stdout:', stdout);
        reject(new Error(`Failed to parse model output: ${parseError.message}`));
      }
    });
  });
}

/**
 * Run model inference on an audio file
 * Uses model server if available, falls back to subprocess
 * @param {string} audioFilePath - Path to the audio file
 * @param {object} context - Optional context information (not used but kept for compatibility)
 * @returns {Promise<Array>} Array of detection objects
 */
export async function predictWithModel(audioFilePath, context = {}) {
  // Try model server first if enabled
  if (USE_MODEL_SERVER) {
    try {
      const serverAvailable = await checkModelServer();
      if (serverAvailable) {
        const startTime = Date.now();
        const detections = await predictWithModelServer(audioFilePath);
        const inferenceTime = Date.now() - startTime;
        console.log(`✅ Model server inference completed in ${inferenceTime}ms`);
        return detections;
      } else {
        console.warn('⚠️ Model server not available, falling back to subprocess mode');
      }
    } catch (error) {
      console.warn('⚠️ Model server error, falling back to subprocess mode:', error.message);
    }
  }

  // Fallback to subprocess mode
  console.log('🔄 Using subprocess mode (slower - consider starting model server)');
  const startTime = Date.now();
  const detections = await predictWithSubprocess(audioFilePath);
  const inferenceTime = Date.now() - startTime;
  console.log(`✅ Subprocess inference completed in ${inferenceTime}ms`);
  return detections;
}

/**
 * Check if Python and required dependencies are available
 * @returns {Promise<boolean>} True if Python is available
 */
export async function checkPythonAvailability() {
  return new Promise((resolve) => {
    const pythonProcess = spawn(PYTHON_EXECUTABLE, ['--version']);

    pythonProcess.on('error', () => {
      resolve(false);
    });

    pythonProcess.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

export default {
  predictWithModel,
  checkPythonAvailability,
  checkModelServer
};

