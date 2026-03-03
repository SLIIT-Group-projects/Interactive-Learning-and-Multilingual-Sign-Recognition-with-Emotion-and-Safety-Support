# Emotion Detection Models

This script supports multiple emotion detection methods:

## Model Options

Set `USE_MODEL` in `eh_emotion_predict.py` (line 25):

1. **`'deepface'`** - Pre-trained DeepFace library (RECOMMENDED) ✅
   - Uses a well-trained, reliable pre-trained model
   - No need for your custom model file
   - Better accuracy for general emotion detection
   - Automatically handles face detection and emotion recognition

2. **`'custom'`** - Your Keras model file
   - Uses your `FER_then_CK_EfficientNetB0_KEEP_NEUTRAL_final_fixed.keras` model
   - Requires proper preprocessing matching your training

3. **`'both'`** - Try custom first, fallback to DeepFace
   - Uses your model if available, otherwise uses DeepFace

## Installation

### For DeepFace Model (Recommended):

```bash
cd backend/models
pip install deepface
```

DeepFace will automatically download its pre-trained models on first use (may take a few minutes).

### For Custom Model:

Ensure your model file exists and TensorFlow is installed:
```bash
pip install tensorflow opencv-python numpy
```

## Usage

The script automatically uses the model specified by `USE_MODEL`. No code changes needed in the backend routes - they will automatically use the selected model.

## Switching Models

1. Open `backend/models/eh_emotion_predict.py`
2. Change line 25: `USE_MODEL = 'deepface'` (or 'custom' or 'both')
3. Restart your backend server

## Current Setting

The script is currently set to use **DeepFace** (`USE_MODEL = 'deepface'`), which provides reliable emotion detection without needing your custom model file.

## Troubleshooting

- **DeepFace not working**: Install with `pip install deepface`
- **First run slow**: DeepFace downloads models on first use (one-time, ~500MB)
- **Custom model wrong predictions**: Try changing `NORMALIZATION` to `'imagenet'` (line 22)
- **Both models fail**: Check that OpenCV and TensorFlow are installed correctly
