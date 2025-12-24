import admin from 'firebase-admin';
import serviceAccount from '../../serviceAccountKey.json' with { type: 'json' };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export const db = admin.firestore(); // Firestore
// export const db = admin.database(); // Realtime DB (if you prefer)
