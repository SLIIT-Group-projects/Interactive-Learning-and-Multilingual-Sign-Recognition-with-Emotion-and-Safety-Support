# Authentication System Setup Guide

This guide explains the complete authentication system implementation for the ASL Learning App.

## ✅ What's Been Implemented

### 1. Authentication Services
- **authService.js** - Firebase Auth functions (register, login, logout)
- **userService.js** - Firestore user document management
- **gameService.js** - Game session management with parent-child linking

### 2. Authentication Context
- **AuthContext.js** - Global auth state management
- Provides: `user`, `userData`, `isAuthenticated`, `isParent`, `isChild`

### 3. Authentication Screens
- **LoginScreen.js** - User login
- **RegisterScreen.js** - Parent registration
- **AddChildScreen.js** - Parent creates child accounts

### 4. Role-Based Routing
- **App.js** - Automatically routes based on user role
- Parents → Parent Dashboard
- Children → Child Dashboard/Game

### 5. Updated Components
- **PlayGame.js** - Uses authenticated child and parent IDs
- **ParentDashboard.js** - Shows children, allows adding new children

## 🔐 User Data Structure

### Firestore Collections

#### `users/{uid}`
```javascript
{
  uid: string,
  role: "parent" | "child",
  name: string,
  email: string,
  parentId: string | null,  // null for parents, parent's uid for children
  createdAt: timestamp
}
```

#### `gameSessions/{sessionId}`
```javascript
{
  sessionId: string,
  childId: string,      // Child UID
  parentId: string,     // Parent UID
  gameMode: "practice" | "quiz" | "challenge",
  totalQuestions: number,
  correctAnswers: number,
  accuracy: number,
  timeTaken: number,
  difficultyLevel: string,
  createdAt: timestamp
}
```

#### `letterPerformance/{childId_letter}`
```javascript
{
  childId: string,
  parentId: string,
  letter: string,
  attempts: number,
  correct: number,
  incorrect: number,
  averageResponseTime: number,
  lastPracticed: timestamp
}
```

## 🚀 Usage Flow

### Parent Registration
1. User goes to Register screen
2. Enters name, email, password
3. `registerParent()` creates:
   - Firebase Auth account
   - Firestore user document with `role: "parent"`
4. Redirects to Login

### Parent Login
1. Parent enters email/password
2. `loginUser()` authenticates
3. `getUserDocument()` fetches role
4. AuthContext updates
5. App.js routes to Parent Dashboard

### Parent Creates Child
1. Parent clicks "+" button in Parent Dashboard
2. Enters child name, email, password
3. `registerChild()` creates:
   - Firebase Auth account for child
   - Firestore user document with `role: "child"` and `parentId: parentUid`
   - Reference in `parents/{parentId}/children/{childId}`
4. Parent stays logged in

### Child Login
1. Child enters their email/password
2. `loginUser()` authenticates
3. `getUserDocument()` fetches role and parentId
4. AuthContext updates
5. App.js routes to Child Dashboard

### Child Plays Game
1. Child plays game in PlayGame screen
2. Each answer calls `updateLetterPerformance(childId, parentId, letter, isCorrect, responseTime)`
3. Game end calls `saveGameSession({ childId, parentId, ... })`
4. All data linked to child and parent

## 📱 Component Integration

### Using Auth in Components

```javascript
import { useAuth } from '../contexts/AuthContext';

function MyComponent() {
  const { userData, isAuthenticated, isParent, isChild } = useAuth();
  
  if (!isAuthenticated) {
    return <Text>Please login</Text>;
  }
  
  if (isParent) {
    return <Text>Welcome Parent: {userData.name}</Text>;
  }
  
  if (isChild) {
    return <Text>Welcome {userData.name}, Parent: {userData.parentId}</Text>;
  }
}
```

### Logout

```javascript
import { logoutUser } from '../services/authService';

const handleLogout = async () => {
  try {
    await logoutUser();
    // AuthContext will automatically update
    // App.js will route to Login screen
  } catch (error) {
    console.error('Logout error:', error);
  }
};
```

## 🔒 Security Rules

**Important**: You must set up Firestore security rules!

See `FIRESTORE_SECURITY_RULES.md` for complete rules.

Quick setup:
1. Go to Firebase Console → Firestore → Rules
2. Copy rules from `FIRESTORE_SECURITY_RULES.md`
3. Paste and Publish

## 🧪 Testing the System

### Test Parent Registration
1. Open app → Should show Login
2. Click "Register as Parent"
3. Fill form and submit
4. Should redirect to Login

### Test Parent Login
1. Login with parent credentials
2. Should see Parent Dashboard
3. Should see "+" button to add child

### Test Add Child
1. Click "+" button
2. Fill child form
3. Submit
4. Child account created
5. Parent stays logged in

### Test Child Login
1. Logout parent
2. Login with child credentials
3. Should see Child Dashboard
4. Can play games

### Test Game Data
1. Child plays game
2. Check Firebase Console → Firestore
3. Should see:
   - `gameSessions` with childId and parentId
   - `letterPerformance` with childId and parentId

## 🐛 Troubleshooting

### "User document not found"
- Check that user document was created in Firestore
- Verify `users/{uid}` exists
- Check role is set correctly

### "Permission denied"
- Check Firestore security rules
- Verify user is authenticated
- Check user role matches expected role

### "Cannot read property 'uid' of null"
- User not authenticated
- Check AuthContext is wrapping app
- Verify Firebase Auth is initialized

### Routing issues
- Check AuthContext loading state
- Verify userData.role is set
- Check App.js navigation logic

## 📚 Next Steps

1. **Set up Firestore Security Rules** - See `FIRESTORE_SECURITY_RULES.md`
2. **Enable Firebase Authentication** - In Firebase Console
3. **Test the flow** - Register parent → Add child → Login child → Play game
4. **Update Parent Dashboard** - Show real analytics from Firestore
5. **Update Child Dashboard** - Show real progress data

## 🔗 Related Files

- `services/authService.js` - Authentication functions
- `services/userService.js` - User document management
- `services/gameService.js` - Game session management
- `contexts/AuthContext.js` - Auth state management
- `FIRESTORE_SECURITY_RULES.md` - Security rules documentation








