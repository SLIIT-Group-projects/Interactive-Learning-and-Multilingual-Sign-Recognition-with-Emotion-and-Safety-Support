from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import tensorflow as tf
from tensorflow import keras
from PIL import Image
import io
import base64
import cv2
import json
import os

# MobileNetV2 preprocessing
try:
    from tensorflow.keras.applications.mobilenet_v2 import preprocess_input as mobilenet_preprocess
except ImportError:
    try:
        from keras.applications.mobilenet_v2 import preprocess_input as mobilenet_preprocess
    except ImportError:
        def mobilenet_preprocess(x):
            return x / 127.5 - 1.0

keras = tf.keras

# Import ASL inference
from asl_inference import predict_asl_from_frame, reset_asl_buffer

# -----------------------------
# MediaPipe for Sinhala hand crop
# -----------------------------
MEDIAPIPE_AVAILABLE = False
hands_detector = None

try:
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision
    import mediapipe as mp

    base_options = python.BaseOptions()
    options = vision.HandLandmarkerOptions(
        base_options=base_options,
        num_hands=1,
        min_hand_detection_confidence=0.5,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5
    )
    hands_detector = vision.HandLandmarker.create_from_options(options)
    MEDIAPIPE_AVAILABLE = True
    print("MediaPipe Hands for Sinhala cropping initialized successfully")
except Exception as e:
    print(f"Warning: Could not initialize MediaPipe Hands: {e}")
    MEDIAPIPE_AVAILABLE = False
    hands_detector = None

app = Flask(__name__)
CORS(app)

models = {}
class_labels = {}
english_translations = {}
model_info = {}
current_language = 'sinhala'

# -----------------------------
# Load class info
# -----------------------------
def load_class_info(language='sinhala'):
    global class_labels, model_info, english_translations

    try:
        if language == 'sinhala':
            class_info_path = 'model/sinhala-model/class_info.json'
            with open(class_info_path, 'r', encoding='utf-8') as f:
                class_data = json.load(f)

            class_labels[language] = class_data.get('class_names', [])
            model_info[language] = class_data.get('model_info', {})
            english_translations[language] = class_data.get('english_translations', {})

        elif language == 'asl':
            labels_path = 'model/asl-model/asl_labels.json'
            with open(labels_path, 'r', encoding='utf-8') as f:
                label_map = json.load(f)

            ordered_labels = [label_map[str(i)] for i in range(len(label_map))]
            class_labels[language] = ordered_labels
            model_info[language] = {
                "architecture": "BiLSTM",
                "input_size": [30, 126]
            }
            english_translations[language] = {label: label for label in ordered_labels}

        else:
            print(f"Unknown language: {language}")
            return False

        print(f"Loaded {len(class_labels[language])} class labels for {language}")
        return True

    except Exception as e:
        print(f"Error loading class info for {language}: {str(e)}")
        return False

# -----------------------------
# Load model
# -----------------------------
def load_model(language='sinhala'):
    global models

    try:
        if not load_class_info(language):
            print(f"Warning: Could not load class info for {language}")
            return False

        if language == 'sinhala':
            model_path = 'model/sinhala-model/sinhala_sign_model_final.keras'
        elif language == 'asl':
            model_path = 'model/asl-model/asl_bilstm.keras'
        else:
            print(f"Unknown language: {language}")
            return False

        print(f"Attempting to load {language} model from {model_path}...")

        try:
            model = tf.keras.models.load_model(model_path, compile=False)
            try:
                model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
            except Exception as compile_error:
                print(f"Warning: Could not compile model, but continuing: {compile_error}")
        except Exception as e1:
            print(f"First loading attempt failed: {str(e1)}")
            try:
                model = tf.keras.models.load_model(model_path, compile=False, safe_mode=False)
            except Exception as e2:
                print(f"Second loading attempt failed: {str(e2)}")
                model = tf.keras.models.load_model(model_path, compile=False, custom_objects={})

        if model is None:
            raise Exception("Model is None after loading attempts")

        models[language] = model

        print(f"{language.upper()} model loaded successfully from {model_path}")
        print(f"Model input shape: {model.input_shape}")
        print(f"Model output shape: {model.output_shape}")

        return True

    except Exception as e:
        print(f"Error loading {language} model: {str(e)}")
        return False

