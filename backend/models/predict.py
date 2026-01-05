#!/usr/bin/env python3
"""
Model Inference Script
Supports both YAMNet and CNN14 (PANNs) feature extractors with trained classifier models
"""

import sys
import json
import os
import numpy as np
import librosa
import soundfile as sf
import contextlib
import io

# Model type: 'yamnet' or 'cnn14'
MODEL_TYPE = os.getenv('MODEL_TYPE', 'cnn14').lower()

# Model paths (can be overridden via environment variables)
MODEL_PATH = os.getenv(
    'MODEL_PATH',
    r'C:\Users\SiluniR\Documents\final research\dataset\cnn14_classifier_v3.keras'
)
LABELS_PATH = os.getenv(
    'LABELS_PATH',
    r'C:\Users\SiluniR\Documents\final research\dataset\labels.npy'
)

# Feature extractor settings
YAMNET_MODEL_HANDLE = os.getenv('YAMNET_MODEL_HANDLE', 'https://tfhub.dev/google/yamnet/1')
SAMPLE_RATE = int(os.getenv('SAMPLE_RATE', '32000' if MODEL_TYPE == 'cnn14' else '16000'))
DURATION = float(os.getenv('DURATION', '10.0' if MODEL_TYPE == 'cnn14' else '2.0'))  # Duration in seconds: 10s for CNN14, 2s for YAMNet

# Import based on model type
if MODEL_TYPE == 'cnn14':
    import torch
    import torch.nn as nn
    from panns_inference import AudioTagging
else:
    import tensorflow as tf
    import tensorflow_hub as hub

# Class labels (13 classes from classifier model)
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
feature_extractor = None
classifier_model = None
class_labels = None
device = None


def create_pytorch_classifier(input_dim=2048, num_classes=13):
    """Create PyTorch classifier matching the training script architecture"""
    if MODEL_TYPE != 'cnn14':
        raise RuntimeError("PyTorch classifier can only be created when MODEL_TYPE='cnn14'")
    
    class Classifier(nn.Module):
        """PyTorch classifier matching the training script architecture"""
        def __init__(self, input_dim=2048, num_classes=13):
            super().__init__()
            self.net = nn.Sequential(
                nn.Linear(input_dim, 512),
                nn.ReLU(),
                nn.Dropout(0.3),
                nn.Linear(512, 256),
                nn.ReLU(),
                nn.Dropout(0.3),
                nn.Linear(256, num_classes)
            )

        def forward(self, x):
            return self.net(x)
    
    return Classifier(input_dim=input_dim, num_classes=num_classes)


def load_models():
    """Load feature extractor (YAMNet or CNN14) and classifier models (called once)"""
    global feature_extractor, classifier_model, class_labels, device
    
    if MODEL_TYPE == 'cnn14':
        # Load CNN14 feature extractor
        if feature_extractor is None:
            print("Loading CNN14 (PANNs) model...", file=sys.stderr)
            # Suppress stdout from panns_inference to avoid polluting JSON output
            with contextlib.redirect_stdout(io.StringIO()):
                feature_extractor = AudioTagging(checkpoint_path=None)
            device = 'cuda' if torch.cuda.is_available() else 'cpu'
            print(f"CNN14 loaded successfully on {device}", file=sys.stderr)
        
        # Load PyTorch classifier
        if classifier_model is None:
            print(f"Loading PyTorch classifier from {MODEL_PATH}...", file=sys.stderr)
            if not os.path.exists(MODEL_PATH):
                raise FileNotFoundError(f"Model file not found: {MODEL_PATH}")
            
            checkpoint = torch.load(MODEL_PATH, map_location=device)
            num_classes = checkpoint.get('num_classes', 13)
            classifier_model = create_pytorch_classifier(input_dim=2048, num_classes=num_classes)
            classifier_model.load_state_dict(checkpoint['model_state'])
            classifier_model.to(device)
            classifier_model.eval()
            print("PyTorch classifier loaded successfully", file=sys.stderr)
    else:
        # Load YAMNet feature extractor
        if feature_extractor is None:
            print("Loading YAMNet model...", file=sys.stderr)
            feature_extractor = hub.load(YAMNET_MODEL_HANDLE)
            print("YAMNet loaded successfully", file=sys.stderr)
        
        # Load TensorFlow/Keras classifier
        if classifier_model is None:
            print(f"Loading Keras classifier from {MODEL_PATH}...", file=sys.stderr)
            if not os.path.exists(MODEL_PATH):
                raise FileNotFoundError(f"Model file not found: {MODEL_PATH}")
            classifier_model = tf.keras.models.load_model(MODEL_PATH, compile=False)
            print("Keras classifier loaded successfully", file=sys.stderr)
    
    # Load class labels from file if available
    if class_labels is None:
        if os.path.exists(LABELS_PATH):
            print(f"Loading class labels from {LABELS_PATH}...", file=sys.stderr)
            class_labels = np.load(LABELS_PATH, allow_pickle=True)
            print(f"Loaded {len(class_labels)} class labels", file=sys.stderr)
        else:
            print(f"Labels file not found at {LABELS_PATH}, using default labels", file=sys.stderr)
            class_labels = np.array(CLASS_LABELS)


