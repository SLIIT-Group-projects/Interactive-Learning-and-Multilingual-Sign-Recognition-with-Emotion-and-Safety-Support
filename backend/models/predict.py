#!/usr/bin/env python3
"""
Model Inference Script
Loads YAMNet and the trained classifier model to predict audio classes
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
    r'C:\Users\SiluniR\Documents\final research\dataset\ESC-50\hazard_yamnet_finetuned_stage2.keras'
)
YAMNET_MODEL_HANDLE = os.getenv('YAMNET_MODEL_HANDLE', 'https://tfhub.dev/google/yamnet/1')
SAMPLE_RATE = int(os.getenv('SAMPLE_RATE', '16000'))

# Class labels (55 classes from ESC-50 dataset)
CLASS_LABELS = [
    'air_conditioner', 'airplane', 'breathing', 'brushing_teeth', 'can_opening',
    'car_horn', 'cat', 'chainsaw', 'children_playing', 'chirping_birds',
    'church_bells', 'clapping', 'clock_alarm', 'clock_tick', 'coughing', 'cow',
    'crackling_fire', 'crickets', 'crow', 'crying_baby', 'dog', 'door_wood_creaks',
    'door_wood_knock', 'drilling', 'drinking_sipping', 'engine', 'fireworks',
    'footsteps', 'frog', 'glass_breaking', 'gun_shot', 'hand_saw', 'helicopter',
    'hen', 'insects', 'keyboard_typing', 'laughing', 'mouse_click', 'pig',
    'pouring_water', 'rain', 'rooster', 'sea_waves', 'sheep', 'siren', 'sneezing',
    'snoring', 'street_music', 'thunderstorm', 'toilet_flush', 'train',
    'vacuum_cleaner', 'washing_machine', 'water_drops', 'wind'
]

# Map model classes to hazard types (only include classes that are actual hazards)
# Maps ESC-50 class names to standardized hazard type names
HAZARD_MAPPING = {
    'siren': 'siren',
    'glass_breaking': 'glass_breaking',
    'car_horn': 'car_horn',
    'crying_baby': 'baby_crying',
    'dog': 'dog_barking',
    'gun_shot': 'gun_shot',
    'chainsaw': 'chainsaw',
    'fireworks': 'fireworks',
    'crackling_fire': 'fire',
    'clock_alarm': 'alarm',
    'church_bells': 'alarm',  # Could be emergency bells
    # Note: 'fire_alarm' and 'smoke_alarm' are not in ESC-50 classes
    # but are kept in mapping for compatibility with hazard priority system
}

# Global model variables (loaded once)
yamnet_model = None
classifier_model = None


def load_models():
    """Load YAMNet and classifier models (called once)"""
    global yamnet_model, classifier_model
    
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


def extract_yamnet_embedding(audio_path):
    """Extract YAMNet embedding from audio file"""
    try:
        # Load audio file
        waveform, _ = librosa.load(audio_path, sr=SAMPLE_RATE, mono=True)
        
        # Get YAMNet embeddings
        scores, embeddings, spectrogram = yamnet_model(waveform)
        
        # Average embeddings over time
        mean_embedding = tf.reduce_mean(embeddings, axis=0)
        
        return mean_embedding.numpy()
    except Exception as e:
        print(f"Error extracting embedding: {e}", file=sys.stderr)
        raise


def predict(audio_path, threshold=0.3):
    """
    Predict classes from audio file
    
    Args:
        audio_path: Path to audio file
        threshold: Confidence threshold (default: 0.3)
    
    Returns:
        List of detections with type, confidence, and timestamp
    """
    # Load models if not already loaded
    load_models()
    
    # Extract embedding
    embedding = extract_yamnet_embedding(audio_path)
    
    # Reshape for model input (batch_size=1, features=1024)
    embedding_batch = np.expand_dims(embedding, axis=0)
    
    # Get predictions
    predictions = classifier_model.predict(embedding_batch, verbose=0)[0]
    
    # Get top predictions above threshold
    detections = []
    top_indices = np.argsort(predictions)[::-1]  # Sort descending
    
    for idx in top_indices:
        confidence = float(predictions[idx])
        class_name = CLASS_LABELS[idx]
        
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

