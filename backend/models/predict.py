#!/usr/bin/env python3
"""
Model Inference Script
Loads YAMNet and the trained classifier model to predict audio classes
Uses YAMNet embeddings (averaged) with a Dense classifier
"""

import sys
import json
import os
import numpy as np
import tensorflow as tf
import tensorflow_hub as hub
import librosa

# Model paths (can be overridden via environment variables)
MODEL_PATH = os.getenv(
    'MODEL_PATH',
    r'C:\Users\SiluniR\Documents\final research\dataset\yamnet_classifier_29_12_2025.keras'
)
LABELS_PATH = os.getenv(
    'LABELS_PATH',
    r'C:\Users\SiluniR\Documents\final research\dataset\labels.npy'
)
YAMNET_MODEL_HANDLE = os.getenv('YAMNET_MODEL_HANDLE', 'https://tfhub.dev/google/yamnet/1')
SAMPLE_RATE = int(os.getenv('SAMPLE_RATE', '16000'))
DURATION = float(os.getenv('DURATION', '4.0'))  # Duration in seconds for audio processing

# Class labels (13 classes from YAMNet Dense classifier model)
# Will be loaded from labels.npy if available, otherwise use this fallback
CLASS_LABELS = [
    'car_horn', 'clock_alarm', 'coughing', 'crackling_fire', 'crying_baby', 
    'dog', 'door_wood_knock', 'footsteps', 'glass_breaking', 'gun_shot', 
    'siren', 'sneezing', 'train'
]

# Map model classes to hazard types (standardized hazard type names)
HAZARD_MAPPING = {
    'siren': 'siren',
    'glass_breaking': 'glass_breaking',
    'car_horn': 'car_horn',
    'crying_baby': 'baby_crying',
    'dog': 'dog_barking',
    'gun_shot': 'gun_shot',
    'crackling_fire': 'fire_alarm',  # Map to fire_alarm for hazard system
    'clock_alarm': 'smoke_alarm',    # Map to smoke_alarm for hazard system
    'door_wood_knock': 'door_knock',
    'footsteps': 'footsteps',
    'coughing': 'coughing',
    'sneezing': 'sneezing',
    'train': 'train',
}

# Global model variables (loaded once)
yamnet_model = None
classifier_model = None
class_labels = None


def load_models():
    """Load YAMNet and classifier models (called once)"""
    global yamnet_model, classifier_model, class_labels
    
    if yamnet_model is None:
        print("Loading YAMNet model...", file=sys.stderr)
        yamnet_model = hub.load(YAMNET_MODEL_HANDLE)
        print("YAMNet loaded successfully", file=sys.stderr)
    
    if classifier_model is None:
        print(f"Loading classifier model from {MODEL_PATH}...", file=sys.stderr)
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"Model file not found: {MODEL_PATH}")
        classifier_model = tf.keras.models.load_model(MODEL_PATH, compile=False)
        print("Classifier model loaded successfully", file=sys.stderr)
    
    # Load class labels from file if available
    if class_labels is None:
        if os.path.exists(LABELS_PATH):
            print(f"Loading class labels from {LABELS_PATH}...", file=sys.stderr)
            class_labels = np.load(LABELS_PATH, allow_pickle=True)
            print(f"Loaded {len(class_labels)} class labels", file=sys.stderr)
        else:
            print(f"Labels file not found at {LABELS_PATH}, using default labels", file=sys.stderr)
            class_labels = np.array(CLASS_LABELS)


def extract_yamnet_embedding(audio_path):
    """
    Extract YAMNet embedding from audio file and average across time frames
    Returns averaged embedding vector (1024,) for Dense classifier model
    This matches the training script approach
    """
    try:
        # Load audio file
        waveform, sr = librosa.load(audio_path, sr=SAMPLE_RATE)
        
        # Reshape waveform to 1D array
        waveform = waveform.reshape(-1)
        
        # Get YAMNet embeddings (returns sequence)
        scores, embeddings, spectrogram = yamnet_model(waveform)
        
        # Average embeddings across time frames (mean pooling)
        # This matches the training script: np.mean(embeddings.numpy(), axis=0)
        averaged_embedding = np.mean(embeddings.numpy(), axis=0)
        
        return averaged_embedding.astype(np.float32)
    except Exception as e:
        print(f"Error extracting embedding: {e}", file=sys.stderr)
        raise


def predict(audio_path, threshold=0.3):
    """
    Predict classes from audio file using YAMNet Dense classifier model
    
    Args:
        audio_path: Path to audio file
        threshold: Confidence threshold (default: 0.3)
    
    Returns:
        List of detections with type, confidence, and timestamp
    """
    # Load models if not already loaded
    load_models()
    
    # Extract averaged embedding (1024,)
    embedding = extract_yamnet_embedding(audio_path)
    
    # Reshape for model input: (batch_size=1, features=1024)
    embedding_batch = np.expand_dims(embedding, axis=0)  # Shape: (1, 1024)
    
    # Get predictions from Dense classifier model
    predictions = classifier_model.predict(embedding_batch, verbose=0)[0]
    
    # Get top predictions above threshold
    detections = []
    top_indices = np.argsort(predictions)[::-1]  # Sort descending
    
    for idx in top_indices:
        confidence = float(predictions[idx])
        class_name = class_labels[idx] if class_labels is not None else CLASS_LABELS[idx]
        
        # Only include if above threshold
        if confidence >= threshold:
            # Map to hazard type if it's a hazard
            hazard_type = HAZARD_MAPPING.get(class_name, class_name)
            
            detections.append({
                'type': hazard_type,
                'confidence': confidence,
                'original_class': class_name,
                'timestamp': None  # Will be set by backend
            })
    
    return detections


def main():
    """Main entry point for command-line usage"""
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: predict.py <audio_file_path> [threshold]'}), file=sys.stderr)
        sys.exit(1)
    
    audio_path = sys.argv[1]
    threshold = float(sys.argv[2]) if len(sys.argv) > 2 else 0.3
    
    if not os.path.exists(audio_path):
        print(json.dumps({'error': f'Audio file not found: {audio_path}'}), file=sys.stderr)
        sys.exit(1)
    
    try:
        detections = predict(audio_path, threshold)
        
        # Add timestamp
        import datetime
        timestamp = datetime.datetime.now().isoformat()
        for detection in detections:
            detection['timestamp'] = timestamp
        
        # Output JSON result
        result = {
            'success': True,
            'detections': detections
        }
        
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e)
        }
        print(json.dumps(error_result), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()