def extract_embedding(audio_path):
    """
    Extract embedding from audio file using YAMNet or CNN14
    Returns embedding vector for classifier model
    
    For CNN14, follows the exact training pipeline:
    1. Load audio
    2. Convert stereo → mono
    3. Resample to 32 kHz
    4. Normalize
    5. Repeat or trim to 10 seconds (repeats audio if shorter, trims if longer)
    6. Send through CNN14 to get 2048-dim embedding
    
    Note: Uses repetition trick for short audio (better than zero-padding)
    """
    try:
        if MODEL_TYPE == 'cnn14':
            # Step 1: Load audio
            audio, sr = sf.read(audio_path)
            
            # Step 2: Convert stereo to mono if needed
            if len(audio.shape) > 1:
                audio = np.mean(audio, axis=1)
            
            # Step 3: Resample to 32 kHz (required for CNN14)
            if sr != SAMPLE_RATE:
                import librosa
                audio = librosa.resample(audio, orig_sr=sr, target_sr=SAMPLE_RATE)
                sr = SAMPLE_RATE
            
            # Step 4: Normalize audio to [-1, 1] range
            max_val = np.max(np.abs(audio))
            if max_val > 0:
                audio = audio / max_val
            
            # Step 5: Repeat or trim to 10 seconds
            # Model expects 10-second chunks, frontend sends 4-second chunks
            # Use repetition trick: repeat short audio to fill 10 seconds
            # This is better than zero-padding because it maintains actual sound content
            target_samples = int(SAMPLE_RATE * 10.0)  # 10 seconds at 32 kHz = 320,000 samples
            audio_duration_sec = len(audio) / SAMPLE_RATE
            
            if len(audio) < target_samples:
                # Use repetition trick: repeat the audio to fill 10 seconds
                # Example: 4-second chunk → repeat 2.5x → 10 seconds
                num_repeats = int(np.ceil(target_samples / len(audio)))
                # Repeat the audio
                audio_repeated = np.tile(audio, num_repeats)
                # Trim to exactly target_samples
                audio = audio_repeated[:target_samples]
                print(f"Audio duration: {audio_duration_sec:.2f}s → repeated {num_repeats}x → 10.00s (expected: ~4.00s)", file=sys.stderr)
            elif len(audio) > target_samples:
                # Trim to 10 seconds (shouldn't happen with 4s chunks, but handle it)
                audio = audio[:target_samples]
                print(f"Audio duration: {audio_duration_sec:.2f}s → trimmed to 10.00s", file=sys.stderr)
            else:
                print(f"Audio duration: {audio_duration_sec:.2f}s (exactly 10s)", file=sys.stderr)
            
            # Reshape for panns_inference: (1, n_samples)
            audio = audio[None, :]
            
            # Step 6 & 7: Get CNN14 embedding (returns 2048-dim vector)
            # Suppress stdout from panns_inference during inference
            with contextlib.redirect_stdout(io.StringIO()):
                clipwise_output, embedding = feature_extractor.inference(audio)
            
            # Squeeze to remove batch dimension: (1, 2048) -> (2048,)
            embedding = embedding.squeeze(0)
            
            return embedding.astype(np.float32)
        else:
            # YAMNet approach: use librosa
            waveform, sr = librosa.load(audio_path, sr=SAMPLE_RATE)
            
            # Reshape waveform to 1D array
            waveform = waveform.reshape(-1)
            
            # Get YAMNet embeddings (returns sequence)
            scores, embeddings, spectrogram = feature_extractor(waveform)
            
            # Average embeddings across time frames (mean pooling)
            averaged_embedding = np.mean(embeddings.numpy(), axis=0)
            
            return averaged_embedding.astype(np.float32)
    except Exception as e:
        print(f"Error extracting embedding: {e}", file=sys.stderr)
        raise


