import sys, json, os, time
import numpy as np

# try to import heavy libs lazily
try:
    import tensorflow as tf
    import cv2
except Exception:
    tf = None
    cv2 = None

# Use your saved model path - relative to this script
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.normpath(os.path.join(SCRIPT_DIR, "FER_then_CK_EfficientNetB0_KEEP_NEUTRAL_final_fixed.keras"))
# Alternative model (if needed):
# MODEL_PATH = os.path.normpath(os.path.join(SCRIPT_DIR, "emotion_cnn_48x48_best.keras"))
CLASSES = ["angry","disgust","fear","happy","neutral","sad","surprise"]
IMG_SIZE = (160, 160)  # Model expects 160x160 RGB images (EfficientNetB0 variant)

# Normalization method: 'imagenet' (mean/std) or 'simple' ([0,1])
# Try 'simple' first - if predictions are wrong, switch to 'imagenet'
NORMALIZATION = 'simple'  # Change to 'imagenet' if predictions are incorrect

# Model selection: 'custom' (your Keras model), 'deepface' (DeepFace library), or 'both' (try custom first, fallback to DeepFace)
USE_MODEL = 'deepface'  # Options: 'custom', 'deepface', 'both'

MODEL = None
MODEL_LOADED = False
MODEL_LOAD_ERROR = None

# Pre-trained DeepFace model
FER_MODEL = None  # Actually DeepFace, keeping variable name for compatibility
FER_AVAILABLE = False

def load_fer_model():
    """Load pre-trained DeepFace emotion detection model"""
    global FER_MODEL, FER_AVAILABLE
    if FER_MODEL is not None or FER_AVAILABLE:
        return
    try:
        from deepface import DeepFace
        # Test if it works by importing
        FER_MODEL = DeepFace
        FER_AVAILABLE = True
        print("[DeepFace] Successfully loaded pre-trained emotion model", file=sys.stderr)
    except ImportError:
        FER_MODEL = None
        FER_AVAILABLE = False
        print("[DeepFace] DeepFace library not available. Install with: pip install deepface", file=sys.stderr)
    except Exception as e:
        FER_MODEL = None
        FER_AVAILABLE = False
        print(f"[DeepFace] Error loading model: {e}", file=sys.stderr)

def load_model_once():
    global MODEL, MODEL_LOADED, MODEL_LOAD_ERROR
    if USE_MODEL in ['deepface', 'both']:
        load_fer_model()
    
    if USE_MODEL == 'deepface':
        # Only use DeepFace, skip custom model
        return
    
    if MODEL_LOADED or MODEL is not None:
        return
    try:
        if tf is None:
            raise RuntimeError("tensorflow not available")
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"model not found: {MODEL_PATH}")
        
        # Load the model (using fixed version that has quantization_config removed)
        MODEL = tf.keras.models.load_model(MODEL_PATH, compile=False)
        MODEL_LOADED = True
        print(f"[Model] Successfully loaded model from {MODEL_PATH}", file=sys.stderr)
    except Exception as e:
        MODEL = None
        import traceback
        MODEL_LOAD_ERROR = f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
        # Print error for debugging
        print(f"[Model Load Error] {MODEL_LOAD_ERROR}", file=sys.stderr)
        # don't exit; we'll fallback to FER or random predictions

