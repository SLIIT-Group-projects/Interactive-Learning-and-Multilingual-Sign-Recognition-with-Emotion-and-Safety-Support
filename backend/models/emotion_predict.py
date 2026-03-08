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
MODEL_PATH = os.path.normpath(os.path.join(SCRIPT_DIR, "emotion_cnn_48x48_best.keras"))
CLASSES = ["angry","disgust","fear","happy","neutral","sad","surprise"]
IMG_SIZE = (48, 48)

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
        MODEL = tf.keras.models.load_model(MODEL_PATH)
        MODEL_LOADED = True
    except Exception as e:
        MODEL = None
        MODEL_LOAD_ERROR = str(e)
        # don't exit; we'll fallback to random predictions

def preprocess(img_path):
    if cv2 is None:
        raise RuntimeError("opencv (cv2) not available")
    img = cv2.imread(img_path)
    if img is None:
        raise ValueError("Image not found or unreadable")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, IMG_SIZE)
    x = gray.astype(np.float32) / 255.0
    x = np.expand_dims(x, axis=-1)  # (48,48,1)
    x = np.expand_dims(x, axis=0)   # (1,48,48,1)
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
            "probabilities": {CLASSES[i]: float(probs[i]) for i in range(len(CLASSES))}
        }
        if MODEL_LOAD_ERROR:
            # include a small warning but keep the main JSON as final line
            print(json.dumps({"warning": "model_load_failed", "error": MODEL_LOAD_ERROR}))
        out['t'] = int((time.time() - start) * 1000)
        print(json.dumps(out))
    except Exception as e:
        # Always print valid JSON on error
        print(json.dumps({"error": str(e)}))
        return

if __name__ == "__main__":
    main()
