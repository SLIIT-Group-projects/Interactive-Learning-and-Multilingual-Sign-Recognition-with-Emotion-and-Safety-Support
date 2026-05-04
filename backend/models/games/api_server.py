"""
Flask API server for ASL gesture recognition.
Processes images from React Native app and returns predictions using the trained model.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import tensorflow as tf
from tensorflow import keras
import base64
import io
from PIL import Image
import math

app = Flask(__name__)
CORS(app)  # Enable CORS for React Native app

# Initialize MediaPipe Hands using new API (0.10+)
# Download model if not exists, or use bundled model
import urllib.request
import os

MODEL_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hand_landmarker.task')
MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

if not os.path.exists(MODEL_FILE):
    print(f"Downloading hand landmarker model to {MODEL_FILE}...")
    try:
        urllib.request.urlretrieve(MODEL_URL, MODEL_FILE)
        print("Model downloaded successfully")
    except Exception as e:
        print(f"Warning: Could not download model: {e}")
        print("The server will try to use the model if it exists, or you can download it manually.")
        MODEL_FILE = None

if MODEL_FILE and os.path.exists(MODEL_FILE):
    base_options = python.BaseOptions(model_asset_path=MODEL_FILE)
    options = vision.HandLandmarkerOptions(
        base_options=base_options,
        num_hands=1,
        min_hand_detection_confidence=0.7,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5
    )
    hand_landmarker = vision.HandLandmarker.create_from_options(options)
    print("MediaPipe HandLandmarker initialized successfully")
else:
    print("ERROR: Hand landmarker model not found. Please download it manually or check your internet connection.")
    hand_landmarker = None

# Load the trained model
import os
MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(MODEL_DIR, 'asl_model.h5')
model = None
if not os.path.isfile(MODEL_PATH):
    print(
        "ASL letter model file is missing.\n"
        f"  Expected: {MODEL_PATH}\n"
        "  This repo does not ship asl_model.h5 — train it with the same feature pipeline as this server, "
        "or copy a compatible .h5 file into this folder.\n"
        "  (The BiLSTM in backend/model/asl-model/ is a different architecture and cannot be dropped in here.)"
    )
else:
    try:
        model = keras.models.load_model(MODEL_PATH)
        print(f"Model loaded successfully from {MODEL_PATH}")
    except Exception as e:
        print(f"Error loading model: {e}")
        print(f"Check that {MODEL_PATH} is a valid Keras model matching this server's input features.")
        model = None

# Class labels (must match training order)
CLASSES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 
           'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
           'space', 'nothing', 'del']


def calculate_distance(p1, p2):
    """Calculate Euclidean distance between two points."""
    return math.sqrt((p1['x'] - p2['x'])**2 + 
                    (p1['y'] - p2['y'])**2 + 
                    (p1['z'] - p2['z'])**2)


def calculate_angle(p1, p2, p3):
    """Calculate angle at p2 between p1-p2-p3."""
    v1 = [p1['x'] - p2['x'], p1['y'] - p2['y'], p1['z'] - p2['z']]
    v2 = [p3['x'] - p2['x'], p3['y'] - p2['y'], p3['z'] - p2['z']]
    
    dot = v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2]
    mag1 = math.sqrt(v1[0]**2 + v1[1]**2 + v1[2]**2)
    mag2 = math.sqrt(v2[0]**2 + v2[1]**2 + v2[2]**2)
    
    if mag1 == 0 or mag2 == 0:
        return 0.0
    
    cos_angle = max(-1.0, min(1.0, dot / (mag1 * mag2)))
    return math.degrees(math.acos(cos_angle))


def extract_enhanced_features(landmarks_list):
    """
    Extract enhanced features from landmarks (same as training).
    """
    if len(landmarks_list) < 21:
        return None
    
    wrist = landmarks_list[0]
    
    # Normalize all landmarks relative to wrist
    normalized_landmarks = []
    for lm in landmarks_list:
        normalized_landmarks.append({
            'x': lm['x'] - wrist['x'],
            'y': lm['y'] - wrist['y'],
            'z': lm['z'] - wrist['z']
        })
    
    # Key finger tip indices
    finger_tips = [4, 8, 12, 16, 20]
    finger_mcps = [2, 5, 9, 13, 17]
    
    # Calculate distances
    distances = {}
    
    # Wrist to finger tips
    for tip_idx in finger_tips:
        distances[f'wrist_to_tip_{tip_idx}'] = calculate_distance(
            landmarks_list[0], landmarks_list[tip_idx]
        )
    
    # Finger lengths
    finger_names = ['thumb', 'index', 'middle', 'ring', 'pinky']
    for name, mcp_idx, tip_idx in zip(finger_names, finger_mcps, finger_tips):
        distances[f'{name}_length'] = calculate_distance(
            landmarks_list[mcp_idx], landmarks_list[tip_idx]
        )
    
    # Distances between finger tips
    for i, tip1_idx in enumerate(finger_tips):
        for tip2_idx in finger_tips[i+1:]:
            distances[f'tip_{tip1_idx}_to_tip_{tip2_idx}'] = calculate_distance(
                landmarks_list[tip1_idx], landmarks_list[tip2_idx]
            )
    
    # Enhanced: Thumb position relative to other fingers
    thumb_tip = landmarks_list[4]
    thumb_mcp = landmarks_list[2]
    index_tip = landmarks_list[8]
    middle_tip = landmarks_list[12]
    ring_tip = landmarks_list[16]
    pinky_tip = landmarks_list[20]
    
    distances['thumb_to_index_tip'] = calculate_distance(thumb_tip, index_tip)
    distances['thumb_to_middle_tip'] = calculate_distance(thumb_tip, middle_tip)
    distances['thumb_to_ring_tip'] = calculate_distance(thumb_tip, ring_tip)
    distances['thumb_to_pinky_tip'] = calculate_distance(thumb_tip, pinky_tip)
    distances['thumb_to_wrist'] = calculate_distance(thumb_tip, wrist)
    
    # Enhanced: Finger extension states
    for name, mcp_idx, tip_idx in zip(finger_names[1:], finger_mcps[1:], finger_tips[1:]):
        tip_to_wrist = calculate_distance(landmarks_list[tip_idx], wrist)
        finger_length = distances[f'{name}_length']
        if finger_length > 0:
            distances[f'{name}_extension_ratio'] = tip_to_wrist / finger_length
    
    # Enhanced: Hand openness metric
    finger_tips_to_wrist = [calculate_distance(landmarks_list[tip], wrist) 
                           for tip in finger_tips[1:]]
    distances['hand_openness'] = sum(finger_tips_to_wrist) / len(finger_tips_to_wrist) if finger_tips_to_wrist else 0
    
    # Enhanced: Finger curl metrics
    for name, mcp_idx, tip_idx in zip(finger_names[1:], finger_mcps[1:], finger_tips[1:]):
        tip_to_mcp = calculate_distance(landmarks_list[tip_idx], landmarks_list[mcp_idx])
        finger_length = distances[f'{name}_length']
        if finger_length > 0:
            distances[f'{name}_curl_ratio'] = tip_to_mcp / finger_length
    
    # Calculate angles
    angles = {}
    
    finger_joints = {
        'index': [5, 6, 7, 8],
        'middle': [9, 10, 11, 12],
        'ring': [13, 14, 15, 16],
        'pinky': [17, 18, 19, 20],
        'thumb': [2, 3, 4]
    }
    
    for finger_name, joint_indices in finger_joints.items():
        if len(joint_indices) >= 3:
            if len(joint_indices) == 4:
                angles[f'{finger_name}_pip_angle'] = calculate_angle(
                    landmarks_list[joint_indices[0]],
                    landmarks_list[joint_indices[1]],
                    landmarks_list[joint_indices[2]]
                )
            elif len(joint_indices) == 3:
                angles[f'{finger_name}_angle'] = calculate_angle(
                    landmarks_list[joint_indices[0]],
                    landmarks_list[joint_indices[1]],
                    landmarks_list[joint_indices[2]]
                )
    
    # Enhanced: Thumb angles relative to hand
    angles['thumb_index_angle'] = calculate_angle(
        thumb_mcp, thumb_tip, index_tip
    )
    angles['thumb_palm_angle'] = calculate_angle(
        wrist, thumb_mcp, thumb_tip
    )
    
    # Enhanced: Finger spread angles
    finger_tip_pairs = [
        (8, 12, 'index_middle'),
        (12, 16, 'middle_ring'),
        (16, 20, 'ring_pinky')
    ]
    for tip1_idx, tip2_idx, name in finger_tip_pairs:
        angles[f'{name}_spread_angle'] = calculate_angle(
            landmarks_list[tip1_idx], wrist, landmarks_list[tip2_idx]
        )
    
    # Enhanced: Palm orientation
    angles['palm_orientation'] = calculate_angle(
        landmarks_list[5], wrist, landmarks_list[17]
    )
    
    # Build feature vector (same order as training)
    features = []
    
    # Normalized landmarks
    for lm in normalized_landmarks:
        features.extend([lm['x'], lm['y'], lm['z']])
    
    # Distances (sorted keys for consistency)
    distance_keys = sorted(distances.keys())
    for key in distance_keys:
        features.append(distances[key])
    
    # Angles (sorted keys for consistency)
    angle_keys = sorted(angles.keys())
    for key in angle_keys:
        features.append(angles[key])
    
    return np.array(features)


def process_image(image_data):
    """
    Process image and return prediction.
    
    Args:
        image_data: Base64 encoded image or numpy array
        
    Returns:
        dict with prediction results
    """
    try:
        # Decode base64 image if needed
        if isinstance(image_data, str):
            # Remove data URL prefix if present
            if ',' in image_data:
                image_data = image_data.split(',')[1]
            
            image_bytes = base64.b64decode(image_data)
            image = Image.open(io.BytesIO(image_bytes))
            image_np = np.array(image)
        else:
            image_np = image_data
        
        # Convert to RGB if needed
        if len(image_np.shape) == 3 and image_np.shape[2] == 4:
            image_np = cv2.cvtColor(image_np, cv2.COLOR_RGBA2RGB)
        elif len(image_np.shape) == 3 and image_np.shape[2] == 3:
            # Already RGB
            pass
        else:
            return {'error': 'Invalid image format'}
        
        # Process with MediaPipe (new Tasks API)
        if hand_landmarker is None:
            return {
                'success': False,
                'error': 'Hand landmarker not initialized. Please check model file.',
                'prediction': None
            }
        
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_np)
        detection_result = hand_landmarker.detect(mp_image)
        
        if not detection_result.hand_landmarks:
            return {
                'success': False,
                'error': 'No hand detected',
                'prediction': None
            }
        
        # Get the first hand
        hand_landmarks = detection_result.hand_landmarks[0]
        
        # Convert to list format (new API structure - landmarks are already in list format)
        landmarks_list = []
        for landmark in hand_landmarks:
            landmarks_list.append({
                'x': landmark.x,
                'y': landmark.y,
                'z': landmark.z
            })
        
        # Extract features
        features = extract_enhanced_features(landmarks_list)
        
        if features is None:
            return {
                'success': False,
                'error': 'Failed to extract features',
                'prediction': None
            }
        
        # Make prediction
        if model is None:
            return {
                'success': False,
                'error': 'Model not loaded',
                'prediction': None
            }
        
        # Reshape for model input
        features = features.reshape(1, -1)
        
        # Predict
        predictions = model.predict(features, verbose=0)
        predicted_idx = np.argmax(predictions[0])
        confidence = float(predictions[0][predicted_idx])
        predicted_class = CLASSES[predicted_idx]
        
        # Get top 3 predictions
        top3_indices = np.argsort(predictions[0])[-3:][::-1]
        top3_predictions = [
            {
                'letter': CLASSES[idx],
                'confidence': float(predictions[0][idx])
            }
            for idx in top3_indices
        ]
        
        return {
            'success': True,
            'prediction': predicted_class,
            'confidence': confidence,
            'top3': top3_predictions
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'prediction': None
        }


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None
    })


@app.route('/predict', methods=['POST'])
def predict():
    """
    Predict ASL letter from image.
    
    Expected JSON:
    {
        "image": "base64_encoded_image_string" or image data
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'image' not in data:
            return jsonify({
                'success': False,
                'error': 'No image provided'
            }), 400
        
        image_data = data['image']
        result = process_image(image_data)
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/detect-hand', methods=['POST'])
def detect_hand():
    """
    Quick endpoint to detect if a hand is present in the image.
    Returns only hand detection status, not full prediction (faster).
    
    Expected JSON:
    {
        "image": "base64_encoded_image_string"
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'image' not in data:
            return jsonify({
                'success': False,
                'error': 'No image provided'
            }), 400
        
        image_data = data['image']
        
        # Decode and process image
        if isinstance(image_data, str):
            if ',' in image_data:
                image_data = image_data.split(',')[1]
            image_bytes = base64.b64decode(image_data)
            image = Image.open(io.BytesIO(image_bytes))
            image_np = np.array(image)
        else:
            image_np = image_data
        
        # Convert to RGB if needed
        if len(image_np.shape) == 3 and image_np.shape[2] == 4:
            image_np = cv2.cvtColor(image_np, cv2.COLOR_RGBA2RGB)
        elif len(image_np.shape) == 3 and image_np.shape[2] == 3:
            pass
        else:
            return jsonify({
                'success': False,
                'hand_detected': False,
                'error': 'Invalid image format'
            })
        
        # Quick hand detection using MediaPipe
        if hand_landmarker is None:
            return jsonify({
                'success': False,
                'hand_detected': False,
                'error': 'Hand landmarker not initialized'
            })
        
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_np)
        detection_result = hand_landmarker.detect(mp_image)
        
        hand_detected = detection_result.hand_landmarks is not None and len(detection_result.hand_landmarks) > 0
        
        return jsonify({
            'success': True,
            'hand_detected': hand_detected
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'hand_detected': False,
            'error': str(e)
        }), 500


@app.route('/check', methods=['POST'])
def check():
    """
    Check if predicted letter matches target letter.
    
    Expected JSON:
    {
        "image": "base64_encoded_image_string",
        "targetLetter": "A"
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'image' not in data:
            return jsonify({
                'success': False,
                'error': 'No image provided'
            }), 400
        
        if 'targetLetter' not in data:
            return jsonify({
                'success': False,
                'error': 'No target letter provided'
            }), 400
        
        image_data = data['image']
        target_letter = data['targetLetter'].upper()
        
        result = process_image(image_data)
        
        if not result['success']:
            return jsonify(result)
        
        predicted_letter = result['prediction']
        is_correct = predicted_letter.upper() == target_letter.upper()
        
        result['targetLetter'] = target_letter
        result['isCorrect'] = is_correct
        result['predictedLetter'] = predicted_letter
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


if __name__ == '__main__':
    print("=" * 60)
    print("ASL Recognition API Server")
    print("=" * 60)
    print(f"Model path: {MODEL_PATH}")
    print(f"Model loaded: {model is not None}")
    print(f"Number of classes: {len(CLASSES)}")
    print("=" * 60)
    hand_port = int(os.environ.get("HAND_GAME_API_PORT", "5001"))
    print(f"\nStarting hand/letter API on http://0.0.0.0:{hand_port} (set HAND_GAME_API_PORT to override)")
    print("Endpoints:")
    print("  GET  /health - Health check")
    print("  POST /predict - Predict letter from image")
    print("  POST /check - Check if prediction matches target")
    print("=" * 60)

    app.run(host="0.0.0.0", port=hand_port, debug=True)


















