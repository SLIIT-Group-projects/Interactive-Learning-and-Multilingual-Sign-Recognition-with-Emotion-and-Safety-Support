"""
Script to fix model compatibility by removing quantization_config
and re-saving the model in a compatible format.
"""
import sys
import json
import zipfile
import os
import shutil

def fix_model_file(model_path, output_path=None):
    """Remove quantization_config from model file and re-save it."""
    if output_path is None:
        output_path = model_path.replace('.keras', '_fixed.keras')
    
    print(f"Fixing model: {model_path}")
    print(f"Output: {output_path}")
    
    # Keras .keras files are zip archives
    with zipfile.ZipFile(model_path, 'r') as zip_in:
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zip_out:
            for item in zip_in.infolist():
                data = zip_in.read(item.filename)
                
                # Check if this is the config.json file
                if item.filename == 'config.json':
                    config = json.loads(data.decode('utf-8'))
                    
                    # Recursively remove quantization_config
                    def remove_quantization_config(obj):
                        if isinstance(obj, dict):
                            obj.pop('quantization_config', None)
                            for value in obj.values():
                                if isinstance(value, (dict, list)):
                                    remove_quantization_config(value)
                        elif isinstance(obj, list):
                            for item in obj:
                                if isinstance(item, (dict, list)):
                                    remove_quantization_config(item)
                    
                    remove_quantization_config(config)
                    data = json.dumps(config, indent=2).encode('utf-8')
                
                zip_out.writestr(item, data)
    
    print(f"Fixed model saved to: {output_path}")
    return output_path

if __name__ == "__main__":
    model_path = "FER_then_CK_EfficientNetB0_KEEP_NEUTRAL_final.keras"
    if len(sys.argv) > 1:
        model_path = sys.argv[1]
    
    if not os.path.exists(model_path):
        print(f"Error: Model file not found: {model_path}")
        sys.exit(1)
    
    output_path = fix_model_file(model_path)
    print(f"\nNow update MODEL_PATH in eh_emotion_predict.py to use: {os.path.basename(output_path)}")
