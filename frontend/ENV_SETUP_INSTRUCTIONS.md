# Environment Variables Setup

## ⚠️ Important: Create .env File

The `.env` file is protected for security reasons. You need to create it manually.

## 📝 Steps to Create .env File

1. **Navigate to the frontend directory:**
   ```bash
   cd frontend
   ```

2. **Create a new file named `.env`** (no extension)

3. **Add your Firebase credentials:**
   ```env
   EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSyAxWAEsxF-VDmM_9qJIpN4b-aAFYVDgkOE
   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=signlanguageproject-eb8d8.firebaseapp.com
   EXPO_PUBLIC_FIREBASE_PROJECT_ID=signlanguageproject-eb8d8
   EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=signlanguageproject-eb8d8.firebasestorage.app
   EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=977819571660
   EXPO_PUBLIC_FIREBASE_APP_ID=1:977819571660:web:ebf09b38525050a40d3969
   ```

4. **Save the file**

5. **Restart your Expo development server:**
   ```bash
   npm start
   ```

## ✅ Verification

After creating the `.env` file and restarting:

1. Check the console for: `✅ Firebase initialized successfully`
2. Play a game - data should now be saved to Firestore
3. Check Firebase Console → Firestore Database to see your data

## 🔒 Security Note

- The `.env` file is already in `.gitignore`
- Never commit this file to version control
- Keep your Firebase credentials secure







