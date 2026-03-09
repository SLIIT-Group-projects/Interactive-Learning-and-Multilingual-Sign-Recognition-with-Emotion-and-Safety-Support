# Fix: App Works on Web But Not in Expo App

## Problem
The app opens and works in the web browser but doesn't work in the Expo Go app on mobile devices.

## Solution Applied
Added the `expo-camera` plugin to `app.json` which is required for the camera to work on mobile devices.

## Steps to Fix

### 1. Clear Cache and Rebuild
After adding the camera plugin, you need to clear the cache and restart:

```bash
cd frontend-sign-translation/multilingual-sign-translation
npx expo start --clear
```

### 2. If Using Expo Go App
If you're using Expo Go on your phone:
- **Close and reopen the Expo Go app** on your phone
- Scan the QR code again from the terminal
- The app should reload with the new configuration

### 3. If Building Development Build
If you're using a development build (not Expo Go):
```bash
# For Android
npx expo prebuild --clean
npx expo run:android

# For iOS
npx expo prebuild --clean
npx expo run:ios
```

## Common Issues and Solutions

### Issue 1: "Camera permission denied"
**Solution:**
- Go to your phone's Settings → Apps → Expo Go → Permissions
- Enable Camera permission
- Restart the app

### Issue 2: App crashes on startup
**Possible causes:**
1. **New Architecture enabled**: The `newArchEnabled: true` in app.json might cause issues with some packages
2. **React 19 compatibility**: Some packages might not be fully compatible with React 19

**Try this:**
```json
// Temporarily disable new architecture in app.json
"newArchEnabled": false
```

Then restart:
```bash
npx expo start --clear
```

### Issue 3: "Module not found" errors
**Solution:**
```bash
# Delete node_modules and reinstall
rm -rf node_modules
npm install

# Or on Windows PowerShell:
Remove-Item -Recurse -Force node_modules
npm install
```

### Issue 4: App loads but camera doesn't work
**Check:**
1. Camera permission is granted
2. Backend server is running
3. API URL is correctly configured (use your computer's IP, not localhost)

### Issue 5: "Unable to resolve module" errors
**Solution:**
```bash
# Clear Metro bundler cache
npx expo start --clear

# If that doesn't work, reset the project
npm run reset-project
```

## Testing Steps

1. **Start the backend server:**
   ```bash
   cd ../sign-model-backend
   python app.py
   ```

2. **Start Expo:**
   ```bash
   cd ../multilingual-sign-translation
   npx expo start --clear
   ```

3. **On your phone:**
   - Open Expo Go app
   - Scan the QR code
   - Grant camera permission when prompted
   - Navigate to the Sign Detection tab
   - Test the camera

## Alternative: Use Development Build

If Expo Go continues to have issues, consider creating a development build:

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build for your device
eas build --profile development --platform android
# or
eas build --profile development --platform ios
```

## Debugging Tips

### Check Logs
```bash
# View device logs
npx expo start
# Then press 'j' to open debugger, or check the terminal for errors
```

### Test on Emulator/Simulator
```bash
# Android Emulator
npx expo start --android

# iOS Simulator (Mac only)
npx expo start --ios
```

### Verify Configuration
Check that `app.json` has:
- ✅ Camera plugin configured
- ✅ Proper permissions
- ✅ Correct package versions in `package.json`

## Still Not Working?

1. **Check Expo SDK compatibility:**
   - Your app uses Expo SDK 54
   - Make sure Expo Go app on your phone supports SDK 54
   - Update Expo Go app from App Store/Play Store

2. **Try disabling experiments:**
   ```json
   "experiments": {
     "typedRoutes": false,
     "reactCompiler": false
   }
   ```

3. **Check for conflicting packages:**
   - Some packages might conflict with React 19
   - Try downgrading React if needed (not recommended, but as last resort)

4. **Create a minimal test:**
   - Create a simple screen without camera to verify the app loads
   - Then gradually add features back


























