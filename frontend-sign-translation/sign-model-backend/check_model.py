"""
Script to diagnose and check the Keras model file
"""
import tensorflow as tf
from tensorflow import keras
import os

def check_model():
    model_path = 'model/sinhala-model/sinhala_sign_model_final.keras'
    
    if not os.path.exists(model_path):
        print(f"ERROR: Model file not found at {model_path}")
        return False
    
    print(f"Model file exists: {model_path}")
    file_size = os.path.getsize(model_path) / (1024 * 1024)  # Size in MB
    print(f"Model file size: {file_size:.2f} MB")
    
    print("\nAttempting to load model...")
    print("=" * 50)
    
    # Try Method 1: Load without compilation
    try:
        print("\nMethod 1: Loading with compile=False...")
        model = keras.models.load_model(model_path, compile=False)
        print("✓ SUCCESS: Model loaded without compilation")
        print(f"  Input shape: {model.input_shape}")
        print(f"  Output shape: {model.output_shape}")
        print(f"  Number of layers: {len(model.layers)}")
        
        # Try to get summary
        try:
            print("\nModel Summary:")
            model.summary()
        except:
            print("  (Could not print full summary)")
        
        return True
        
    except Exception as e1:
        print(f"✗ FAILED: {str(e1)}")
        
        # Try Method 2: Load with tf.keras
        try:
            print("\nMethod 2: Loading with tf.keras...")
            model = tf.keras.models.load_model(model_path, compile=False)
            print("✓ SUCCESS: Model loaded using tf.keras")
            print(f"  Input shape: {model.input_shape}")
            print(f"  Output shape: {model.output_shape}")
            return True
        except Exception as e2:
            print(f"✗ FAILED: {str(e2)}")
            
            # Try Method 3: Standard load
            try:
                print("\nMethod 3: Standard load...")
                model = keras.models.load_model(model_path)
                print("✓ SUCCESS: Model loaded with standard method")
                return True
            except Exception as e3:
                print(f"✗ FAILED: {str(e3)}")
                print("\n" + "=" * 50)
                print("All loading methods failed!")
                print("\nPossible solutions:")
                print("1. The model file might be corrupted")
                print("2. TensorFlow/Keras version mismatch")
                print("3. Model was saved incorrectly")
                print("\nTry re-saving the model in Colab:")
                print("  model.save('sinhala_sign_model_final.keras', save_format='keras')")
                return False

if __name__ == '__main__':
    print("Keras Model Diagnostic Tool")
    print("=" * 50)
    print(f"TensorFlow version: {tf.__version__}")
    print(f"Keras version: {keras.__version__}")
    print("=" * 50)
    
    success = check_model()
    
    print("\n" + "=" * 50)
    if success:
        print("Model check: PASSED ✓")
        print("You can try starting the server now.")
    else:
        print("Model check: FAILED ✗")
        print("Please fix the model loading issue before starting the server.")
    print("=" * 50)




