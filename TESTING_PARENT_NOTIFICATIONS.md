# Testing Parent Notification System

This guide explains how to test the parent notification system when children trigger critical alerts.

## Prerequisites

1. **Backend running**: `cd backend && npm run dev`
2. **Frontend running**: `cd frontend && npm start`
3. **Two user accounts**:
   - One parent account
   - One child account (linked to the parent)

## Testing Steps

### 1. Setup Test Accounts

#### Create Parent Account:
1. Open the app
2. Register a new parent account (e.g., "Test Parent", email: "parent@test.com")
3. Note the parent's user ID (check Firebase Console → Authentication)

#### Create Child Account:
1. Login as the parent
2. Navigate to "Add Child" 
3. Create a child account (e.g., "Test Child")
4. Note the child's user ID (check Firebase Console → Authentication)
5. Verify the child has `parentId` set to the parent's UID (check Firestore → users collection)

### 2. Test Critical Alert Detection

#### Option A: Use Real Audio (Recommended)
1. **Login as the child** on a device/simulator
2. Navigate to "Hazard Alert" screen
3. Click "START" to begin listening
4. **Play a critical hazard sound** near the device:
   - Fire alarm sound (priority 10)
   - Smoke alarm sound (priority 10)
   - Gunshot sound (priority 10)
   - Emergency siren (priority 9)
5. The app should detect the hazard and save it

#### Option B: Mock Detection (For Development)
1. Check backend logs for detection
2. Manually create a sound record in Firestore `sounds` collection:
```json
{
  "userId": "[CHILD_USER_ID]",
  "type": "fire_alarm",
  "confidence": 0.85,
  "priority": 10,
  "isHazard": true,
  "status": "detected",
  "location": {
    "type": "Point",
    "coordinates": [79.852085, 6.909921],
    "latitude": 6.909921,
    "longitude": 79.852085
  },
  "timestamp": "2025-03-04T03:09:06.792Z",
  "createdAt": "2025-03-04T03:09:06.792Z",
  "updatedAt": "2025-03-04T03:09:06.792Z"
}
```

### 3. Verify Backend Processing

#### Check Backend Logs:
Look for these log messages in the backend console:

```
💾 Attempting to save X detections to database...
🔍 Checking detection: fire_alarm (confidence: 0.85, basePriority: 10, calculatedPriority: 10, finalPriority: 10)
✅ Will save CRITICAL sound: fire_alarm (confidence: 0.85, priority: 10, userId: [CHILD_ID])
💾 Saved CRITICAL alert: fire_alarm (confidence: 0.85, priority: 10, ID: [SOUND_ID])
👨‍👩‍👧 Found parent [PARENT_ID] for child [CHILD_ID]
📬 Created notification [NOTIFICATION_ID] for parent [PARENT_ID] with location: 6.909921, 79.852085
```

#### Check Firestore Database:
1. Open Firebase Console → Firestore Database
2. Check `sounds` collection:
   - Should have a new document with `userId` = child's ID
   - `priority` should be >= 9
   - `location` should contain coordinates
3. Check `notifications` collection:
   - Should have a new document with `parentId` = parent's ID
   - `type` should be `critical_hazard_alert`
   - `location` should match the sound's location
   - `locationText` should be formatted coordinates
   - `read` should be `false`

### 4. Verify Parent Dashboard

#### Check Notification Display:
1. **Login as the parent** on a different device/simulator (or same device after logout)
2. Navigate to Parent Dashboard
3. **Look for**:
   - 🔴 Red badge with unread count next to "Parent Dashboard" title
   - 🚨 "Critical Alerts" section (red background)
   - Notification cards showing:
     - Title: "🚨 Critical Alert Detected"
     - Message: "Your child detected: Fire Alarm\n📍 Location: 6.909921, 79.852085"
     - Child name: "From: Test Child"
     - Location icon with coordinates
     - Timestamp

#### Test Notification Interaction:
1. **Click on a notification**:
   - Should navigate to Hazard History screen
   - Notification should be marked as read (badge count decreases)
   - Unread notifications have red left border
2. **Refresh the dashboard**:
   - Notifications should persist
   - Unread count should update

### 5. Test Different Scenarios

#### Scenario A: Alert with Location
- ✅ Child has GPS enabled
- ✅ Location is captured and included in notification
- ✅ Parent sees location coordinates

#### Scenario B: Alert without Location
- ⚠️ Child's GPS is disabled or fails
- ✅ Alert still saves
- ✅ Notification still created
- ✅ Shows "Location not available" in message

#### Scenario C: Multiple Critical Alerts
- ✅ Multiple alerts from same child
- ✅ Multiple notifications created
- ✅ All show in parent dashboard
- ✅ Unread count reflects all unread notifications

#### Scenario D: Non-Critical Alert
- ⚠️ Alert with priority < 9 (e.g., dog_barking)
- ✅ Alert saves to database
- ❌ No notification created (only critical alerts notify parents)

