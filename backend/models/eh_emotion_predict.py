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

MODEL = None
MODEL_LOADED = False
MODEL_LOAD_ERROR = None

def load_model_once():
    global MODEL, MODEL_LOADED, MODEL_LOAD_ERROR
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
        # don't exit; we'll fallback to random predictions

def detect_face(img):
    """Detect and extract face region from image using Haar Cascade"""
    try:
        # Load Haar Cascade for face detection
        cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        face_cascade = cv2.CascadeClassifier(cascade_path)
        
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.1, 4)
        
        if len(faces) > 0:
            # Use the largest face detected
            face = max(faces, key=lambda x: x[2] * x[3])  # Largest by area
            x, y, w, h = face
            # Extract face with some padding
            padding = 20
            x1 = max(0, x - padding)
            y1 = max(0, y - padding)
            x2 = min(img.shape[1], x + w + padding)
            y2 = min(img.shape[0], y + h + padding)
            return img[y1:y2, x1:x2]
        else:
            # No face detected, return full image
            return img
    except Exception:
        # If face detection fails, return full image
        return img

def preprocess(img_path):
    if cv2 is None:
        raise RuntimeError("opencv (cv2) not available. Install with: pip install opencv-python")
    img = cv2.imread(img_path)
    if img is None:
        raise ValueError("Image not found or unreadable")
    
    # Try to detect and crop face first (emotion models are often trained on face crops)
    face_img = detect_face(img)
    
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
    return x

def predict_probs(x):
    if MODEL is not None:
        preds = MODEL.predict(x, verbose=0)[0]
        return [float(p) for p in preds]
    # fallback: uniform/random probabilities
    import random
    arr = [random.random() for _ in range(len(CLASSES))]
    s = sum(arr)
    return [float(a / s) for a in arr]

def main():
    start = time.time()
    try:
        load_model_once()
        if len(sys.argv) < 2:
            print(json.dumps({"error":"Missing image_path"}))
            return
        image_path = sys.argv[1]
        x = preprocess(image_path)
        probs = predict_probs(x)
        pred_idx = int(np.argmax(probs))
        out = {
            "predicted": CLASSES[pred_idx],
            "confidence": float(probs[pred_idx]),
            "probabilities": {CLASSES[i]: float(probs[i]) for i in range(len(CLASSES))},
            "model_loaded": MODEL is not None  # Indicate if actual model was used
        }
        if MODEL_LOAD_ERROR:
            # include a warning but keep the main JSON as final line
            print(json.dumps({"warning": "model_load_failed", "error": MODEL_LOAD_ERROR}))
        if MODEL is None:
            # Warn if using fallback predictions
            print(json.dumps({"warning": "using_fallback_predictions", "message": "Model not loaded, using random predictions"}))
        out['t'] = int((time.time() - start) * 1000)
        print(json.dumps(out))
    except Exception as e:
        # Always print valid JSON on error
        print(json.dumps({"error": str(e)}))
        return

if __name__ == "__main__":
    main()
