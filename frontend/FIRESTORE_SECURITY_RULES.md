# Firestore Security Rules

This document contains the security rules for your Firestore database. These rules ensure that:

- Users can only read/write their own user document
- Parents can read their children's data
- Children cannot access parent documents
- Game sessions can only be written by authenticated children
- Parents can query their children's game sessions

## 🔒 Security Rules

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
    
    // Deny all other access
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## 📝 How to Apply These Rules

1. **Go to Firebase Console**
   - Navigate to your project: https://console.firebase.google.com/
   - Select your project: `signlanguageproject-eb8d8`

2. **Open Firestore Database**
   - Click on **Build** → **Firestore Database**
   - Click on the **Rules** tab

3. **Paste the Rules**
   - Delete the existing rules
   - Paste the rules from above
   - Click **Publish**

4. **Verify Rules**
   - The rules should validate without errors
   - If there are errors, check the syntax

## ⚠️ Important Notes

### Development vs Production

For **development/testing**, you might want to use more permissive rules temporarily:

```javascript
// TEMPORARY - Development only
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**⚠️ Never use this in production!**

### Testing Rules

You can test your rules using the Firebase Console Rules Playground:

1. Go to Firestore → Rules
2. Click "Rules Playground"
3. Test different scenarios:
   - Parent reading their child's data
   - Child creating a game session
   - Unauthenticated user trying to read data

## 🔐 Security Best Practices

1. **Always verify authentication** - Check `request.auth != null`
2. **Verify user role** - Check `getUserData().role`
3. **Verify ownership** - Check `resource.data.childId == request.auth.uid`
4. **Limit write operations** - Only allow creates where needed
5. **No public access** - Never allow unauthenticated reads/writes
6. **Test thoroughly** - Use Rules Playground before deploying

## 🐛 Troubleshooting

### "Permission denied" errors

- Check that user is authenticated
- Verify user document exists in `users` collection
- Check that user role matches expected role
- Verify parentId matches for child operations

### Rules not updating

- Make sure you clicked "Publish"
- Wait a few seconds for rules to propagate
- Clear app cache and restart

### Testing issues

- Use Rules Playground in Firebase Console
- Check Firebase Console → Firestore → Usage for rule violations
- Review console logs for specific error messages

## 📚 Additional Resources

- [Firestore Security Rules Documentation](https://firebase.google.com/docs/firestore/security/get-started)
- [Rules Playground](https://firebase.google.com/docs/firestore/security/test-rules)
- [Common Security Rules Patterns](https://firebase.google.com/docs/firestore/security/rules-conditions)








