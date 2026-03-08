# Python Script Crash Fix

## Problem
Python script is crashing with exit code `3221226505` (Windows access violation error 0xC0000005).

**Error in logs:**
```
"Python script failed (exit code 3221226505)"
"Abort was called at 47 line in file"
```

## What's Happening

1. **Some requests succeed** ✅ - System IS working (see line 646: successful "happy" prediction)
2. **Many requests crash** ❌ - Python script crashes when loading DeepFace/TensorFlow models
3. **Timeouts** ⏱️ - Requests taking >30 seconds are timing out

## Root Cause

Exit code `3221226505` = `0xC0000005` = **Access Violation**
- Memory access error
- Usually happens when:
  - TensorFlow/DeepFace models load multiple times
  - Memory conflicts
  - DLL version conflicts
  - Model file corruption

## Fixes Applied

1. ✅ **Increased timeout** from 30s to 60s (frontend and backend)
2. ✅ **Better error handling** - Captures stderr separately
3. ✅ **Non-blocking file verification** - Won't stop uploads

## Additional Fixes Needed

### Option 1: Check Python/TensorFlow Versions
```bash
python --version
pip list | grep -i tensorflow
pip list | grep -i deepface
```

**Recommended versions:**
- Python: 3.9-3.11
- TensorFlow: 2.13+ or 2.15+
- DeepFace: Latest

### Option 2: Reinstall DeepFace
```bash
pip uninstall deepface tensorflow
pip install deepface tensorflow
```

### Option 3: Set Environment Variable
The error shows TensorFlow warnings. Try:
```bash
set TF_ENABLE_ONEDNN_OPTS=0
```

Or in Python script, add at the top:
```python
import os
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
```

### Option 4: Model Loading Issue
The crash happens at line 47, which is when loading DeepFace. The model might be loading multiple times. Check if:
- Model is being loaded on every request (should cache)
- Multiple processes trying to load same model
- Insufficient memory

## Current Status

- ✅ **Uploads working** - Files reach backend
- ✅ **Hand detection working** - Hand analysis succeeds
- ⚠️ **Emotion detection unstable** - Works sometimes, crashes other times
- ✅ **Timeouts increased** - Now 60 seconds instead of 30

## Next Steps

1. Check backend terminal for full Python error messages
2. Try reinstalling DeepFace/TensorFlow
3. Check if model is being cached properly (should load once, not every request)
4. Monitor memory usage when Python script runs

## Test

After fixes, test with:
```bash
cd backend
python models/eh_emotion_predict.py uploads/emotion/session_XXX/image.jpg
```

If this works, the issue is in how Node.js spawns the Python process.
If this crashes, the issue is in the Python script itself.
