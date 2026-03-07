# Updated Firestore Security Rules

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
    // If you have more top-level collections (e.g. sounds, etc.), add them the same way
  }
}
```

## What Changed:

The `children/{childId}` rule now includes:
1. **Child access** (unchanged): Children can read/write their own progress
2. **Parent access** (NEW): Parents can read their children's progress by:
   - Checking if the user is authenticated
   - Verifying the user is a parent (role == 'parent')
   - Verifying the child's `parentId` matches the parent's `uid`

## How to Apply:

1. Go to **Firebase Console** → Your Project
2. Navigate to **Firestore Database** → **Rules** tab
3. Replace the existing rules with the updated rules above
4. Click **Publish**
5. Wait a few seconds for rules to propagate

After this, parents will be able to read their children's progress data without permission errors.

