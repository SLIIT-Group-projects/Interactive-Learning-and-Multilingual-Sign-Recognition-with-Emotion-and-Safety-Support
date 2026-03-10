# Setting Up Real Camera Gesture Recognition

This guide will help you set up the real camera functionality for the PlayGame screen.

## Prerequisites

1. ✅ Trained ASL model (`asl_model.h5` in `backend/models/games/` directory)
2. ✅ Python virtual environment with dependencies
3. ✅ React Native/Expo app setup

## Step 1: Install Backend Dependencies

```bash
# Navigate to games directory
cd backend/models/games

# Install Flask and dependencies
pip install flask flask-cors pillow opencv-python mediapipe tensorflow numpy
```

## Step 2: Install Frontend Dependencies

```bash
cd frontend
npm install expo-camera expo-file-system
```

## Step 3: Start the API Server

```bash
cd backend/models/games
python api_server.py
```

You should see:

```
Starting server on http://localhost:5000
```

Keep this terminal open - the server needs to be running for the app to work.

## Step 4: Update API URL (For Physical Devices)

If testing on a **physical device** (not emulator), you need to update the API URL in `frontend/screens/PlayGame.js`:

1. Find your computer's IP address:
   - **Windows**: Run `ipconfig` and look for IPv4 Address
   - **Mac/Linux**: Run `ifconfig` or `ip addr show`

2. Update `PlayGame.js`:

   ```javascript
   const API_URL = "http://YOUR_IP_ADDRESS:5000";
   // Example: const API_URL = 'http://192.168.8.151:5000';
   ```

3. Make sure your phone and computer are on the **same WiFi network**

## Step 5: Start the React Native App

```bash
cd frontend
npm start
# or
expo start
```

Then:

- Press `a` for Android
- Press `i` for iOS
- Scan QR code with Expo Go app

## Step 6: Test the Camera

1. Open the app and navigate to "Play Game"
2. Grant camera permission when prompted
3. Position your hand in the camera frame
4. Tap "Capture Gesture"
5. Wait for prediction (should show if correct/incorrect)

## Troubleshooting

### "Could not connect to API server"

- ✅ Make sure API server is running (`python backend/models/games/api_server.py`)
- ✅ Check that port 5000 is not blocked
- ✅ For physical devices: Use your computer's IP, not `localhost`
- ✅ Ensure phone and computer are on same WiFi

### "No hand detected"

- ✅ Ensure good lighting
- ✅ Make sure hand is fully visible
- ✅ Try different angles/distances
- ✅ Check that MediaPipe is working (should see hand landmarks in API logs)

### Camera permission denied

- ✅ Go to device settings → App permissions → Camera → Allow
- ✅ Restart the app after granting permission

### Model not found

- ✅ Make sure `asl_model.h5` exists in `backend/models/games/` directory
- ✅ Check that you've trained the model first

## Development Tips

### Testing Without API (Mock Mode)

The app includes a fallback mock mode for development. If the API is unavailable, you'll get an option to use mock predictions.

### Viewing API Logs

Check the terminal where `api_server.py` is running to see:

- Request logs
- Prediction results
- Any errors

### Improving Accuracy

- Ensure good lighting
- Keep hand centered in frame
- Hold gesture steady for 1-2 seconds
- Match training data style (similar angle/distance)

## Next Steps

- ✅ Test with different letters
- ✅ Check prediction accuracy
- ✅ Adjust camera frame/guidelines if needed
- ✅ Consider adding visual feedback (hand landmarks overlay)

## Files Modified

- ✅ `backend/models/games/api_server.py` - Flask API server for ASL recognition
- ✅ `frontend/src/screens/child/PlayGame.js` - Updated with real camera
- ✅ `frontend/package.json` - Added expo-camera, expo-file-system

## API Endpoints

- `GET /health` - Health check
- `POST /predict` - Predict letter from image
- `POST /check` - Check if prediction matches target
