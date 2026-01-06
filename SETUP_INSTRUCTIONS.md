# Frontend ↔ Backend Connection Setup

This document provides instructions for running the connected frontend and backend system.

## Backend Setup

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment (Optional)
Create a `.env` file in the `backend` directory:
```env
PORT=5000
UPLOAD_DIR=./uploads
PYTHON_CMD=python
CORS_ORIGIN=*
NODE_ENV=development
```

**Note:** Default values are already set in `backend/config/index.js`, so this step is optional.

### 3. Ensure Python Scripts Are Ready
- Make sure `backend/models/eh_emotion_predict.py` exists (already created)
- Make sure `backend/models/hand_speed_analyze.py` exists (already exists)
- Update the `MODEL_PATH` in `eh_emotion_predict.py` to point to your actual Keras model file

### 4. Create Uploads Directory Structure
The backend will automatically create the uploads directory structure, but you can create it manually:
```bash
mkdir -p backend/uploads/emotion
mkdir -p backend/uploads/hand
```

### 5. Start Backend Server
```bash
cd backend
npm start
# or for development with auto-reload:
npm run dev
```

The server will start on port 5000 (or the PORT specified in your .env file).

**Expected output:**
```
🚀 Server running on port 5000
📡 Health check: http://localhost:5000/health
🌐 Network access example: http://192.168.1.11:5000/health
🌍 Environment: development
📁 Upload directory: <path>/uploads
🐍 Python command: python
```

## Frontend Setup

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Configure API Base URL (if needed)
The API configuration is in `frontend/config/api.ts`. It automatically detects:
- **Android emulator**: `http://10.0.2.2:5000`
- **iOS simulator**: `http://localhost:5000`
- **Real device**: You need to update the IP address

For **real devices**, you have two options:

**Option A:** Modify `frontend/config/api.ts` and hardcode your laptop's IP:
```typescript
export function getBaseUrl(): string {
  if (__DEV__) {
    if (Platform.OS === "android") {
      return "http://10.0.2.2:5000"; // Android emulator
    } else if (Platform.OS === "ios") {
      return "http://localhost:5000"; // iOS simulator
    } else {
      // For real devices, use your laptop's IP
      return "http://192.168.1.11:5000"; // Replace with your IP
    }
  }
  // ...
}
```

**Option B:** Use environment variable (requires additional setup)

### 3. Find Your Laptop's IP Address

**Windows:**
```bash
ipconfig
# Look for IPv4 Address under your active network adapter
```

**Mac/Linux:**
```bash
ifconfig
# or
ip addr
# Look for inet address (not 127.0.0.1)
```

### 4. Start Frontend
```bash
cd frontend
npm start
```

Then:
- Press `a` for Android emulator
- Press `i` for iOS simulator
- Scan QR code for real device (Expo Go app)

## Testing the Connection

### 1. Test Backend Health
```bash
curl http://localhost:5000/health
```

### 2. Test from Frontend
1. Open the app
2. Navigate to a story
3. Click "Start Reading Session"
4. The app will:
   - Create a session on the backend
   - Capture frames every 1 second for emotion detection
   - Capture 10 frames every 5 seconds for hand movement analysis
   - Auto-stop after 2 minutes
   - Show final results

## API Endpoints

### Session Management
- `POST /api/eh/start` - Start a new session
  ```json
  { "sessionId": "session_1234567890_abc123" }
  ```

- `POST /api/eh/finalize` - Finalize session and get results
  ```json
  { "sessionId": "session_1234567890_abc123" }
  ```
  Response:
  ```json
  {
    "sessionId": "session_1234567890_abc123",
    "finalEmotion": "happy",
    "engagementLevel": "HIGH",
    "summary": "Analyzed 120 emotion samples...",
    "emotionDistribution": { "happy": 45, "neutral": 30, ... },
    "handSummary": { "avgSpeed": 150.5, "avgLevel": 2, ... }
  }
  ```

### Emotion Detection
- `POST /api/emotion/predict` - Predict emotion from image
  - Form data: `file` (image file), `sessionId` (string)

### Hand Movement Analysis
- `POST /api/hand/analyze` - Analyze hand movement from frames
  - Form data: `frames[]` (array of image files), `sessionId` (string), `fps` (number)

## Troubleshooting

### Backend Issues

1. **Python script not found:**
   - Check that `backend/models/eh_emotion_predict.py` exists
   - Verify `PYTHON_CMD` in config (default: "python", might need "python3")

2. **Model file not found:**
   - Update `MODEL_PATH` in `eh_emotion_predict.py` to your actual model path
   - Ensure TensorFlow/Keras is installed: `pip install tensorflow`

3. **Upload directory errors:**
   - Ensure write permissions for the uploads directory
   - Check that the path in config is correct

### Frontend Issues

1. **Network request failed:**
   - Check that backend is running
   - Verify the BASE_URL in `frontend/config/api.ts`
   - For real devices, ensure phone and laptop are on the same WiFi network
   - Check firewall settings

2. **Camera not working:**
   - Ensure camera permissions are granted
   - Check that `expo-camera` is installed: `npm install expo-camera`

3. **CORS errors:**
   - Backend CORS is set to allow all origins (`*`) in development
   - If issues persist, check `backend/config/index.js` CORS_ORIGIN setting

## File Structure

```
backend/
├── config/
│   └── index.js          # Configuration (PORT, UPLOAD_DIR, PYTHON_CMD)
├── src/
│   ├── server.js         # Main server file
│   ├── routes/
│   │   ├── emotion.routes.js    # Emotion prediction endpoint
│   │   ├── hand.routes.js       # Hand analysis endpoint
│   │   └── eh_fusion.routes.js  # Session start/finalize endpoints
│   └── utils/
│       ├── eh_sessionStore.js   # In-memory session storage
│       └── eh_fusion_model.js   # Fusion logic
├── models/
│   ├── eh_emotion_predict.py    # Emotion prediction script
│   └── hand_speed_analyze.py    # Hand movement analysis script
└── uploads/                     # Auto-created upload directories
    ├── emotion/
    └── hand/

frontend/
├── config/
│   └── api.ts            # API configuration and helpers
└── app/
    └── story/
        └── [id].tsx      # Story reading screen with camera integration
```

## Next Steps

1. **Database Integration:** Currently using in-memory storage. Consider adding a database (MongoDB, PostgreSQL) for persistence.

2. **Authentication:** Add user authentication if needed.

3. **Image Optimization:** Consider adding `expo-image-manipulator` for better image compression before upload.

4. **Error Handling:** Enhance error handling and retry logic.

5. **Real-time Updates:** Consider WebSocket for real-time engagement updates during the session.