### 6. Test API Endpoints

#### Get Notifications:
```bash
curl -X GET "http://localhost:3000/api/notifications?parentId=[PARENT_ID]&limit=10"
```

Expected response:
```json
{
  "success": true,
  "data": [
    {
      "id": "[NOTIFICATION_ID]",
      "parentId": "[PARENT_ID]",
      "type": "critical_hazard_alert",
      "title": "🚨 Critical Alert Detected",
      "message": "Test Child detected: Fire Alarm\n📍 Location: 6.909921, 79.852085",
      "hazardType": "fire_alarm",
      "childUserId": "[CHILD_ID]",
      "childName": "Test Child",
      "location": {
        "type": "Point",
        "coordinates": [79.852085, 6.909921]
      },
      "locationText": "6.909921, 79.852085",
      "read": false,
      "timestamp": "2025-03-04T03:09:06.792Z"
    }
  ],
  "total": 1
}
```

#### Mark as Read:
```bash
curl -X PATCH "http://localhost:3000/api/notifications/[NOTIFICATION_ID]" \
  -H "Content-Type: application/json" \
  -d '{"read": true}'
```

#### Get Unread Count:
```bash
curl -X GET "http://localhost:3000/api/notifications?parentId=[PARENT_ID]&unreadOnly=true"
```

### 7. Debugging Tips

#### If notifications don't appear:

1. **Check parent-child relationship**:
   ```javascript
   // In Firestore console, check users collection
   // Child document should have:
   {
     "parentId": "[PARENT_ID]",
     "role": "child"
   }
   ```

2. **Check backend logs**:
   - Look for "👨‍👩‍👧 Found parent" message
   - If missing, child's `parentId` might not be set correctly

3. **Check notification creation**:
   - Look for "📬 Created notification" message
   - Check Firestore `notifications` collection

4. **Check frontend loading**:
   - Open browser/device console
   - Look for errors when loading notifications
   - Check network tab for API calls to `/api/notifications`

5. **Verify critical alert priority**:
   - Check `HAZARD_PRIORITIES` in backend `.env`:
   ```env
   HAZARD_PRIORITIES={"fire_alarm":10,"smoke_alarm":10,"gun_shot":10,"fire":10,"siren":9}
   ```
   - Only alerts with priority >= 9 trigger notifications

#### Common Issues:

**Issue**: Notifications not showing
- **Solution**: Check if `parentId` is correctly set in child's user document

**Issue**: Location not showing
- **Solution**: Ensure GPS permissions are granted on child's device

**Issue**: Multiple notifications for same alert
- **Solution**: This shouldn't happen, but check if `saveSoundsToDatabase` is called multiple times

**Issue**: Notification shows "Location not available"
- **Solution**: Check if location is being captured in `HazardDetectionScreen.js` and passed in context

### 8. Quick Test Script

Create a test script to simulate a critical alert:

```javascript
// test-notification.js
// Run this in Node.js with Firebase Admin SDK

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function testNotification() {
  const childUserId = 'YOUR_CHILD_USER_ID';
  const parentId = 'YOUR_PARENT_USER_ID';
  
  // Create a test sound
  const soundRef = await db.collection('sounds').add({
    userId: childUserId,
    type: 'fire_alarm',
    confidence: 0.9,
    priority: 10,
    isHazard: true,
    status: 'detected',
    location: {
      type: 'Point',
      coordinates: [79.852085, 6.909921],
      latitude: 6.909921,
      longitude: 79.852085
    },
    timestamp: new Date().toISOString(),
    createdAt: new Date(),
    updatedAt: new Date()
  });
  
  console.log('✅ Created test sound:', soundRef.id);
  
  // Manually trigger notification (simulating backend behavior)
  const notificationRef = await db.collection('notifications').add({
    parentId: parentId,
    type: 'critical_hazard_alert',
    title: '🚨 Critical Alert Detected',
    message: 'Test Child detected: Fire Alarm\n📍 Location: 6.909921, 79.852085',
    hazardType: 'fire_alarm',
    childUserId: childUserId,
    childName: 'Test Child',
    location: {
      type: 'Point',
      coordinates: [79.852085, 6.909921]
    },
    locationText: '6.909921, 79.852085',
    soundId: soundRef.id,
    priority: 10,
    timestamp: new Date().toISOString(),
    read: false,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  
  console.log('✅ Created test notification:', notificationRef.id);
}

testNotification().catch(console.error);
```

## Expected Results

✅ **Success indicators**:
- Backend logs show notification creation
- Firestore has notification document
- Parent dashboard shows notification badge
- Notification card displays with location
- Clicking notification navigates to Hazard History
- Notification is marked as read after clicking

## Next Steps

After testing, you can:
1. Test with real audio recordings
2. Test with multiple children
3. Test notification persistence (refresh app)
4. Test notification deletion
5. Test "mark all as read" functionality
