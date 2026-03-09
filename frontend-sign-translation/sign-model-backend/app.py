from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import tensorflow as tf
# Use tf.keras instead of standalone keras for better compatibility
from tensorflow import keras
from PIL import Image
import io
import base64
import cv2
import json
import os
# Import MobileNetV2 preprocessing function
try:
    from tensorflow.keras.applications.mobilenet_v2 import preprocess_input as mobilenet_preprocess
except ImportError:
    try:
        from keras.applications.mobilenet_v2 import preprocess_input as mobilenet_preprocess
    except ImportError:
        # Fallback: define manually if import fails
        def mobilenet_preprocess(x):
            return x / 127.5 - 1.0

# Force use of tf.keras for compatibility
keras = tf.keras

# Import MediaPipe with error handling
MEDIAPIPE_AVAILABLE = False
hands_detector = None

try:
    # Try new MediaPipe 0.10.x Tasks API
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision
    from mediapipe import tasks
    import mediapipe as mp
    
    # Initialize MediaPipe Hands using Tasks API
    # Use built-in model (no model_asset_path means use default)
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
    print("MediaPipe Hands (Tasks API) initialized successfully")
except Exception as e:
    print(f"Warning: Could not initialize MediaPipe Hands: {e}")
    import traceback
    traceback.print_exc()
    print("Hand detection will be disabled. The app will work but without hand cropping.")
    MEDIAPIPE_AVAILABLE = False
    hands_detector = None

app = Flask(__name__)
CORS(app)  # Enable CORS for React Native app

# Global variables
models = {}  # Dictionary to store multiple models: {'sinhala': model, 'asl': model}
class_labels = {}  # Dictionary to store class labels for each language
english_translations = {}  # Dictionary to store English translations for each language
model_info = {}  # Dictionary to store model info for each language
current_language = 'sinhala'  # Default language

def load_class_info(language='sinhala'):
    """Load class labels and model info from JSON file for a specific language"""
    global class_labels, model_info, english_translations
    try:
        if language == 'sinhala':
            class_info_path = 'model/sinhala-model/class_info.json'
        elif language == 'asl':
            # ASL model path - will be implemented later
            class_info_path = 'model/asl-model/class_info.json'
        else:
            print(f"Unknown language: {language}")
            return False
        
        with open(class_info_path, 'r', encoding='utf-8') as f:
            class_data = json.load(f)
        
        class_labels[language] = class_data.get('class_names', [])
        model_info[language] = class_data.get('model_info', {})
        english_translations[language] = class_data.get('english_translations', {})
        
        print(f"Loaded {len(class_labels[language])} class labels for {language} from {class_info_path}")
        print(f"Classes: {class_labels[language]}")
        print(f"English translations: {english_translations[language]}")
        print(f"Model info: {model_info[language]}")
        
        return True
    except FileNotFoundError:
        print(f"Class info file not found for {language}. This is expected for ASL if not yet implemented.")
        return False
    except Exception as e:
        print(f"Error loading class info for {language}: {str(e)}")
        return False

# Load a model for a specific language
def load_model(language='sinhala'):
    """Load model for a specific sign language"""
    global models
    try:
        # First load class info
        if not load_class_info(language):
            if language == 'asl':
                print(f"ASL model not yet implemented. Skipping...")
                return False
            print("Warning: Could not load class info, but continuing...")
        
        if language == 'sinhala':
            model_path = 'model/sinhala-model/sinhala_sign_model_final.keras'
        elif language == 'asl':
            # ASL model path - will be implemented later
            model_path = 'model/asl-model/asl_sign_model.keras'
            print("ASL model not yet implemented.")
            return False
        else:
            print(f"Unknown language: {language}")
            return False
        
        # Try different loading methods to handle version compatibility
        print(f"Attempting to load {language} model from {model_path}...")
        
        try:
            # Method 1: Try loading with tf.keras (better compatibility with older models)
            print("Trying tf.keras.models.load_model...")
            model = tf.keras.models.load_model(model_path, compile=False)
            print("Model loaded successfully using tf.keras (without compilation)")
            
            # Try to recompile - but don't fail if it doesn't work
            try:
                model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
                print("Model compiled successfully")
            except Exception as compile_error:
                print(f"Warning: Could not compile model, but continuing: {compile_error}")
                # Model might work without compilation for inference
            
        except Exception as e1:
            print(f"First loading attempt failed: {str(e1)}")
            try:
                # Method 2: Try with safe_mode=False (for Keras 3.x compatibility)
                print("Trying with safe_mode=False...")
                model = tf.keras.models.load_model(model_path, compile=False, safe_mode=False)
                print("Model loaded successfully (safe_mode=False)")
            except Exception as e2:
                print(f"Second loading attempt failed: {str(e2)}")
                try:
                    # Method 3: Try with custom_objects
                    print("Trying with custom_objects...")
                    model = tf.keras.models.load_model(model_path, compile=False, custom_objects={})
                    print("Model loaded successfully (with custom_objects)")
                except Exception as e3:
                    print(f"All loading methods failed. Last error: {str(e3)}")
                    print("\nThe model appears to have structural issues.")
                    print("Please try re-saving in Colab with this code:")
                    print("  model.save('model.keras', save_format='keras')")
                    print("  # Then verify: model2 = tf.keras.models.load_model('model.keras')")
                    raise e3
        
        # Verify model loaded
        if model is None:
            raise Exception("Model is None after loading attempts")
        
        # Store model in dictionary
        models[language] = model
        
        # Print model summary
        print(f"{language.upper()} model loaded successfully from {model_path}")
        print(f"Model input shape: {model.input_shape}")
        print(f"Model output shape: {model.output_shape}")
        
        # Verify model input shape matches class info
        if language in model_info and model_info[language] and 'input_size' in model_info[language]:
            input_size = model_info[language]['input_size']
            print(f"Expected input size from class_info: {input_size[0]}x{input_size[1]}")
        
        return True
    except FileNotFoundError:
        if language == 'asl':
            print(f"ASL model file not found. This is expected if ASL model is not yet implemented.")
            return False
        print(f"Model file not found for {language}")
        return False
    except Exception as e:
        print(f"Error loading {language} model: {str(e)}")
        print("\nTroubleshooting tips:")
        print("1. Check if the model file is corrupted")
        print("2. Try re-saving the model in Colab with: model.save('model.keras')")
        print("3. Check TensorFlow/Keras version compatibility")
        return False

