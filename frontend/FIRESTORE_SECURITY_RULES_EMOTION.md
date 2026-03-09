# Firestore Security Rules (Updated with Emotion Collections)

This document contains the updated security rules including the new emotion detection collections.

## 🔒 Updated Security Rules

Copy and paste these rules into your Firebase Console → Firestore Database → Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Helper function to get user document
    function getUserData() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }
    
    // Users collection - users can only read/write their own document
    match /users/{userId} {
      allow read: if isAuthenticated() && request.auth.uid == userId;
      allow write: if isAuthenticated() && request.auth.uid == userId;
    }
    
    // Parents collection - only for storing child references
    match /parents/{parentId} {
      // Parents can read their own parent document
      allow read: if isAuthenticated() && 
        request.auth.uid == parentId && 
        getUserData().role == 'parent';
      
      // Children subcollection
      match /children/{childId} {
        // Only the parent can read their children references
        allow read: if isAuthenticated() && 
          request.auth.uid == parentId && 
          getUserData().role == 'parent';
        
        // Only system can write (via server-side code)
        allow write: if false;
      }
    }
    
    // Children progress (XP, level, unlocked games) - one doc per child
    match /children/{childId} {
      // Children can read/write their own progress
      allow read, write: if isAuthenticated() && request.auth.uid == childId;
      
      // Parents can read their children's progress
      allow read: if isAuthenticated() && 
        getUserData().role == 'parent' && 
        get(/databases/$(database)/documents/users/$(childId)).data.parentId == request.auth.uid;
    }
    
    // Game Sessions collection
    match /gameSessions/{sessionId} {
      // Children can read their own sessions
      allow read: if isAuthenticated() && 
        resource.data.childId == request.auth.uid;
      
      // Parents can read sessions where they are the parent
      allow read: if isAuthenticated() && 
        getUserData().role == 'parent' && 
        resource.data.parentId == request.auth.uid;
      
      // Only authenticated children can create sessions
      allow create: if isAuthenticated() && 
        getUserData().role == 'child' && 
        request.resource.data.childId == request.auth.uid &&
        request.resource.data.parentId == getUserData().parentId;
      
      // No updates or deletes allowed
      allow update, delete: if false;
    }
    
    // Letter Performance collection
    match /letterPerformance/{docId} {
      // Children can read their own letter performance
      allow read: if isAuthenticated() && 
        resource.data.childId == request.auth.uid;
      
      // Parents can read their children's letter performance
      allow read: if isAuthenticated() && 
        getUserData().role == 'parent' && 
        resource.data.parentId == request.auth.uid;
      
      // Only authenticated children can create/update their own performance
      allow write: if isAuthenticated() && 
        getUserData().role == 'child' && 
        request.resource.data.childId == request.auth.uid &&
        request.resource.data.parentId == getUserData().parentId;
    }
    
    // Game Emotion Sessions collection (NEW)
    match /gameEmotionSessions/{emotionSessionId} {
      // Children can read their own emotion sessions
      allow read: if isAuthenticated() && 
        resource.data.childId == request.auth.uid;
      
      // Parents can read emotion sessions where they are the parent
      allow read: if isAuthenticated() && 
        getUserData().role == 'parent' && 
        resource.data.parentId == request.auth.uid;
      
      // Only authenticated children can create emotion sessions
      allow create: if isAuthenticated() && 
        getUserData().role == 'child' && 
        request.resource.data.childId == request.auth.uid &&
        request.resource.data.parentId == getUserData().parentId;
      
      // No updates or deletes allowed
      allow update, delete: if false;
    }
    
    // Emotion Daily Stats collection (NEW)
    match /emotionDailyStats/{dailyDocId} {
      // Children can read their own daily stats
      allow read: if isAuthenticated() && 
        resource.data.childId == request.auth.uid;
      
      // Parents can read their children's daily stats
      allow read: if isAuthenticated() && 
        getUserData().role == 'parent' && 
        resource.data.parentId == request.auth.uid;
      
      // System can create/update daily stats (when emotion session is saved)
      // Allow children to create/update their own stats
      allow write: if isAuthenticated() && 
        getUserData().role == 'child' && 
        request.resource.data.childId == request.auth.uid &&
        request.resource.data.parentId == getUserData().parentId;
    }
    
    // Emotion Insights collection (NEW)
    match /emotionInsights/{childId} {
      // Children can read their own insights
      allow read: if isAuthenticated() && 
        request.auth.uid == childId;
      
      // Parents can read their children's insights
      allow read: if isAuthenticated() && 
        getUserData().role == 'parent' && 
        resource.data.parentId == request.auth.uid;
      
      // System can create/update insights (when analysis is run)
      // Allow children to create/update their own insights
      allow write: if isAuthenticated() && 
        getUserData().role == 'child' && 
        request.auth.uid == childId &&
        request.resource.data.childId == childId &&
        request.resource.data.parentId == getUserData().parentId;
    }
    
    // Deny all other access
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## 📝 How to Apply These Rules

1. **Go to Firebase Console**
   - Navigate to: https://console.firebase.google.com/
   - Select your project: `signlanguageproject-eb8d8`

2. **Open Firestore Database**
   - Click on **Build** → **Firestore Database**
   - Click on the **Rules** tab

3. **Paste the Updated Rules**
   - Delete the existing rules
   - Paste the rules from above
   - Click **Publish**

4. **Verify Rules**
   - The rules should validate without errors
   - Wait a few seconds for rules to propagate

## 🆕 What's New

The updated rules now include permissions for:

1. **`gameEmotionSessions`** - Stores emotion data linked to game sessions
   - Children can create their own emotion sessions
   - Parents can read their children's emotion sessions

2. **`emotionDailyStats`** - Daily aggregated emotion statistics
   - Children can create/update their own daily stats
   - Parents can read their children's daily stats

3. **`emotionInsights`** - Analysis results and predictions
   - Children can create/update their own insights
   - Parents can read their children's insights

## ⚠️ Important Notes

- All collections require authentication
- Children can only write their own data
- Parents can only read their own children's data
- No updates or deletes allowed for emotion sessions (immutable)
- Daily stats and insights can be updated when new data arrives

## 🐛 Troubleshooting

If you still get permission errors after updating:

1. **Wait a few seconds** - Rules can take 10-30 seconds to propagate
2. **Clear app cache** - Restart your app
3. **Check user authentication** - Make sure user is logged in
4. **Verify user role** - Check that user document has correct `role` field
5. **Check parentId** - Verify child's `parentId` matches parent's `uid`

## 🔐 Security Best Practices

- All operations require authentication
- Children can only access their own data
- Parents can only access their children's data
- No public access to any collections
- Immutable emotion sessions (no updates/deletes)
