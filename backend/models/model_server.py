#!/usr/bin/env python3
"""
Model Server - Keeps models loaded in memory for fast inference
This eliminates the need to reload models on every prediction request
"""

import sys
import json
import os
import time
from flask import Flask, request, jsonify
from flask_cors import CORS
import traceback

# Import model functions from predict.py
# We need to import the model loading and prediction functions
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from predict import load_models, predict, predict_averaged

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Global flag to track if models are loaded
models_loaded = False
load_start_time = None

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'models_loaded': models_loaded,
        'model_type': os.getenv('MODEL_TYPE', 'cnn14')
    })

@app.route('/load', methods=['POST'])
def load():
    """Explicitly load models (called once at startup)"""
    global models_loaded, load_start_time
    
    if models_loaded:
        return jsonify({
            'success': True,
            'message': 'Models already loaded',
            'load_time': 0
        })
    
    try:
        load_start_time = time.time()
        print("Loading models...", file=sys.stderr)
        load_models()
        load_time = time.time() - load_start_time
        models_loaded = True
        
        print(f"Models loaded successfully in {load_time:.2f}s", file=sys.stderr)
        
        return jsonify({
            'success': True,
            'message': 'Models loaded successfully',
            'load_time': load_time
        })
    except Exception as e:
        print(f"Error loading models: {e}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/predict', methods=['POST'])
def predict_endpoint():
    """Predict endpoint for single audio file"""
    global models_loaded
    
    if not models_loaded:
        # Try to load models if not loaded
        try:
            load_models()
            models_loaded = True
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Models not loaded: {str(e)}'
            }), 500
    
    try:
        # Get audio file path from request
        data = request.get_json()
        if not data or 'audio_path' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing audio_path in request body'
            }), 400
        
        audio_path = data['audio_path']
        threshold = float(data.get('threshold', 0.3))
        min_confidence = float(data.get('min_confidence', 0.5))
        
        if not os.path.exists(audio_path):
            return jsonify({
                'success': False,
                'error': f'Audio file not found: {audio_path}'
            }), 404
        
        # Run prediction
        start_time = time.time()
        detections = predict(audio_path, threshold=threshold, min_confidence=min_confidence)
        inference_time = time.time() - start_time
        
        # Add timestamp
        import datetime
        timestamp = datetime.datetime.now().isoformat()
        for detection in detections:
            detection['timestamp'] = detection.get('timestamp') or timestamp
        
        return jsonify({
            'success': True,
            'detections': detections,
            'inference_time': inference_time
        })
    except Exception as e:
        print(f"Error in prediction: {e}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/predict-averaged', methods=['POST'])
def predict_averaged_endpoint():
    """Predict endpoint for multiple audio files (averaged)"""
    global models_loaded
    
    if not models_loaded:
        try:
            load_models()
            models_loaded = True
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Models not loaded: {str(e)}'
            }), 500
    
    try:
        data = request.get_json()
        if not data or 'audio_paths' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing audio_paths in request body'
            }), 400
        
        audio_paths = data['audio_paths']
        threshold = float(data.get('threshold', 0.3))
        min_confidence = float(data.get('min_confidence', 0.5))
        
        # Verify all files exist
        for audio_path in audio_paths:
            if not os.path.exists(audio_path):
                return jsonify({
                    'success': False,
                    'error': f'Audio file not found: {audio_path}'
                }), 404
        
        # Run prediction
        start_time = time.time()
        detections = predict_averaged(audio_paths, threshold=threshold, min_confidence=min_confidence)
        inference_time = time.time() - start_time
        
        # Add timestamp
        import datetime
        timestamp = datetime.datetime.now().isoformat()
        for detection in detections:
            detection['timestamp'] = detection.get('timestamp') or timestamp
        
        return jsonify({
            'success': True,
            'detections': detections,
            'chunks_processed': len(audio_paths),
            'inference_time': inference_time
        })
    except Exception as e:
        print(f"Error in averaged prediction: {e}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    # Get port from environment or use default
    port = int(os.getenv('MODEL_SERVER_PORT', 5000))
    host = os.getenv('MODEL_SERVER_HOST', '127.0.0.1')
    
    # Load models on startup
    print("Starting model server...", file=sys.stderr)
    print(f"Model type: {os.getenv('MODEL_TYPE', 'cnn14')}", file=sys.stderr)
    
    try:
        load_start_time = time.time()
        load_models()
        load_time = time.time() - load_start_time
        models_loaded = True
        print(f"Models loaded in {load_time:.2f}s. Server ready!", file=sys.stderr)
    except Exception as e:
        print(f"Warning: Failed to load models on startup: {e}", file=sys.stderr)
        print("Models will be loaded on first request", file=sys.stderr)
        models_loaded = False
    
    print(f"Starting server on {host}:{port}...", file=sys.stderr)
    app.run(host=host, port=port, threaded=True)