def detect_face(img):
    """Detect and extract face region from image using Haar Cascade
    Returns: (face_image, face_detected_boolean)
    Uses stricter validation to avoid false positives"""
    try:
        # Load Haar Cascade for face detection
        cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        face_cascade = cv2.CascadeClassifier(cascade_path)
        
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        img_height, img_width = gray.shape
        
        # Use stricter parameters to reduce false positives
        # minNeighbors=5 means at least 5 neighbors must agree (stricter)
        # scaleFactor=1.2 means less aggressive scaling (more accurate)
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=5, minSize=(30, 30))
        
        if len(faces) > 0:
            # Use the largest face detected
            face = max(faces, key=lambda x: x[2] * x[3])  # Largest by area
            x, y, w, h = face
            
            # Validate face size - must be reasonable (not too small, not covering entire image)
            face_area = w * h
            img_area = img_width * img_height
            face_ratio = face_area / img_area if img_area > 0 else 0
            
            # Face should be at least 2% of image and at most 80% of image
            # This prevents false positives from covering the whole image or tiny detections
            if face_ratio < 0.02 or face_ratio > 0.80:
                return img, False
            
            # Face dimensions should be reasonable (width and height should be similar for a face)
            aspect_ratio = w / h if h > 0 else 0
            if aspect_ratio < 0.5 or aspect_ratio > 2.0:  # Face should be roughly square-ish
                return img, False
            
            # Extract face with some padding
            padding = 20
            x1 = max(0, x - padding)
            y1 = max(0, y - padding)
            x2 = min(img.shape[1], x + w + padding)
            y2 = min(img.shape[0], y + h + padding)
            return img[y1:y2, x1:x2], True
        else:
            # No face detected
            return img, False
    except Exception:
        # If face detection fails, assume no face detected
        return img, False

def preprocess(img_path):
    """Preprocess image and return (preprocessed_tensor, face_detected_boolean)"""
    if cv2 is None:
        raise RuntimeError("opencv (cv2) not available. Install with: pip install opencv-python")
    img = cv2.imread(img_path)
    if img is None:
        raise ValueError("Image not found or unreadable")
    
    # Try to detect and crop face first (emotion models are often trained on face crops)
    face_img, face_detected = detect_face(img)
    
    # Convert BGR to RGB
    rgb = cv2.cvtColor(face_img, cv2.COLOR_BGR2RGB)
    
    # Resize to model input size
    rgb = cv2.resize(rgb, IMG_SIZE, interpolation=cv2.INTER_AREA)
    
    # Normalize based on NORMALIZATION setting
    x = rgb.astype(np.float32) / 255.0
    
    if NORMALIZATION == 'imagenet':
        # ImageNet normalization (standard for EfficientNet models)
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        x = (x - mean) / std
    # else: simple [0,1] normalization (already done above)
    
    # Add batch dimension: (160, 160, 3) -> (1, 160, 160, 3)
    x = np.expand_dims(x, axis=0)
    return x, face_detected

def predict_probs_fer(img_path):
    """Predict emotions using DeepFace library
    Returns: (probabilities_list, face_detected_boolean) or (None, False) if error"""
    if not FER_AVAILABLE or FER_MODEL is None:
        return None, False
    
    try:
        # DeepFace analyzes emotions from image
        result = FER_MODEL.analyze(
            img_path=img_path,
            actions=['emotion'],
            enforce_detection=False,  # Don't fail if face not detected
            silent=True
        )
        
        # Handle both single result and list of results
        if isinstance(result, list):
            result = result[0]
        
        # Check if face was detected with stricter validation
        # DeepFace returns 'region' with face coordinates if face is detected
        face_detected = False
        if 'region' in result:
            region = result['region']
            w = region.get('w', 0)
            h = region.get('h', 0)
            x = region.get('x', 0)
            y = region.get('y', 0)
            
            # Check if region has valid dimensions
            if w > 0 and h > 0:
                # Additional validation: check if face size is reasonable
                # Read image to get dimensions for validation
                try:
                    img = cv2.imread(img_path)
                    if img is not None:
                        img_height, img_width = img.shape[:2]
                        face_area = w * h
                        img_area = img_width * img_height
                        face_ratio = face_area / img_area if img_area > 0 else 0
                        
                        # Face should be at least 1% of image and at most 70% of image
                        # This prevents false positives from covering the whole image
                        if face_ratio < 0.01 or face_ratio > 0.70:
                            return None, False
                        
                        # Face aspect ratio should be reasonable (roughly square-ish)
                        aspect_ratio = w / h if h > 0 else 0
                        if aspect_ratio < 0.4 or aspect_ratio > 2.5:
                            return None, False
                except Exception:
                    pass  # If validation fails, continue with basic check
                
                face_detected = True
        
        if not face_detected or 'emotion' not in result:
            return None, False
        
        emotions = result['emotion']
        
        # Map DeepFace emotions to our CLASSES
        # DeepFace outputs: angry, disgust, fear, happy, sad, surprise, neutral
        # Create probability array matching our CLASSES order
        probs = []
        for cls in CLASSES:
            # DeepFace uses same emotion names
            prob = emotions.get(cls, 0.0) / 100.0  # DeepFace returns percentages
            probs.append(float(prob))
        
        # Normalize to ensure sum = 1
        total = sum(probs)
        if total > 0:
            probs = [p / total for p in probs]
            
            # Additional validation: check if emotion probabilities are too uniform
            # If all emotions are very similar (low confidence), it might be a false positive
            max_prob = max(probs)
            if max_prob < 0.3:  # If highest emotion is less than 30%, might be false positive
                # Check if probabilities are too uniform (low confidence detection)
                prob_variance = np.var(probs)
                if prob_variance < 0.01:  # Very uniform probabilities suggest no clear emotion
                    return None, False
        else:
            # No valid emotions detected
            return None, False
        
        return probs, True
    except Exception as e:
        print(f"[DeepFace] Prediction error: {e}", file=sys.stderr)
        return None, False

