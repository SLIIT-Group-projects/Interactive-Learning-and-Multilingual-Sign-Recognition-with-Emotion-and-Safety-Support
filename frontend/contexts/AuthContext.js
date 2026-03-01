import React, { createContext, useState, useEffect, useContext } from 'react';
import { onAuthStateChange, getCurrentUser } from '../services/authService';
import { getUserDocument } from '../services/userService';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        
        // Fetch user document from Firestore
        try {
          const userDoc = await getUserDocument(firebaseUser.uid);
          if (userDoc) {
            setUserData(userDoc);
          } else {
            console.warn('⚠️ User document not found in Firestore');
            setUserData(null);
          }
        } catch (error) {
          console.error('❌ Error fetching user document:', error);
          setUserData(null);
        }
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value = {
    user,
    userData,
    loading,
    isAuthenticated: !!user && !!userData,
    isParent: userData?.role === 'parent',
    isChild: userData?.role === 'child',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};




