# Troubleshooting Frame Capture Issues

## Problem
Session shows "0 emotion samples and 0 hand movement samples" even though the session runs.

## Debugging Steps

### 1. Check Console Logs

Look for these log messages when you start a session:

**Frontend logs should show:**
```
[Session] Starting capture intervals for session <sessionId>
[Emotion] Capturing frame for session <sessionId>
[Capture] ✅ Frame captured: file://...
[Emotion] Uploading frame to backend...
[Upload] Uploading to http://192.168.1.11:5000/api/emotion/predict...
[Upload] ✅ Upload successful: {...}
[Emotion] Emotion prediction result: {...}
```

**Backend logs should show:**
```
[Emotion] Received request - Body: { sessionId: '...' }
[Emotion] Received file: { originalname: '...', size: ..., path: '...' }
[Emotion] Processing image: .../uploads/emotion/<sessionId>/<timestamp>.jpg
[Emotion] Python script exited with code 0
[Emotion] ✅ Stored emotion result for session <sessionId>
```

### 2. Common Issues

#### Issue A: Camera Not Capturing
**Symptoms:** No `[Capture] ✅ Frame captured` logs
**Fix:**
- Make sure camera permission is granted
- Check that camera is ON (not hidden)
- Verify `cameraRef.current` exists
- Check `sessionActiveRef.current` is true

#### Issue B: Frames Captured But Not Uploaded
**Symptoms:** See `[Capture] ✅` but no `[Upload] ✅`
**Fix:**
- Check network connection
- Verify backend is running and accessible
- Check for upload errors in console

#### Issue C: Backend Not Receiving Files
**Symptoms:** See `[Upload] ✅` but backend shows "NO FILE"
**Fix:**
- Check multer configuration
- Verify FormData format is correct
- Check CORS settings

#### Issue D: Python Script Failing
**Symptoms:** Backend receives file but Python script errors
**Fix:**
- Check Python path in config
- Verify model file exists
- Check Python dependencies installed

### 3. Verify Uploads Folder

After a session, check:
```
backend/uploads/
  emotion/
    <sessionId>/
      <timestamp>.jpg files should be here
  hand/
    <sessionId>/
      <timestamp>.jpg files should be here
```

If folders are empty:
- Backend isn't receiving files
- Check backend logs for errors
- Verify multer is saving files

### 4. Test Steps

1. **Start Backend:**
   ```bash
   cd backend
   npm run dev
   ```

2. **Start Frontend:**
   ```bash
   cd frontend
   npm start
   ```

3. **Start a Session:**
   - Click "Start Reading Session"
   - Wait at least 10 seconds (emotion captures every 1 second)
   - Watch console logs

4. **Check Results:**
   - Should see capture/upload logs
   - Should see files in uploads folder
   - Should see emotion results

### 5. Quick Test - Check Backend is Working

Try accessing from phone browser:
```
http://192.168.1.11:5000/test
```

Should return:
```json
{
  "message": "Backend is working!",
  "timestamp": "...",
  "routes": {...}
}
```

### 6. Manual Test - Upload a File

Use a tool like Postman or curl to test upload:
```bash
curl -X POST http://192.168.1.11:5000/api/emotion/predict \
  -F "file=@test.jpg" \
  -F "sessionId=test123"
```

Should return emotion prediction JSON.

## Expected Behavior

1. **Session starts** → Backend creates session
2. **Every 1 second** → Camera captures frame → Uploads to `/api/emotion/predict`
3. **Every 5 seconds** → Camera captures 10 frames → Uploads to `/api/hand/analyze`
4. **Files saved** → `uploads/emotion/<sessionId>/` and `uploads/hand/<sessionId>/`
5. **Results stored** → In session store for finalization

## Current Status

With the latest changes:
- ✅ Added comprehensive logging at every step
- ✅ Added fallback handling if Python script fails
- ✅ Always stores data even on errors (with 0 values)
- ✅ Better error messages

If you still see 0 samples, check the console logs to see where it's failing!