def predict_probs(x, img_path=None, face_detected_custom=None):
    """Predict probabilities - tries custom model first, then DeepFace if available
    Returns: (probabilities_list, face_detected_boolean)"""
    face_detected = False
    
    # Try custom model first if enabled
    if USE_MODEL in ['custom', 'both'] and MODEL is not None and x is not None:
        try:
            # Use face detection status from preprocessing
            if face_detected_custom is not None:
                face_detected = face_detected_custom
            if not face_detected:
                return None, False
            
            preds = MODEL.predict(x, verbose=0)[0]
            return [float(p) for p in preds], True
        except Exception as e:
            print(f"[Model] Prediction error: {e}", file=sys.stderr)
            # Fall through to DeepFace
    
    # Try DeepFace model if available
    if USE_MODEL in ['deepface', 'both'] and img_path and FER_AVAILABLE:
        fer_probs, fer_face_detected = predict_probs_fer(img_path)
        if fer_probs is not None and fer_face_detected:
            return fer_probs, True
        elif not fer_face_detected:
            return None, False
    
    # If we reach here, no face was detected or models failed
    return None, False

def main():
    start = time.time()
    try:
        load_model_once()
        if len(sys.argv) < 2:
            print(json.dumps({"error":"Missing image_path"}))
            return
        image_path = sys.argv[1]
        
        # Preprocess if using custom model
        x = None
        face_detected_custom = None
        if USE_MODEL in ['custom', 'both']:
            x, face_detected_custom = preprocess(image_path)
        
        # Predict probabilities
        probs, face_detected = predict_probs(x, image_path, face_detected_custom)
        
        # Check if face was detected
        if not face_detected or probs is None:
            out = {
                "predicted": "no_face_detected",
                "confidence": 0.0,
                "probabilities": {},
                "model_loaded": (MODEL is not None) or FER_AVAILABLE,
                "model_used": "none",
                "face_detected": False,
                "message": "No face detected in image"
            }
            out['t'] = int((time.time() - start) * 1000)
            print(json.dumps(out))
            return
        
        pred_idx = int(np.argmax(probs))
        
        # Determine which model was used
        model_used = "none"
        if USE_MODEL in ['custom', 'both'] and MODEL is not None and face_detected_custom:
            model_used = "custom"
        elif USE_MODEL in ['deepface', 'both'] and FER_AVAILABLE:
            model_used = "deepface"
        
        out = {
            "predicted": CLASSES[pred_idx],
            "confidence": float(probs[pred_idx]),
            "probabilities": {CLASSES[i]: float(probs[i]) for i in range(len(CLASSES))},
            "model_loaded": (MODEL is not None) or FER_AVAILABLE,
            "model_used": model_used,
            "face_detected": True
        }
        if MODEL_LOAD_ERROR:
            # include a warning but keep the main JSON as final line
            print(json.dumps({"warning": "model_load_failed", "error": MODEL_LOAD_ERROR}))
        out['t'] = int((time.time() - start) * 1000)
        print(json.dumps(out))
    except Exception as e:
        # Always print valid JSON on error
        print(json.dumps({"error": str(e)}))
        return

if __name__ == "__main__":
    main()