# -----------------------------
# Sinhala hand crop
# -----------------------------
def detect_and_crop_hand(image_bytes):
    if not MEDIAPIPE_AVAILABLE or hands_detector is None:
        return image_bytes

    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return None

        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        height, width = img_rgb.shape[:2]

        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
        detection_result = hands_detector.detect(mp_image)

        if not detection_result.hand_landmarks or len(detection_result.hand_landmarks) == 0:
            return None

        hand_landmarks = detection_result.hand_landmarks[0]

        x_coords = [landmark.x for landmark in hand_landmarks]
        y_coords = [landmark.y for landmark in hand_landmarks]

        x_min = int(min(x_coords) * width)
        x_max = int(max(x_coords) * width)
        y_min = int(min(y_coords) * height)
        y_max = int(max(y_coords) * height)

        padding_x = int((x_max - x_min) * 0.2)
        padding_y = int((y_max - y_min) * 0.2)

        x_min = max(0, x_min - padding_x)
        x_max = min(width, x_max + padding_x)
        y_min = max(0, y_min - padding_y)
        y_max = min(height, y_max + padding_y)

        hand_crop = img_rgb[y_min:y_max, x_min:x_max]

        if hand_crop.size == 0:
            return None

        hand_crop_bgr = cv2.cvtColor(hand_crop, cv2.COLOR_RGB2BGR)
        _, encoded_img = cv2.imencode('.jpg', hand_crop_bgr)
        return encoded_img.tobytes()

    except Exception as e:
        print(f"Error in hand detection: {str(e)}")
        return None

# -----------------------------
# Sinhala preprocess
# -----------------------------
def preprocess_image(image_bytes, target_size=None, use_tf_preprocess=True):
    global current_language

    try:
        if target_size is None:
            if current_language in model_info and model_info[current_language] and 'input_size' in model_info[current_language]:
                input_size = model_info[current_language]['input_size']
                target_size = (input_size[0], input_size[1])
            else:
                target_size = (224, 224)

        image = Image.open(io.BytesIO(image_bytes))

        if image.mode != 'RGB':
            image = image.convert('RGB')

        try:
            image = image.resize(target_size, Image.Resampling.LANCZOS)
        except AttributeError:
            image = image.resize(target_size, Image.LANCZOS)

        img_array = np.array(image, dtype=np.float32)

        if use_tf_preprocess:
            img_array = mobilenet_preprocess(img_array)
        else:
            img_array = img_array / 127.5 - 1.0

        img_array = np.expand_dims(img_array, axis=0)

        return img_array

    except Exception as e:
        print(f"Error preprocessing image: {str(e)}")
        raise

def preprocess_image_standard(image_bytes, target_size=None):
    global current_language

    try:
        if target_size is None:
            if current_language in model_info and model_info[current_language] and 'input_size' in model_info[current_language]:
                input_size = model_info[current_language]['input_size']
                target_size = (input_size[0], input_size[1])
            else:
                target_size = (224, 224)

        image = Image.open(io.BytesIO(image_bytes))

        if image.mode != 'RGB':
            image = image.convert('RGB')

        try:
            image = image.resize(target_size, Image.Resampling.LANCZOS)
        except AttributeError:
            image = image.resize(target_size, Image.LANCZOS)

        img_array = np.array(image, dtype=np.float32) / 255.0
        img_array = np.expand_dims(img_array, axis=0)

        return img_array

    except Exception as e:
        print(f"Error preprocessing image (standard): {str(e)}")
        raise

# -----------------------------
# Decode base64 image
# -----------------------------
def decode_base64_image(image_data):
    if image_data.startswith('data:image'):
        image_data = image_data.split(',')[1]
    image_bytes = base64.b64decode(image_data)
    return image_bytes

# -----------------------------
# Health
# -----------------------------
@app.route('/health', methods=['GET'])
def health_check():
    lang = request.args.get('language', current_language).lower()

    model_loaded = lang in models and models[lang] is not None
    classes = class_labels.get(lang, [])
    info = model_info.get(lang, {})

    return jsonify({
        'status': 'healthy',
        'current_language': lang,
        'model_loaded': model_loaded,
        'classes_loaded': len(classes) > 0,
        'total_classes': len(classes),
        'class_names': classes,
        'model_info': info,
        'available_languages': list(models.keys())
    })

