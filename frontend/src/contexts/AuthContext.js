import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { onAuthStateChange } from '../services/auth/authService';
import { getUserDocument } from '../services/firestore/userService';
import { getChildProgress, ensureChildProgress } from '../services/firestore/childProgressService';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [childProgress, setChildProgress] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshChildProgress = useCallback(async () => {
    if (!userData?.uid || userData?.role !== 'child') return null;
    try {
      const progress = await getChildProgress(userData.uid);
      setChildProgress(progress);
      return progress;
    } catch (e) {
      console.warn('refreshChildProgress failed:', e);
      return null;
    }
  }, [userData?.uid, userData?.role]);

  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);

        try {
          const userDoc = await getUserDocument(firebaseUser.uid);
          if (userDoc) {
            setUserData(userDoc);
            if (userDoc.role === 'child') {
              const progress = await ensureChildProgress(firebaseUser.uid);
              setChildProgress(progress);
            } else {
              setChildProgress(null);
            }
          } else {
            console.warn('⚠️ User document not found in Firestore');
            setUserData(null);
            setChildProgress(null);
          }
        } catch (error) {
          console.error('❌ Error fetching user document:', error);
          setUserData(null);
          setChildProgress(null);
        }
      } else {
        setUser(null);
        setUserData(null);
        setChildProgress(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value = {
    user,
    userData,
    childProgress,
    refreshChildProgress,
    loading,
    isAuthenticated: !!user && !!userData,
    isParent: userData?.role === 'parent',
    isChild: userData?.role === 'child',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};




