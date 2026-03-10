# Setup Instructions for Sign Language Detection

## Step 1: Install Python Dependencies

```bash
cd backend
pip install -r requirements.txt
```

## Step 2: Update Class Labels

Open `app.py` and update the `CLASS_LABELS` list with your actual sign language class labels. These should match the order of classes your model was trained on.

Example:

```python
CLASS_LABELS = [
    'අ', 'ආ', 'ඇ', 'ඈ', 'ඉ', 'ඊ', 'උ', 'ඌ', 'ඍ', 'ඎ',
    'ඏ', 'ඐ', 'එ', 'ඒ', 'ඓ', 'ඔ', 'ඕ', 'ඖ',
    # Add all your Sinhala sign language classes here
]
```

**Important:** The order must match exactly how your model was trained!

## Step 3: Check Model Input Size

In `app.py`, the `preprocess_image` function uses `target_size=(224, 224)`. Update this if your model expects a different input size (e.g., `(128, 128)` or `(256, 256)`).

## Step 4: Start the Backend Server

```bash
python app.py
```

The server will start on `http://localhost:5000`

## Step 5: Configure Frontend API URL

### For Local Development (Emulator/Simulator):

- Use `http://localhost:5000` (already set as default)

### For Physical Device Testing:

1. Find your computer's IP address:
   - **Windows**: Open Command Prompt and run `ipconfig` (look for IPv4 Address)
   - **Mac/Linux**: Run `ifconfig` or `ip addr` in terminal
2. In the app, tap "Configure API" and enter: `http://YOUR_IP:5000`
   - Example: `http://192.168.8.151:5000`

3. Make sure your phone and computer are on the same Wi-Fi network

4. Test the connection using the "Test Connection" button

## Step 6: Test the Integration

1. Start your Expo app
2. Navigate to the "Sign Detection" tab
3. Tap the green detect button to capture and analyze a sign
4. Or tap the orange button to enable real-time detection mode

## Troubleshooting

### Model Loading Error

- Check that the model file path is correct: `model/sinhala-model/sinhala_sign_model_final.keras`
- Verify the model file exists and is not corrupted

### API Connection Error

- Make sure the backend server is running
- Check firewall settings (allow port 5000)
- Verify IP address is correct for device testing
- Try the "Test Connection" button in the app

### Low Accuracy

- Verify `CLASS_LABELS` order matches training
- Check if input image size matches model expectations
- Ensure good lighting and clear hand positioning

### Real-time Mode Issues

- Adjust the detection interval in `sign-detection.js` (currently 1000ms)
- Lower the confidence threshold if needed (currently 0.5)
