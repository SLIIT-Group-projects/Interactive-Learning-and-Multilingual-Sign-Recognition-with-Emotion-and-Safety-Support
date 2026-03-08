# Enable Firebase Authentication

The error `auth/configuration-not-found` means Firebase Authentication is not enabled in your Firebase project.

## 🔧 Steps to Enable Firebase Authentication

1. **Go to Firebase Console**
   - Visit: https://console.firebase.google.com/
   - Select your project: `signlanguageproject-eb8d8`

2. **Enable Authentication**
   - Click on **Build** → **Authentication** (or **Authentication** in the left sidebar)
   - Click **Get Started** (if you haven't enabled it yet)

3. **Enable Email/Password Provider**
   - In the Authentication page, click on **Sign-in method** tab
   - Click on **Email/Password**
   - Toggle **Enable** to ON
   - Click **Save**

4. **Verify Configuration**
   - Make sure your `.env` file has the correct values:
     ```env
     EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSyAxWAEsxF-VDmM_9qJIpN4b-aAFYVDgkOE
     EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=signlanguageproject-eb8d8.firebaseapp.com
     EXPO_PUBLIC_FIREBASE_PROJECT_ID=signlanguageproject-eb8d8
     EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=signlanguageproject-eb8d8.firebasestorage.app
     EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=977819571660
     EXPO_PUBLIC_FIREBASE_APP_ID=1:977819571660:web:ebf09b38525050a40d3969
     ```

5. **Restart Your App**
   - Stop your Expo server (Ctrl+C)
   - Clear cache: `npm start -- --clear`
   - Or restart normally: `npm start`

## ✅ Verification

After enabling Authentication:

1. Check Firebase Console → Authentication → Users
   - Should be empty initially
   - Will populate as users register

2. Try registering a parent account
   - Should work without `configuration-not-found` error
   - User should appear in Authentication → Users

3. Check console logs
   - Should see: `✅ Firebase initialized successfully with Auth persistence`
   - No more `auth/configuration-not-found` errors

## 🐛 Troubleshooting

### Still getting `configuration-not-found`?

1. **Check .env file exists**
   - Make sure `.env` is in `frontend/` directory
   - Verify all values are correct (no extra spaces)

2. **Restart Expo with cache clear**
   ```bash
   cd frontend
   npm start -- --clear
   ```

3. **Check Firebase Console**
   - Verify Authentication is enabled
   - Verify Email/Password provider is enabled
   - Check project settings match your .env values

4. **Verify authDomain**
   - Should be: `{projectId}.firebaseapp.com`
   - In your case: `signlanguageproject-eb8d8.firebaseapp.com`

### `auth/invalid-email` error?

- Make sure email format is correct: `user@example.com`
- Check for extra spaces in email input
- Verify email validation in LoginScreen/RegisterScreen

## 📚 Additional Resources

- [Firebase Auth Setup](https://firebase.google.com/docs/auth/web/start)
- [Email/Password Authentication](https://firebase.google.com/docs/auth/web/password-auth)




