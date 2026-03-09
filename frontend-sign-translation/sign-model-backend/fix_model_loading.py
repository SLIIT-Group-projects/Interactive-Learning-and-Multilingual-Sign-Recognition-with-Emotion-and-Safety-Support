"""
Script to attempt to fix model loading issues by trying different approaches
"""
import tensorflow as tf
from tensorflow import keras
import numpy as np
import os

def try_fix_model():
    model_path = 'model/sinhala-model/sinhala_sign_model_final.keras'
    
    print("Attempting to fix model loading...")
    print("=" * 50)
    
    # Method 1: Try loading with custom objects and handling the error
    try:
        print("\nMethod 1: Loading with custom_objects=None...")
        # Sometimes models need custom objects
        model = keras.models.load_model(model_path, compile=False, custom_objects=None)
        print("✓ SUCCESS!")
        return model
    except Exception as e:
        print(f"✗ Failed: {str(e)}")
    
    # Method 2: Try to load weights only and rebuild
    try:
        print("\nMethod 2: Attempting to extract and rebuild model...")
        # This is a workaround - we'll need to know the architecture
        # For now, just inform the user
        print("This method requires knowing the model architecture.")
        print("Please re-save the model in Colab with the code provided.")
    except Exception as e:
        print(f"✗ Failed: {str(e)}")
    
    return None

def create_colab_fix_code():
    """Generate code to re-save the model in Colab"""
    code = """
# ============================================
# CODE TO RUN IN GOOGLE COLAB TO FIX MODEL
# ============================================

# Step 1: Load your existing model
from tensorflow import keras
import tensorflow as tf

# Load the model (adjust path as needed)
model = keras.models.load_model('sinhala_sign_model_final.keras')

# Step 2: Re-save with explicit format for compatibility
# Option A: Save as Keras format (recommended)
model.save('sinhala_sign_model_final_fixed.keras', save_format='keras')

# Option B: Save as SavedModel format (alternative)
# model.save('sinhala_sign_model_final_fixed', save_format='tf')

# Step 3: Verify it loads correctly
test_model = keras.models.load_model('sinhala_sign_model_final_fixed.keras')
print("Model loaded successfully!")
print(f"Input shape: {test_model.input_shape}")
print(f"Output shape: {test_model.output_shape}")

# Step 4: Download the fixed model
from google.colab import files
files.download('sinhala_sign_model_final_fixed.keras')
"""
    return code

if __name__ == '__main__':
    print("Model Fixing Tool")
    print("=" * 50)
    print(f"TensorFlow: {tf.__version__}")
    print(f"Keras: {keras.__version__}")
    print("=" * 50)
    
    model = try_fix_model()
    
    if model is None:
        print("\n" + "=" * 50)
        print("AUTOMATIC FIX FAILED")
        print("=" * 50)
        print("\nThe model needs to be re-saved in Google Colab.")
        print("\nCopy and run this code in your Colab notebook:")
        print("=" * 50)
        print(create_colab_fix_code())
        print("=" * 50)
        print("\nAfter re-saving, download the new model file and replace")
        print("the existing model file in: model/sinhala-model/")
    else:
        print("\n✓ Model fixed! You can now start the server.")




