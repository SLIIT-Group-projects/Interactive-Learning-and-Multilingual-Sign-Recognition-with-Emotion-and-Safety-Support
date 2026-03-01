import { doc, setDoc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

/**
 * Create a user document in Firestore
 * @param {string} uid - User UID from Firebase Auth
 * @param {string} role - 'parent' or 'child'
 * @param {string} name - User name
 * @param {string} email - User email
 * @param {string|null} parentId - Parent UID (null for parents, parent's uid for children)
 * @returns {Promise<void>}
 */
export const createUserDocument = async (uid, role, name, email, parentId = null) => {
  try {
    if (!db) {
      throw new Error('Firestore not initialized');
    }

    if (role !== 'parent' && role !== 'child') {
      throw new Error('Invalid role. Must be "parent" or "child"');
    }

    if (role === 'parent' && parentId !== null) {
      throw new Error('Parent cannot have a parentId');
    }

    if (role === 'child' && !parentId) {
      throw new Error('Child must have a parentId');
    }

    const userData = {
      uid: uid,
      role: role,
      name: name,
      email: email,
      parentId: parentId,
      createdAt: serverTimestamp(),
    };

    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, userData);

    console.log(`✅ User document created: ${uid} (${role})`);

    // If child, also add reference to parent's children collection
    if (role === 'child' && parentId) {
      await addChildToParent(parentId, uid, name);
    }

    return userData;
  } catch (error) {
    console.error('❌ Error creating user document:', error);
    throw error;
  }
};

/**
 * Get user document from Firestore
 * @param {string} uid - User UID
 * @returns {Promise<Object|null>} User document or null
 */
export const getUserDocument = async (uid) => {
  try {
    if (!db) {
      throw new Error('Firestore not initialized');
    }

    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      return { id: userSnap.id, ...userSnap.data() };
    }

    return null;
  } catch (error) {
    console.error('❌ Error getting user document:', error);
    throw error;
  }
};

/**
 * Add child reference to parent's children collection
 * @param {string} parentId - Parent UID
 * @param {string} childId - Child UID
 * @param {string} childName - Child name
 * @returns {Promise<void>}
 */
export const addChildToParent = async (parentId, childId, childName) => {
  try {
    if (!db) {
      throw new Error('Firestore not initialized');
    }

    const childRef = doc(db, 'parents', parentId, 'children', childId);
    await setDoc(childRef, {
      childId: childId,
      name: childName,
      createdAt: serverTimestamp(),
    });

    console.log(`✅ Child ${childId} added to parent ${parentId}`);
  } catch (error) {
    console.error('❌ Error adding child to parent:', error);
    throw error;
  }
};

/**
 * Get all children for a parent
 * @param {string} parentId - Parent UID
 * @returns {Promise<Array>} Array of child documents
 */
export const getParentChildren = async (parentId) => {
  try {
    if (!db) {
      throw new Error('Firestore not initialized');
    }

    // Query users collection for children with this parentId
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    const usersRef = collection(db, 'users');
    const childrenQuery = query(
      usersRef,
      where('parentId', '==', parentId),
      where('role', '==', 'child')
    );
    const childrenSnap = await getDocs(childrenQuery);

    const children = [];
    childrenSnap.forEach((doc) => {
      children.push({ id: doc.id, ...doc.data() });
    });

    return children;
  } catch (error) {
    console.error('❌ Error getting parent children:', error);
    throw error;
  }
};

/**
 * Register a parent user
 * @param {string} email - Parent email
 * @param {string} password - Parent password
 * @param {string} name - Parent name
 * @returns {Promise<{uid: string, userData: Object}>}
 */
export const registerParent = async (email, password, name) => {
  try {
    const { registerUser } = await import('../auth/authService');
    const { createUserDocument } = await import('./userService');

    // Create Firebase Auth account
    const { uid } = await registerUser(email, password);

    // Create Firestore user document
    const userData = await createUserDocument(uid, 'parent', name, email, null);

    return { uid, userData };
  } catch (error) {
    console.error('❌ Error registering parent:', error);
    throw error;
  }
};

/**
 * Register a child user (called by parent)
 * @param {string} email - Child email
 * @param {string} password - Child password
 * @param {string} name - Child name
 * @param {string} parentId - Parent UID
 * @returns {Promise<{uid: string, userData: Object}>}
 */
export const registerChild = async (email, password, name, parentId) => {
  try {
    const { registerUser } = await import('../auth/authService');
    const { createUserDocument } = await import('./userService');

    // Create Firebase Auth account for child
    const { uid } = await registerUser(email, password);

    // Create Firestore user document
    const userData = await createUserDocument(uid, 'child', name, email, parentId);

    return { uid, userData };
  } catch (error) {
    console.error('❌ Error registering child:', error);
    throw error;
  }
};

