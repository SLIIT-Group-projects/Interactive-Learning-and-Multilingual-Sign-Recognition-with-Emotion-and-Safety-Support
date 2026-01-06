# Debugging Wrong Predictions

## Quick Fix Steps

### Step 1: Restart Server with Debugging
```bash
cd frontend-sign-translation/sign-model-backend
python app.py
```

The server will now print detailed debugging information for each prediction:
- Image preprocessing statistics
- Prediction values
- Top predictions

### Step 2: Test All Preprocessing Methods

I've added a test endpoint that tries all preprocessing methods. You can test it:

**Option A: Using curl (if you have a test image)**
```bash
# First, convert an image to base64
python -c "import base64; print(base64.b64encode(open('test_image.jpg', 'rb').read()).decode())"

# Then test (replace IMAGE_BASE64 with the output above)
curl -X POST http://localhost:5000/test-preprocessing \
  -H "Content-Type: application/json" \
  -d "{\"image\": \"IMAGE_BASE64\"}"
```

**Option B: Using Python script**
Create a file `test_preprocessing.py`:
```python
import requests
import base64

# Load a test image from your training dataset
with open('path/to/test_image.jpg', 'rb') as f:
    img_data = base64.b64encode(f.read()).decode('utf-8')

response = requests.post('http://localhost:5000/test-preprocessing', 
    json={'image': img_data})

print(response.json())
```

This will show you predictions for all three preprocessing methods:
1. `mobilenet_tf` - Uses TensorFlow's built-in preprocessing (most accurate)
2. `mobilenet_manual` - Manual [-1, 1] normalization
3. `standard` - [0, 1] normalization

**Compare the results and see which one matches your Colab predictions!**

### Step 3: Update Frontend to Use Correct Method

Once you identify which preprocessing works, update your frontend:

**If `mobilenet_tf` works (default):**
No changes needed - it's already the default.

**If `standard` works:**
Update `sign-detection.js`:
```javascript
const response = await fetch(`${apiUrl}/predict?preprocessing=standard`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    image: photo.base64,
  }),
});
```

**If `mobilenet_manual` works:**
Update `sign-detection.js`:
```javascript
const response = await fetch(`${apiUrl}/predict?preprocessing=manual`, {
  // ... rest of the code
});
```

## Common Issues

### Issue 1: All predictions are wrong but consistent
**Possible causes:**
- Wrong preprocessing method
- Model file mismatch (different model than used in Colab)
- Class labels order mismatch

**Solution:**
1. Test with an image from your training dataset
2. Compare predictions with Colab
3. Check `class_info.json` - class order must match training

### Issue 2: Predictions are random/inconsistent
**Possible causes:**
- Image preprocessing error
- Model not loaded correctly
- Image format issues

**Solution:**
1. Check server logs for error messages
2. Verify model loaded successfully (check `/health` endpoint)
3. Check image statistics in logs (should be reasonable values)

### Issue 3: Predictions are close but not exact
**Possible causes:**
- Image quality differences (camera vs training data)
- Lighting/background differences
- Hand position/angle differences

**Solution:**
1. Test with a training image first to verify preprocessing
2. If training image works, the issue is with camera images
3. Consider improving camera image quality or adding preprocessing

## Check Your Colab Training Code

To find the exact preprocessing used, look for:

**If you see:**
```python
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input
# or
datagen = ImageDataGenerator(preprocessing_function=preprocess_input)
```
→ Use `mobilenet_tf` (default)

**If you see:**
```python
datagen = ImageDataGenerator(rescale=1./255)
# or
img_array = img_array / 255.0
```
→ Use `standard`

**If you see:**
```python
img_array = img_array / 127.5 - 1.0
```
→ Use `mobilenet_manual`

## Debugging Checklist

- [ ] Server restarted after code changes
- [ ] Model loads successfully (check `/health` endpoint)
- [ ] Tested with an image from training dataset
- [ ] Compared all three preprocessing methods
- [ ] Checked class labels order matches training
- [ ] Verified model file is the same as Colab
- [ ] Checked server logs for errors
- [ ] Tested with camera image vs training image

## Still Not Working?

1. **Share the debugging output:**
   - Server logs when making a prediction
   - Results from `/test-preprocessing` endpoint
   - What you see in Colab vs what you see in the app

2. **Verify model file:**
   - Is it the exact same file used in Colab?
   - Try re-saving the model in Colab (see `COLAB_FIX.md`)

3. **Test with known image:**
   - Use an image from your training dataset
   - Compare predictions between Colab and the app
   - This will isolate preprocessing vs image quality issues














