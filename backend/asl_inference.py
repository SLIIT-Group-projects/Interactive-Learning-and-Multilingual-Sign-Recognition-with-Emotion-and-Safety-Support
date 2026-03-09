import json
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from tensorflow.keras.models import load_model

MODEL_PATH = "model/asl-model/asl_bilstm.keras"
LABELS_PATH = "model/asl-model/asl_labels.json"
HAND_MODEL_PATH = "model/asl-model/hand_landmarker.task"

SEQ_LEN = 30
FEATURES = 126
FRAME_SKIP = 2  # Process every Nth frame (from Python test)
PREDICT_EVERY = 5  # Predict every Nth collected frame (from Python test)

asl_model = load_model(MODEL_PATH)

with open(LABELS_PATH, "r", encoding="utf-8") as f:
    asl_label_map = json.load(f)
asl_label_map = {int(k): v for k, v in asl_label_map.items()}

base_options = python.BaseOptions(model_asset_path=HAND_MODEL_PATH)
options = vision.HandLandmarkerOptions(
    base_options=base_options,
    num_hands=2,
    min_hand_detection_confidence=0.5,
    min_hand_presence_confidence=0.5,
    min_tracking_confidence=0.5
)
detector = vision.HandLandmarker.create_from_options(options)

sequence_buffer = []
frame_counter = 0  # Track frames for FRAME_SKIP logic
prediction_counter = 0  # Track predictions for PREDICT_EVERY logic
last_prediction = None  # Cache last prediction for display when skipping frames

def reset_asl_buffer():
    global sequence_buffer, frame_counter, prediction_counter, last_prediction
    sequence_buffer = []
    frame_counter = 0
    prediction_counter = 0
    last_prediction = None

def extract_landmarks_from_frame(frame):
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = detector.detect(mp_image)

    frame_features = []

    if result.hand_landmarks:
        hands = result.hand_landmarks[:2]
        for hand_landmarks in hands:
            hand_features = []
            for lm in hand_landmarks:
                hand_features.extend([lm.x, lm.y, lm.z])
            frame_features.extend(hand_features)

        while len(frame_features) < 126:
            frame_features.extend([0.0] * 63)
    else:
        frame_features = [0.0] * 126

    return np.array(frame_features, dtype=np.float32)

def normalize_sequence(sequence):
    seq = sequence.copy().astype(np.float32)

    for i in range(len(seq)):
        frame = seq[i]
        hand1 = frame[:63].copy()
        hand2 = frame[63:].copy()

        if np.any(hand1 != 0):
            wrist1 = hand1[0:3].copy()
            hand1 = hand1.reshape(21, 3)
            hand1 = hand1 - wrist1
            scale1 = np.max(np.linalg.norm(hand1, axis=1))
            if scale1 > 0:
                hand1 = hand1 / scale1
            hand1 = hand1.flatten()

        if np.any(hand2 != 0):
            wrist2 = hand2[0:3].copy()
            hand2 = hand2.reshape(21, 3)
            hand2 = hand2 - wrist2
            scale2 = np.max(np.linalg.norm(hand2, axis=1))
            if scale2 > 0:
                hand2 = hand2 / scale2
            hand2 = hand2.flatten()

        seq[i] = np.concatenate([hand1, hand2])

    return seq

def pad_or_truncate(sequence, target_len=SEQ_LEN):
    if len(sequence) > target_len:
        return sequence[-target_len:]
    elif len(sequence) < target_len:
        pad = np.zeros((target_len - len(sequence), FEATURES), dtype=np.float32)
        return np.vstack([sequence, pad])
    return sequence

def predict_asl_from_frame(frame):
    """
    Predict ASL sign from frame using timing logic matching Python live test:
    - FRAME_SKIP: Only process every Nth frame (skip some frames)
    - PREDICT_EVERY: Only predict every Nth collected frame
    """
    global sequence_buffer, frame_counter, prediction_counter, last_prediction

    # FRAME_SKIP logic: only process every Nth frame
    frame_counter += 1
    if frame_counter % FRAME_SKIP != 0:
        # Skip this frame, return cached last prediction if available
        if last_prediction is not None:
            return last_prediction
        # Otherwise return building message
        return {
            "prediction": "...",
            "english_translation": "...",
            "confidence": 0.0,
            "no_hand": False
        }

    # Extract features and add to buffer
    features = extract_landmarks_from_frame(frame)
    sequence_buffer.append(features)

    # Keep buffer manageable
    if len(sequence_buffer) > SEQ_LEN:
        sequence_buffer = sequence_buffer[-SEQ_LEN:]

    # Need minimum frames before predicting
    if len(sequence_buffer) < 5:
        return {
            "prediction": "...",
            "english_translation": "...",
            "confidence": 0.0,
            "no_hand": False
        }

    # PREDICT_EVERY logic: only predict every Nth collected frame
    prediction_counter += 1
    if prediction_counter % PREDICT_EVERY != 0:
        # Don't predict yet, just building sequence
        return {
            "prediction": "...",
            "english_translation": "...",
            "confidence": 0.0,
            "no_hand": False
        }

    # Now actually predict
    seq = np.array(sequence_buffer, dtype=np.float32)
    seq = normalize_sequence(seq)
    seq = pad_or_truncate(seq, SEQ_LEN)
    seq = np.expand_dims(seq, axis=0)

    pred = asl_model.predict(seq, verbose=0)
    pred_class = int(np.argmax(pred))
    pred_word = asl_label_map[pred_class]
    confidence = float(np.max(pred))

    # Cache the prediction for when we skip frames
    last_prediction = {
        "prediction": pred_word,
        "english_translation": pred_word,
        "confidence": confidence,
        "no_hand": False
    }

    return last_prediction