# Detect and crop hand region using MediaPipe
def detect_and_crop_hand(image_bytes):
    """
    Detect hand in image using MediaPipe and crop the hand region.
    Returns cropped hand image bytes or None if no hand detected.
    """
    if not MEDIAPIPE_AVAILABLE or hands_detector is None:
        # If MediaPipe not available, return original image (no cropping)
        print("MediaPipe not available - skipping hand detection")
        return image_bytes
    
    try:
        # Convert bytes to numpy array
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return None
        
        # Convert BGR to RGB for MediaPipe
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        height, width = img_rgb.shape[:2]
        
        # Convert to MediaPipe Image
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
        
        # Detect hands using Tasks API
        detection_result = hands_detector.detect(mp_image)
        
        if not detection_result.hand_landmarks or len(detection_result.hand_landmarks) == 0:
            return None  # No hand detected
        
        # Get bounding box of the first detected hand
        hand_landmarks = detection_result.hand_landmarks[0]
        
        # Calculate bounding box from landmarks
        x_coords = [landmark.x for landmark in hand_landmarks]
        y_coords = [landmark.y for landmark in hand_landmarks]
        
        x_min = int(min(x_coords) * width)
        x_max = int(max(x_coords) * width)
        y_min = int(min(y_coords) * height)
        y_max = int(max(y_coords) * height)
        
        # Add padding around the hand (20% on each side)
        padding_x = int((x_max - x_min) * 0.2)
        padding_y = int((y_max - y_min) * 0.2)
        
        x_min = max(0, x_min - padding_x)
        x_max = min(width, x_max + padding_x)
        y_min = max(0, y_min - padding_y)
        y_max = min(height, y_max + padding_y)
        
        # Crop hand region
        hand_crop = img_rgb[y_min:y_max, x_min:x_max]
        
        if hand_crop.size == 0:
            return None
        
        # Convert back to BGR for encoding
        hand_crop_bgr = cv2.cvtColor(hand_crop, cv2.COLOR_RGB2BGR)
        
        # Encode cropped image to bytes
        _, encoded_img = cv2.imencode('.jpg', hand_crop_bgr)
        cropped_bytes = encoded_img.tobytes()
        
        return cropped_bytes
        
    except Exception as e:
        print(f"Error in hand detection: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

# Preprocess image for the model
def preprocess_image(image_bytes, target_size=None, use_tf_preprocess=True):
    """
    Preprocess image to match model input requirements
    Uses target_size from model_info for current language if available, otherwise defaults to (224, 224)
    
    For MobileNetV2, we use the standard preprocessing which normalizes to [-1, 1] range
    This matches what tf.keras.applications.mobilenet_v2.preprocess_input() does
    """
    try:
        # Get target size from model info or use default
        # Use current language's model info
        if target_size is None:
            if current_language in model_info and model_info[current_language] and 'input_size' in model_info[current_language]:
                input_size = model_info[current_language]['input_size']
                target_size = (input_size[0], input_size[1])
            else:
                target_size = (224, 224)
        
        # Convert bytes to PIL Image
        image = Image.open(io.BytesIO(image_bytes))
        
        # Convert to RGB if needed (important for consistency)
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Resize image using high-quality resampling
        try:
            image = image.resize(target_size, Image.Resampling.LANCZOS)
        except AttributeError:
            # Fallback for older PIL versions
            image = image.resize(target_size, Image.LANCZOS)
        
        # Convert to numpy array
        img_array = np.array(image, dtype=np.float32)
        
        # Use TensorFlow's built-in preprocessing (most accurate)
        if use_tf_preprocess:
            # MobileNetV2 preprocessing using TensorFlow's function
            # This ensures exact match with training
            img_array = mobilenet_preprocess(img_array)
        else:
            # Manual preprocessing: normalize to [-1, 1] range
            # Formula: (pixels / 127.5) - 1.0
            img_array = img_array / 127.5 - 1.0
        
        # Add batch dimension
        img_array = np.expand_dims(img_array, axis=0)
        
        # Debug: Print image statistics
        print(f"Preprocessed image shape: {img_array.shape}")
        print(f"Image value range: [{img_array.min():.3f}, {img_array.max():.3f}]")
        print(f"Image mean: {img_array.mean():.3f}, std: {img_array.std():.3f}")
        
        return img_array
    except Exception as e:
        print(f"Error preprocessing image: {str(e)}")
        raise

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    # Get current language from query parameter or use default
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

@app.route('/test-preprocessing', methods=['POST'])
def test_preprocessing():
    """
    Test endpoint to compare all preprocessing methods
    Helps identify which preprocessing matches your training setup
    """
    # Get language from request
    data = request.get_json() if request.is_json else {}
    language = request.args.get('language', data.get('language', current_language)).lower()
    
    if language not in models or models[language] is None:
        return jsonify({'error': f'Model for language "{language}" not loaded'}), 500
    
    model = models[language]
    
    try:
        # Get image from request
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({'error': 'No image provided'}), 400
        
        image_data = data['image']
        if image_data.startswith('data:image'):
            image_data = image_data.split(',')[1]
        image_bytes = base64.b64decode(image_data)
        
        results = {}
        
        # Test all preprocessing methods
        methods = {
            'mobilenet_tf': ('mobilenet', True),  # Using TF preprocess_input
            'mobilenet_manual': ('manual', False),  # Manual calculation
            'standard': ('standard', None)  # [0, 1] normalization
        }
        
        for method_name, (preprocessing_method, use_tf) in methods.items():
            try:
                if preprocessing_method == 'standard':
                    processed_image = preprocess_image_standard(image_bytes)
                else:
                    processed_image = preprocess_image(image_bytes, use_tf_preprocess=use_tf)
                
                predictions = model.predict(processed_image, verbose=0)
                predicted_class_idx = np.argmax(predictions[0])
                confidence = float(predictions[0][predicted_class_idx])
                
                labels = class_labels.get(language, [])
                if len(labels) > 0 and predicted_class_idx < len(labels):
                    predicted_class = labels[predicted_class_idx]
                else:
                    predicted_class = f"Class_{predicted_class_idx}"
                
                # Get top 3
                top_3_indices = np.argsort(predictions[0])[-3:][::-1]
                top_3 = []
                for idx in top_3_indices:
                    if len(labels) > 0 and idx < len(labels):
                        label = labels[idx]
                    else:
                        label = f"Class_{idx}"
                    top_3.append({
                        'label': label,
                        'confidence': float(predictions[0][idx])
                    })
                
                results[method_name] = {
                    'prediction': predicted_class,
                    'confidence': confidence,
                    'top_3': top_3,
                    'all_predictions': [float(x) for x in predictions[0]]
                }
            except Exception as e:
                results[method_name] = {'error': str(e)}
        
        return jsonify({
            'success': True,
            'results': results,
            'note': 'Compare the predictions to see which preprocessing method matches your Colab results'
        })
        
    except Exception as e:
        print(f"Error in test_preprocessing: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/predict', methods=['POST'])
def predict():
    """Predict sign language from image"""
    global current_language
    
    try:
        # Get language from request (query parameter or JSON body)
        data = request.get_json() if request.is_json else {}
        language = request.args.get('language', data.get('language', current_language)).lower()
        
        # Validate language
        if language not in models:
            return jsonify({
                'error': f'Model for language "{language}" not loaded. Available languages: {list(models.keys())}'
            }), 400
        
        model = models[language]
        if model is None:
            return jsonify({
                'error': f'Model for language "{language}" not loaded'
            }), 500
        
        # Update current language
        current_language = language
        
        # Get preprocessing method from request (optional, defaults to 'mobilenet')
        preprocessing_method = request.args.get('preprocessing', 'mobilenet')
        
        # Get image from request
        if 'image' not in request.files:
            # Try to get base64 encoded image
            if data and 'image' in data:
                # Decode base64 image
                image_data = data['image']
                if image_data.startswith('data:image'):
                    # Remove data URL prefix
                    image_data = image_data.split(',')[1]
                image_bytes = base64.b64decode(image_data)
            else:
                return jsonify({'error': 'No image provided'}), 400
        else:
            image_file = request.files['image']
            image_bytes = image_file.read()
        
        # Detect and crop hand region using MediaPipe
        cropped_hand_bytes = detect_and_crop_hand(image_bytes)
        
        if cropped_hand_bytes is None:
            # No hand detected - return appropriate response
            return jsonify({
                'success': False,
                'error': 'no_hand_detected',
                'message': 'No hand detected in the image. Please ensure your hand is visible in the camera frame.',
                'prediction': None,
                'english_translation': None,
                'confidence': 0.0
            }), 200  # Return 200 but with success=False to indicate no hand
        
        # Use cropped hand for classification
        image_bytes = cropped_hand_bytes
        
        # Preprocess image based on method
        if preprocessing_method == 'standard':
            # Standard [0, 1] normalization (old method)
            processed_image = preprocess_image_standard(image_bytes)
        elif preprocessing_method == 'manual':
            # Manual [-1, 1] normalization (without TF function)
            processed_image = preprocess_image(image_bytes, use_tf_preprocess=False)
        else:
            # MobileNetV2 [-1, 1] normalization using TF function (default, most accurate)
            processed_image = preprocess_image(image_bytes, use_tf_preprocess=True)
        
        # Make prediction
        predictions = model.predict(processed_image, verbose=0)
        
        # Debug: Print prediction statistics
        print(f"Prediction shape: {predictions.shape}")
        print(f"Prediction values: {predictions[0]}")
        print(f"Prediction sum: {predictions[0].sum():.6f}")
        
        # Get class labels for current language
        labels = class_labels.get(language, [])
        
        # Get top prediction
        predicted_class_idx = np.argmax(predictions[0])
        confidence = float(predictions[0][predicted_class_idx])
        
        print(f"Top prediction: Class {predicted_class_idx} with confidence {confidence:.4f}")
        
        # Get class label
        if len(labels) > 0 and predicted_class_idx < len(labels):
            predicted_class = labels[predicted_class_idx]
        else:
            predicted_class = f"Class_{predicted_class_idx}"
            print(f"Warning: Class index {predicted_class_idx} out of range. Total classes: {len(labels)}")
        
        # Get English translation
        translations = english_translations.get(language, {})
        english_translation = translations.get(predicted_class, predicted_class)
        
        # Get top 3 predictions
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
        
    except Exception as e:
        print(f"Error during prediction: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': str(e)
        }), 500

def preprocess_image_standard(image_bytes, target_size=None):
    """
    Alternative preprocessing with [0, 1] normalization
    Use this if the model was trained with standard normalization
    """
    try:
        # Get target size from model info or use default
        # Use current language's model info
        if target_size is None:
            if current_language in model_info and model_info[current_language] and 'input_size' in model_info[current_language]:
                input_size = model_info[current_language]['input_size']
                target_size = (input_size[0], input_size[1])
            else:
                target_size = (224, 224)
        
        # Convert bytes to PIL Image
        image = Image.open(io.BytesIO(image_bytes))
        
        # Convert to RGB if needed
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Resize image
        try:
            image = image.resize(target_size, Image.Resampling.LANCZOS)
        except AttributeError:
            # Fallback for older PIL versions
            image = image.resize(target_size, Image.LANCZOS)
        
        # Convert to numpy array and normalize to [0, 1]
        img_array = np.array(image, dtype=np.float32) / 255.0
        
        # Add batch dimension
        img_array = np.expand_dims(img_array, axis=0)
        
        return img_array
    except Exception as e:
        print(f"Error preprocessing image (standard): {str(e)}")
        raise

if __name__ == '__main__':
    print("Starting Flask server...")
    print("=" * 50)
    
    # Load Sinhala model (required)
    sinhala_loaded = load_model('sinhala')
    
    # Try to load ASL model (optional for now)
    asl_loaded = load_model('asl')
    
    if sinhala_loaded:
        print("=" * 50)
        print("Server ready!")
        print(f"Loaded models: {list(models.keys())}")
        print(f"Server running on http://0.0.0.0:5000")
        print(f"Access from this computer: http://localhost:5000")
        print(f"Access from network: http://YOUR_IP:5000")
        print("=" * 50)
        # Run on all interfaces so mobile device can access it
        # Change port if needed
        app.run(host='0.0.0.0', port=5000, debug=True)
    else:
        print("=" * 50)
        print("Failed to load Sinhala model. Server not started.")
        print("\nThe server cannot start without the Sinhala model loaded.")
        print("Please check the error messages above and fix the model loading issue.")
        print("=" * 50)

