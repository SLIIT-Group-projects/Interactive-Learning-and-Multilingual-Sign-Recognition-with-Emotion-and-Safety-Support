#!/usr/bin/env node
/**
 * Start the Python model server
 * This script starts the model server in the background
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MODEL_SERVER_PATH = join(__dirname, '../models/model_server.py');
const PYTHON_EXECUTABLE = process.env.PYTHON_EXECUTABLE || 'python';
const PORT = process.env.MODEL_SERVER_PORT || 5000;
const HOST = process.env.MODEL_SERVER_HOST || '127.0.0.1';

console.log('🚀 Starting model server...');
console.log(`📁 Script: ${MODEL_SERVER_PATH}`);
console.log(`🌐 URL: http://${HOST}:${PORT}`);

const serverProcess = spawn(PYTHON_EXECUTABLE, [MODEL_SERVER_PATH], {
  stdio: 'inherit',
  env: {
    ...process.env,
    MODEL_SERVER_PORT: PORT.toString(),
    MODEL_SERVER_HOST: HOST
  }
});

serverProcess.on('error', (error) => {
  console.error('❌ Failed to start model server:', error.message);
  console.error('💡 Make sure Python is installed and Flask/flask-cors are installed:');
  console.error('   pip install flask flask-cors');
  process.exit(1);
});

serverProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`❌ Model server exited with code ${code}`);
    process.exit(1);
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down model server...');
  serverProcess.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down model server...');
  serverProcess.kill('SIGTERM');
  process.exit(0);
});