# -----------------------------
# Reset ASL buffer manually if needed
# -----------------------------
@app.route('/reset-asl-buffer', methods=['POST'])
def reset_asl():
    try:
        reset_asl_buffer()
        return jsonify({
            'success': True,
            'message': 'ASL sequence buffer reset successfully'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# -----------------------------
# Predict
# -----------------------------
@app.route('/predict', methods=['POST'])
def predict():
    global current_language

    try:
        data = request.get_json() if request.is_json else {}
        language = request.args.get('language', data.get('language', current_language)).lower()

        if language not in models or models[language] is None:
            return jsonify({
                'error': f'Model for language "{language}" not loaded. Available languages: {list(models.keys())}'
            }), 400

        model = models[language]
        current_language = language

        preprocessing_method = request.args.get('preprocessing', 'mobilenet')

        if 'image' not in request.files:
            if data and 'image' in data:
                image_bytes = decode_base64_image(data['image'])
            else:
                return jsonify({'error': 'No image provided'}), 400
        else:
            image_file = request.files['image']
            image_bytes = image_file.read()

        # Convert bytes to OpenCV frame for ASL
        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            return jsonify({'error': 'Invalid image'}), 400

        # -----------------------------
        # ASL path
        # -----------------------------
        if language == 'asl':
            result = predict_asl_from_frame(frame)

            return jsonify({
                'success': True,
                'prediction': result['prediction'],
                'english_translation': result['english_translation'],
                'confidence': result['confidence'],
                'language': language
            })

        # -----------------------------
        # Sinhala path
        # -----------------------------
        elif language == 'sinhala':
            cropped_hand_bytes = detect_and_crop_hand(image_bytes)

            if cropped_hand_bytes is None:
                return jsonify({
                    'success': False,
                    'error': 'no_hand_detected',
                    'message': 'No hand detected in the image. Please ensure your hand is visible in the camera frame.',
                    'prediction': None,
                    'english_translation': None,
                    'confidence': 0.0
                }), 200

            image_bytes = cropped_hand_bytes

            if preprocessing_method == 'standard':
                processed_image = preprocess_image_standard(image_bytes)
            elif preprocessing_method == 'manual':
                processed_image = preprocess_image(image_bytes, use_tf_preprocess=False)
            else:
                processed_image = preprocess_image(image_bytes, use_tf_preprocess=True)

            predictions = model.predict(processed_image, verbose=0)

            labels = class_labels.get(language, [])
            predicted_class_idx = int(np.argmax(predictions[0]))
            confidence = float(predictions[0][predicted_class_idx])

            if len(labels) > 0 and predicted_class_idx < len(labels):
                predicted_class = labels[predicted_class_idx]
            else:
                predicted_class = f"Class_{predicted_class_idx}"

            translations = english_translations.get(language, {})
            english_translation = translations.get(predicted_class, predicted_class)

            top_3_indices = np.argsort(predictions[0])[-3:][::-1]
            top_3_predictions = []

            for idx in top_3_indices:
                if len(labels) > 0 and idx < len(labels):
                    label = labels[idx]
                    translation = translations.get(label, label)
                else:
                    label = f"Class_{idx}"
                    translation = label

                top_3_predictions.append({
                    'label': label,
                    'english_translation': translation,
                    'confidence': float(predictions[0][idx])
                })

            return jsonify({
                'success': True,
                'prediction': predicted_class,
                'english_translation': english_translation,
                'confidence': confidence,
                'top_3': top_3_predictions,
                'language': language,
                'preprocessing_method': preprocessing_method
            })

        return jsonify({'error': 'Unsupported language'}), 400

    except Exception as e:
        print(f"Error during prediction: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# -----------------------------
# Main
# -----------------------------
if __name__ == '__main__':
    print("Starting Flask server...")
    print("=" * 50)

    sinhala_loaded = load_model('sinhala')
    asl_loaded = load_model('asl')

    if sinhala_loaded:
        print("=" * 50)
        print("Server ready!")
        print(f"Loaded models: {list(models.keys())}")
        print("Server running on http://0.0.0.0:5000")
        print("Access from this computer: http://localhost:5000")
        print("Access from network: http://YOUR_IP:5000")
        print("=" * 50)
        app.run(host='0.0.0.0', port=5000, debug=True)
    else:
        print("=" * 50)
        print("Failed to load Sinhala model. Server not started.")
        print("=" * 50)