def predict(audio_path, threshold=0.3, min_confidence=0.5, return_raw_probabilities=False):
    """
    Predict classes from audio file using YAMNet or CNN14 classifier model
    
    Args:
        audio_path: Path to audio file
        threshold: Confidence threshold for including multiple predictions (default: 0.3)
        min_confidence: Minimum confidence required for the top prediction (default: 0.5)
                        If top prediction is below this, return empty list
        return_raw_probabilities: If True, return raw probabilities before thresholding (for averaging)
    
    Returns:
        If return_raw_probabilities=False: List of detections with type, confidence, and timestamp
        If return_raw_probabilities=True: Dict with 'predictions' (array) and 'detections' (list)
    """
    # Load models if not already loaded
    load_models()
    
    # Extract embedding
    embedding = extract_embedding(audio_path)
    
    if MODEL_TYPE == 'cnn14':
        # PyTorch model inference
        embedding_tensor = torch.tensor(embedding).float().unsqueeze(0).to(device)
        
        with torch.no_grad():
            outputs = classifier_model(embedding_tensor)
            # Apply softmax to get probabilities
            predictions = torch.softmax(outputs, dim=1).cpu().numpy()[0]
    else:
        # TensorFlow/Keras model inference
        embedding_batch = np.expand_dims(embedding, axis=0)
        predictions = classifier_model.predict(embedding_batch, verbose=0)[0]
    
    # If returning raw probabilities (for averaging multiple chunks)
    if return_raw_probabilities:
        return {
            'predictions': predictions.tolist(),
            'detections': _apply_threshold(predictions, threshold, min_confidence)
        }
    
    # Get top predictions above threshold
    return _apply_threshold(predictions, threshold, min_confidence)


def _apply_threshold(predictions, threshold, min_confidence=0.5):
    """
    Apply threshold to predictions and return detections
    
    Args:
        predictions: Array of prediction probabilities
        threshold: Confidence threshold for including multiple predictions
        min_confidence: Minimum confidence required for the top prediction
    
    Returns:
        List of detections (empty if top prediction is below min_confidence)
    """
    detections = []
    top_indices = np.argsort(predictions)[::-1]  # Sort descending
    
    # Check if top prediction meets minimum confidence requirement
    top_confidence = float(predictions[top_indices[0]])
    if top_confidence < min_confidence:
        # Top prediction is not confident enough, return empty list
        return detections
    
    # Additional filtering: Check if top prediction is significantly higher than second
    # This helps reduce false positives when model is uncertain
    if len(top_indices) > 1:
        second_confidence = float(predictions[top_indices[1]])
        confidence_gap = top_confidence - second_confidence
        
        # If top prediction is not clearly better than second, require higher confidence
        # This prevents false positives when model is uncertain between classes
        if confidence_gap < 0.15 and top_confidence < 0.70:
            # Model is uncertain - require higher confidence to reduce false positives
            effective_min_confidence = min_confidence + 0.10
            if top_confidence < effective_min_confidence:
                return detections
    
    # Top prediction is confident enough, include all predictions above threshold
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


