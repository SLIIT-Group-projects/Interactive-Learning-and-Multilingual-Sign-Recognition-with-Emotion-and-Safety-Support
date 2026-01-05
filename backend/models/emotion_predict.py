import sys, json
import numpy as np
import tensorflow as tf
import cv2

MODEL_PATH = "models/emotion_cnn_48x48_best.keras"
CLASSES = ["angry","disgust","fear","happy","neutral","sad","surprise"]
IMG_SIZE = (48, 48)

model = tf.keras.models.load_model(MODEL_PATH)

def preprocess(img_path):
    img = cv2.imread(img_path)
    if img is None:
        raise ValueError("Image not found")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, IMG_SIZE)

    x = gray.astype(np.float32) / 255.0
    x = np.expand_dims(x, axis=-1)  # (48,48,1)
    x = np.expand_dims(x, axis=0)   # (1,48,48,1)
    return x

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error":"Missing image_path"}))
        return

    image_path = sys.argv[1]
    x = preprocess(image_path)

    probs = model.predict(x, verbose=0)[0]
    pred_idx = int(np.argmax(probs))

    out = {
        "predicted": CLASSES[pred_idx],
        "confidence": float(probs[pred_idx]),
        "probabilities": {CLASSES[i]: float(probs[i]) for i in range(len(CLASSES))}
    }

    print(json.dumps(out))

if __name__ == "__main__":
    main()
