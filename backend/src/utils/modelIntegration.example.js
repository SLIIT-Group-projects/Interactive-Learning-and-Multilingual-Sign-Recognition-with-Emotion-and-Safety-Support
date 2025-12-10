/**
 * Example Model Integration
 * This file shows how to integrate your trained CNN model
 * Replace mockModelInference() in hazard.routes.js with actual model loading
 */

// Example 1: Using TensorFlow.js Node
/*
import * as tf from '@tensorflow/tfjs-node';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let model = null;

async function loadModel() {
  if (!model) {
    const modelPath = process.env.MODEL_PATH || join(__dirname, '../../models/hazard_model.json');
    model = await tf.loadLayersModel(`file://${modelPath}`);
    console.log('Model loaded successfully');
  }
  return model;
}

export async function predictWithModel(spectrogramData, shape = [224, 224]) {
  const model = await loadModel();
  
  // Reshape spectrogram data to match model input shape
  // Assumes model expects input shape: [batch, height, width, channels]
  const inputTensor = tf.tensor4d(
    [spectrogramData],
    [1, shape[0], shape[1], 1]
  );
  
  // Normalize if needed (adjust based on your training preprocessing)
  const normalized = inputTensor.div(255.0);
  
  // Make prediction
  const prediction = model.predict(normalized);
  const predictionArray = await prediction.data();
  
  // Clean up tensors
  inputTensor.dispose();
  normalized.dispose();
  prediction.dispose();
  
  return predictionArray;
}

export async function classifyHazard(spectrogramData) {
  const classNames = [
    'fire_alarm',
    'smoke_alarm',
    'siren',
    'glass_breaking',
    'car_horn',
    'baby_crying',
    'dog_barking',
    'none'
  ];
  
  const predictions = await predictWithModel(spectrogramData);
  
  // Find the class with highest probability
  let maxIndex = 0;
  let maxValue = predictions[0];
  
  for (let i = 1; i < predictions.length; i++) {
    if (predictions[i] > maxValue) {
      maxValue = predictions[i];
      maxIndex = i;
    }
  }
  
  const threshold = parseFloat(process.env.MODEL_THRESHOLD || 0.7);
  
  if (maxValue < threshold || classNames[maxIndex] === 'none') {
    return [];
  }
  
  return [{
    type: classNames[maxIndex],
    confidence: maxValue,
    timestamp: new Date().toISOString()
  }];
}
*/

// Example 2: Using Python subprocess (if model is in Python/TensorFlow)
/*
import { spawn } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

export async function predictWithPythonModel(spectrogramData) {
  return new Promise((resolve, reject) => {
    const tempFile = join(process.env.UPLOAD_DIR || './uploads', `temp_${randomUUID()}.json`);
    
    // Write spectrogram data to temp file
    writeFileSync(tempFile, JSON.stringify({ data: Array.from(spectrogramData) }));
    
    // Spawn Python process
    const python = spawn('python', ['../models/predict.py', tempFile]);
    
    let output = '';
    let error = '';
    
    python.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    python.on('close', (code) => {
      try {
        unlinkSync(tempFile);
      } catch (e) {
        console.error('Failed to delete temp file:', e);
      }
      
      if (code !== 0) {
        reject(new Error(`Python script failed: ${error}`));
        return;
      }
      
      try {
        const result = JSON.parse(output);
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse Python output: ${e.message}`));
      }
    });
  });
}
*/

// Example 3: Using ONNX Runtime (for ONNX models)
/*
import ort from 'onnxruntime-node';

let session = null;

async function loadONNXModel() {
  if (!session) {
    const modelPath = process.env.MODEL_PATH || './models/hazard_model.onnx';
    session = await ort.InferenceSession.create(modelPath);
  }
  return session;
}

export async function predictWithONNX(spectrogramData, shape = [224, 224]) {
  const session = await loadONNXModel();
  
  // Create tensor from spectrogram data
  const tensor = new ort.Tensor('float32', spectrogramData, [1, 1, shape[0], shape[1]]);
  
  // Run inference
  const feeds = { input: tensor }; // Adjust 'input' based on your model's input name
  const results = await session.run(feeds);
  
  // Extract output (adjust 'output' based on your model's output name)
  const output = results.output;
  const predictions = Array.from(output.data);
  
  return predictions;
}
*/

export default {
  // Export your chosen implementation
};



