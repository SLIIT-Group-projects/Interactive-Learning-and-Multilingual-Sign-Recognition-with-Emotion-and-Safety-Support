# Updated Firestore Security Rules (Including Emotion Collections)

Copy and paste these rules into Firebase Console → Firestore Database → Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to get user document data
    function getUserData() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }
    
    // Helper function to get child user document data
    function getChildUserData(childId) {
      return get(/databases/$(database)/documents/users/$(childId)).data;
    }
    
    // Children progress (XP, level) – child can read/write, parent can read
    match /children/{childId} {
      // Child can read/write their own progress
      allow read, write: if request.auth != null && request.auth.uid == childId;
      
      // Parent can read their child's progress
      allow read: if request.auth != null && 
        getUserData().role == 'parent' && 
        getChildUserData(childId).parentId == request.auth.uid;
    }
    
    // All other collections – open for now (e.g. dev)
    match /users/{userId} {
      allow read, write: if true;
    }
    match /parents/{parentId} {
      allow read, write: if true;
    }
    match /gameSessions/{sessionId} {
      allow read, write: if true;
    }
 match /letterPerformance/{docId} {
   allow read, write: if true;
 }
 match /gameEmotionSessions/{sessionId} {
   allow read, write: if true;
 }
 match /storyEmotionSessions/{sessionId} {
   allow read, write: if true;
 }
 match /emotionDailyStats/{docId} {
   allow read, write: if true;
 }
 match /emotionInsights/{docId} {
   allow read, write: if true;
 }
    
    // NEW: Game Emotion Sessions collection (for emotion detection integration)
    match /gameEmotionSessions/{emotionSessionId} {
      allow read, write: if true;
    }
    
    // NEW: Story Emotion Sessions collection (for story reading emotion detection)
    match /storyEmotionSessions/{emotionSessionId} {
      allow read, write: if true;
    }
    
    // NEW: Emotion Daily Stats collection (for daily emotion aggregation)
    match /emotionDailyStats/{dailyDocId} {
      allow read, write: if true;
    }
    
    // NEW: Emotion Insights collection (for emotion analysis and predictions)
    match /emotionInsights/{childId} {
      allow read, write: if true;
    }
    
    // If you have more top-level collections (e.g. sounds, etc.), add them the same way
  }
}
```

## What Changed

Added three new collections with the same permissive rules (for development):

1. **`gameEmotionSessions`** - Stores emotion data linked to game sessions
2. **`emotionDailyStats`** - Daily aggregated emotion statistics  
3. **`emotionInsights`** - Analysis results and predictions

All three collections use `allow read, write: if true;` to match your current development setup.

## Production-Ready Rules (Optional)

If you want more secure rules for production, use this version instead:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to get user document data
    function getUserData() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }
    
    // Helper function to get child user document data
    function getChildUserData(childId) {
      return get(/databases/$(database)/documents/users/$(childId)).data;
    }
    
    // Children progress (XP, level) – child can read/write, parent can read
    match /children/{childId} {
      // Child can read/write their own progress
      allow read, write: if request.auth != null && request.auth.uid == childId;
      
      // Parent can read their child's progress
      allow read: if request.auth != null && 
        getUserData().role == 'parent' && 
        getChildUserData(childId).parentId == request.auth.uid;
    }
    
    // Users collection
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Parents collection
    match /parents/{parentId} {
      allow read, write: if request.auth != null && request.auth.uid == parentId;
    }
    
    // Game Sessions collection
    match /gameSessions/{sessionId} {
      // Children can read/write their own sessions
      allow read, write: if request.auth != null && 
        resource.data.childId == request.auth.uid;
      
      // Parents can read their children's sessions
      allow read: if request.auth != null && 
        getUserData().role == 'parent' && 
        resource.data.parentId == request.auth.uid;
      
      // Children can create sessions
      allow create: if request.auth != null && 
        getUserData().role == 'child' && 
        request.resource.data.childId == request.auth.uid;
    }
    
    // Letter Performance collection
    match /letterPerformance/{docId} {
      // Children can read/write their own performance
      allow read, write: if request.auth != null && 
        resource.data.childId == request.auth.uid;
      
      // Parents can read their children's performance
      allow read: if request.auth != null && 
        getUserData().role == 'parent' && 
        resource.data.parentId == request.auth.uid;
    }
    
    // Game Emotion Sessions collection
    match /gameEmotionSessions/{emotionSessionId} {
      // Children can read/write their own emotion sessions
      allow read, write: if request.auth != null && 
        resource.data.childId == request.auth.uid;
      
      // Parents can read their children's emotion sessions
      allow read: if request.auth != null && 
        getUserData().role == 'parent' && 
        resource.data.parentId == request.auth.uid;
      
      // Children can create emotion sessions
      allow create: if request.auth != null && 
        getUserData().role == 'child' && 
        request.resource.data.childId == request.auth.uid;
    }
    
    // Story Emotion Sessions collection
    match /storyEmotionSessions/{emotionSessionId} {
      // Children can read/write their own story emotion sessions
      allow read, write: if request.auth != null && 
        resource.data.childId == request.auth.uid;
      
      // Parents can read their children's story emotion sessions
      allow read: if request.auth != null && 
        getUserData().role == 'parent' && 
        resource.data.parentId == request.auth.uid;
      
      // Children can create story emotion sessions
      allow create: if request.auth != null && 
        getUserData().role == 'child' && 
        request.resource.data.childId == request.auth.uid;
    }
    
    // Emotion Daily Stats collection
    match /emotionDailyStats/{dailyDocId} {
      // Children can read/write their own daily stats
      allow read, write: if request.auth != null && 
        resource.data.childId == request.auth.uid;
      
      // Parents can read their children's daily stats
      allow read: if request.auth != null && 
        getUserData().role == 'parent' && 
        resource.data.parentId == request.auth.uid;
    }
    
    // Emotion Insights collection
    match /emotionInsights/{childId} {
      // Children can read/write their own insights
      allow read, write: if request.auth != null && 
        request.auth.uid == childId;
      
      // Parents can read their children's insights
      allow read: if request.auth != null && 
        getUserData().role == 'parent' && 
        resource.data.parentId == request.auth.uid;
    }
  }
}
```

## How to Apply

1. Go to **Firebase Console** → Your Project
2. Navigate to **Firestore Database** → **Rules** tab
3. Replace the existing rules with the updated version above
4. Click **Publish**
5. Wait 10-30 seconds for rules to propagate

The error should be fixed after updating the rules!