def predict_averaged(audio_paths, threshold=0.3, min_confidence=0.5):
    """
    Predict classes by averaging predictions from multiple audio chunks
    This implements step 9: Average predictions if multiple chunks are processed
    
    Args:
        audio_paths: List of paths to audio files (chunks)
        threshold: Confidence threshold for including multiple predictions (default: 0.3)
        min_confidence: Minimum confidence required for the top prediction (default: 0.5)
    
    Returns:
        List of detections with type, confidence, and timestamp
    """
    if not audio_paths:
        return []
    
    # Load models if not already loaded
    load_models()
    
    # Collect raw predictions from all chunks
    all_predictions = []
    for audio_path in audio_paths:
        result = predict(audio_path, threshold=threshold, min_confidence=min_confidence, return_raw_probabilities=True)
        all_predictions.append(np.array(result['predictions']))
    
    # Average predictions across all chunks (step 9)
    averaged_predictions = np.mean(all_predictions, axis=0)
    
    # Apply threshold to averaged predictions
    return _apply_threshold(averaged_predictions, threshold, min_confidence)


def main():
    """Main entry point for command-line usage"""
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: predict.py <audio_file_path> [threshold] [min_confidence] OR predict.py --average <audio_file1> <audio_file2> ... [threshold] [min_confidence]'}), file=sys.stderr)
        sys.exit(1)
    
    # Parse min_confidence from environment variable or use default
    min_confidence = float(os.getenv('MIN_CONFIDENCE', '0.5'))
    
    # Check if averaging mode (multiple files)
    if sys.argv[1] == '--average':
        if len(sys.argv) < 4:
            print(json.dumps({'error': 'Usage: predict.py --average <audio_file1> <audio_file2> ... [threshold] [min_confidence]'}), file=sys.stderr)
            sys.exit(1)
        
        # Parse arguments: last numeric arg is threshold, second-to-last numeric arg is min_confidence
        audio_paths = []
        threshold = 0.3
        parsed_min_confidence = min_confidence
        
        # Try to parse numeric arguments from the end
        numeric_args = []
        for arg in reversed(sys.argv[2:]):
            try:
                val = float(arg)
                numeric_args.append(val)
            except ValueError:
                break
        
        if len(numeric_args) >= 1:
            threshold = numeric_args[0]
        if len(numeric_args) >= 2:
            parsed_min_confidence = numeric_args[1]
        
        # Get audio paths (everything except the numeric args)
        audio_paths = sys.argv[2:2+len(sys.argv)-2-len(numeric_args)]
        
        # Verify all files exist
        for audio_path in audio_paths:
            if not os.path.exists(audio_path):
                print(json.dumps({'error': f'Audio file not found: {audio_path}'}), file=sys.stderr)
                sys.exit(1)
        
        try:
            detections = predict_averaged(audio_paths, threshold, parsed_min_confidence)
            
            # Add timestamp
            import datetime
            timestamp = datetime.datetime.now().isoformat()
            for detection in detections:
                detection['timestamp'] = timestamp
            
            # Output JSON result
            result = {
                'success': True,
                'detections': detections,
                'chunks_processed': len(audio_paths)
            }
            
            print(json.dumps(result))
            
        except Exception as e:
            error_result = {
                'success': False,
                'error': str(e)
            }
            print(json.dumps(error_result), file=sys.stderr)
            sys.exit(1)
    else:
        # Single file mode
        audio_path = sys.argv[1]
        threshold = float(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].replace('.', '').replace('-', '').isdigit() else 0.3
        parsed_min_confidence = float(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].replace('.', '').replace('-', '').isdigit() else min_confidence
        
        if not os.path.exists(audio_path):
            print(json.dumps({'error': f'Audio file not found: {audio_path}'}), file=sys.stderr)
            sys.exit(1)
        
        try:
            detections = predict(audio_path, threshold, parsed_min_confidence)
            
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

