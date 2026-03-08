"""Test script to compare different preprocessing methods"""
import sys
import numpy as np
from eh_emotion_predict import load_model_once, CLASSES, MODEL, IMG_SIZE
import cv2

def preprocess_simple(img_path):
    """Simple [0,1] normalization"""
    img = cv2.imread(img_path)
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    rgb = cv2.resize(rgb, IMG_SIZE)
    x = rgb.astype(np.float32) / 255.0
    return np.expand_dims(x, axis=0)

def preprocess_imagenet(img_path):
    """ImageNet normalization"""
    img = cv2.imread(img_path)
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    rgb = cv2.resize(rgb, IMG_SIZE, interpolation=cv2.INTER_AREA)
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    x = rgb.astype(np.float32) / 255.0
    x = (x - mean) / std
    return np.expand_dims(x, axis=0)

if __name__ == "__main__":
    import time
    load_model_once()
    time.sleep(1)  # Give model time to load
    if MODEL is None:
        print("Model not loaded!")
        sys.exit(1)
    
    img_path = sys.argv[1] if len(sys.argv) > 1 else r"D:\MY PROJECTS\Interactive-Learning-and-Multilingual-Sign-Recognition-with-Emotion-and-Safety-Support\backend\uploads\emotion\session_1772520377155_xeu34zqqz\1772520398701-371680580.jpg"
    
    print("Testing Simple [0,1] normalization:")
    x1 = preprocess_simple(img_path)
    probs1 = MODEL.predict(x1, verbose=0)[0]
    pred1 = CLASSES[np.argmax(probs1)]
    print(f"  Predicted: {pred1} ({probs1[np.argmax(probs1)]:.4f})")
    print(f"  Happy: {probs1[CLASSES.index('happy')]:.4f}, Angry: {probs1[CLASSES.index('angry')]:.4f}")
    
    print("\nTesting ImageNet normalization:")
    x2 = preprocess_imagenet(img_path)
    probs2 = MODEL.predict(x2, verbose=0)[0]
    pred2 = CLASSES[np.argmax(probs2)]
    print(f"  Predicted: {pred2} ({probs2[np.argmax(probs2)]:.4f})")
    print(f"  Happy: {probs2[CLASSES.index('happy')]:.4f}, Angry: {probs2[CLASSES.index('angry')]:.4f}")
