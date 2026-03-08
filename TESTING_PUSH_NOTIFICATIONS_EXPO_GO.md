# Testing Push Notifications in Expo Go

This guide explains how to test Firebase push notifications when using Expo Go.

## 📋 Prerequisites

1. **Backend running**: `cd backend && npm run dev`
2. **Frontend running**: `cd frontend && npm start`
3. **Expo Go app** installed on your device
4. **Two user accounts**:
   - One parent account
   - One child account (linked to the parent)

## 🔧 Setup Steps

### Step 1: Install Required Packages

In the frontend directory, ensure you have `expo-notifications`:

```bash
cd frontend
npx expo install expo-notifications
```

### Step 2: Request Notification Permissions

The app needs to request notification permissions. This is typically done when the parent logs in.

### Step 3: Get Expo Push Token

When a parent logs in, get their Expo push token and register it with the backend.

## 📱 Frontend Implementation

### Add to Parent Login/Dashboard

Create a file `frontend/src/services/pushNotification.service.js`:

```javascript
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import apiService from './api.service';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Register push token for parent
 */
export async function registerPushToken(userId) {
  try {
    // Check if device supports notifications
    if (!Device.isDevice) {
      console.warn('⚠️ Push notifications only work on physical devices');
      return null;
    }

    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('⚠️ Notification permissions not granted');
      return null;
    }

    // Get Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'deaf-kids',
    });

    const expoPushToken = tokenData.data;
    console.log('📱 Expo Push Token:', expoPushToken);

    // Register token with backend
    try {
      await apiService.post('/notifications/register-push-token', {
        userId: userId,
        pushToken: expoPushToken,
      });
      console.log('✅ Push token registered successfully');
      return expoPushToken;
    } catch (error) {
      console.error('❌ Error registering push token:', error);
      return null;
    }
  } catch (error) {
    console.error('❌ Error getting push token:', error);
    return null;
  }
}

/**
 * Set up notification listener
 */
export function setupNotificationListener(navigation) {
  // Handle notification received while app is foregrounded
  const notificationListener = Notifications.addNotificationReceivedListener(notification => {
    console.log('📬 Notification received:', notification);
    // You can show an alert or update UI here
  });

  // Handle notification tapped
  const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
    console.log('👆 Notification tapped:', response);
    const data = response.notification.request.content.data;
    
    // Navigate to hazard history or notification details
    if (data.type === 'critical_hazard_alert') {
      navigation.navigate('HazardHistory', { 
        notificationId: data.notificationId 
      });
    }
  });

  return () => {
    Notifications.removeNotificationSubscription(notificationListener);
    Notifications.removeNotificationSubscription(responseListener);
  };
}
```

### Update Parent Dashboard

Add to `frontend/src/screens/parent/ParentDashboard.js`:

```javascript
import { registerPushToken, setupNotificationListener } from '../../../services/pushNotification.service';
import { useEffect } from 'react';

// Inside ParentDashboard component:
useEffect(() => {
  if (userData && userData.role === 'parent' && userData.uid) {
    // Register push token when parent logs in
    registerPushToken(userData.uid);
    
    // Set up notification listeners
    const cleanup = setupNotificationListener(navigation);
    return cleanup;
  }
}, [userData]);
```

## 🧪 Testing Steps

### Step 1: Register Parent Push Token

1. **Login as parent** in Expo Go
2. **Check console logs** for:
   ```
   📱 Expo Push Token: ExponentPushToken[xxxxxxxxxxxxx]
   ✅ Push token registered successfully
   ```
3. **Verify in Firestore**:
   - Go to Firebase Console → Firestore Database
   - Find parent's user document in `users` collection
   - Check for `expoPushToken` field

### Step 2: Trigger Critical Alert

1. **Login as child** in Expo Go (on same or different device)
2. Navigate to **Hazard Detection** screen
3. Click **START** to begin listening
4. **Play a critical hazard sound** near the device:
   - Fire alarm sound (priority 10)
   - Smoke alarm sound (priority 10)
   - Gunshot sound (priority 10)
   - Emergency siren (priority 9)

### Step 3: Verify Backend Processing

**Check backend logs** for:
```
💾 Saved CRITICAL alert: fire_alarm (priority: 10)
👨‍👩‍👧 Found parent [PARENT_ID] for child [CHILD_ID]
📬 Created notification [NOTIFICATION_ID] for parent [PARENT_ID]
📱 Expo push notification sent successfully to parent [PARENT_ID]
```

### Step 4: Receive Push Notification

**On parent's device** (Expo Go app):
- You should receive a push notification
- Title: "🚨 Critical Alert Detected"
- Body: "[Child Name] detected: Fire Alarm\n📍 Location: [coordinates]"
- Tap notification to open app

### Step 5: Verify Firestore Notification

**Check Firestore**:
1. Go to Firebase Console → Firestore Database
2. Check `notifications` collection
3. Should have a new document with:
   - `parentId`: Parent's user ID
   - `type`: "critical_hazard_alert"
   - `title`: "🚨 Critical Alert Detected"
   - `message`: Contains child name, hazard type, and location
   - `read`: false

## 🐛 Troubleshooting

### Issue: No push token received

**Solution**:
- Ensure you're testing on a **physical device** (not simulator)
- Check notification permissions are granted
- Verify `expo-notifications` is installed
- Check console for errors

### Issue: Token registered but no notification received

**Check**:
1. Backend logs for errors
2. Firestore `users` collection - verify `expoPushToken` is stored
3. Backend is running and accessible
4. Network connectivity

### Issue: "Expo push notification failed"

**Check**:
1. Expo push token format: Should start with `ExponentPushToken[`
2. Backend can reach `https://exp.host/--/api/v2/push/send`
3. Token hasn't expired (Expo tokens can expire)

### Issue: Notification received but app doesn't open

**Solution**:
- Ensure notification listener is set up
- Check navigation is configured correctly
- Verify notification data structure

## 📝 Manual Testing via API

You can also test by manually calling the backend API:

### 1. Register Token (via Postman/curl):

```bash
curl -X POST http://localhost:3000/api/notifications/register-push-token \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "PARENT_USER_ID",
    "pushToken": "ExponentPushToken[YOUR_EXPO_TOKEN]"
  }'
```

### 2. Test Notification Creation:

```bash
curl -X POST http://localhost:3000/api/hazards/detect \
  -F "audio=@test_audio.wav" \
  -F "userId=CHILD_USER_ID" \
  -F "location={\"type\":\"Point\",\"coordinates\":[79.852085,6.909921]}"
```

## ✅ Success Indicators

- ✅ Expo push token registered in Firestore
- ✅ Backend logs show "Expo push notification sent successfully"
- ✅ Parent receives push notification on device
- ✅ Notification appears in Firestore `notifications` collection
- ✅ Tapping notification opens app (if listener configured)

## 🔄 Next Steps

Once testing is successful:
1. Add notification badge count to parent dashboard
2. Add notification history screen
3. Add notification settings (enable/disable)
4. Test on both iOS and Android devices
5. Consider upgrading to development build for production FCM support

## 📚 Additional Resources

- [Expo Notifications Documentation](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Expo Push Notification Tool](https://expo.dev/notifications) - Test notifications directly
- [Firebase Console](https://console.firebase.google.com/) - Monitor Firestore data
