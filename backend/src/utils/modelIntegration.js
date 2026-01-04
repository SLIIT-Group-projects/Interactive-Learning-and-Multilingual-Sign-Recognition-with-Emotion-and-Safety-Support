/**
 * Model Integration Utility
 * Integrates the trained YAMNet-based classifier model via Python subprocess
 */

import { spawn } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to Python prediction script
const PYTHON_SCRIPT_PATH = join(__dirname, '../../models/predict.py');

// Python executable (can be overridden via environment)
const PYTHON_EXECUTABLE = process.env.PYTHON_EXECUTABLE || 'python';

// Confidence threshold for detections (for including multiple predictions)
const CONFIDENCE_THRESHOLD = parseFloat(process.env.MODEL_CONFIDENCE_THRESHOLD || '0.4');

// Minimum confidence required for top prediction (higher threshold to reduce false positives)
// Increased from 0.5 to 0.6 to reduce false positives (coughing/footsteps)
const MIN_CONFIDENCE = parseFloat(process.env.MODEL_MIN_CONFIDENCE || '0.6');

/**
 * Run model inference on an audio file
 * @param {string} audioFilePath - Path to the audio file
 * @param {object} context - Optional context information
 * @returns {Promise<Array>} Array of detection objects
 */
export async function predictWithModel(audioFilePath, context = {}) {
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
          timestamp: detection.timestamp || timestamp
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
  checkPythonAvailability
};

