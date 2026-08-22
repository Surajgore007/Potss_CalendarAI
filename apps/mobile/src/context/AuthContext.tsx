import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAuth,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { UserProfile } from '@eventpulse/shared';
import { initFirebase } from '@eventpulse/shared';

const AUTH_STORAGE_KEY = '@eventpulse_saved_user_profile';

interface AuthContextType {
  user: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  isLoading: boolean;
  isDemoUser: boolean;
  signInWithGoogle: () => Promise<void>;
  signInAsDemoUser: (name?: string, email?: string) => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDemoUser, setIsDemoUser] = useState<boolean>(false);

  // Restore saved session from local storage on initial mount
  useEffect(() => {
    const loadStoredUser = async () => {
      try {
        const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setUser(parsed.user);
          setIsDemoUser(!!parsed.isDemoUser);
        }
      } catch (e) {
        console.warn('Could not read saved user session:', e);
      }
    };
    loadStoredUser();
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};

    try {
      const { app } = initFirebase();
      const auth = getAuth(app);

      // Configure Google Sign-In for native if webClientId is provided
      const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
      if (Platform.OS !== 'web' && webClientId && webClientId !== 'your_google_web_client_id.apps.googleusercontent.com') {
        try {
          GoogleSignin.configure({
            webClientId,
            offlineAccess: false,
          });
        } catch (e) {
          console.warn('GoogleSignin configure warning:', e);
        }
      }

      unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
        if (fbUser) {
          setFirebaseUser(fbUser);
          const profile: UserProfile = {
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Developer',
            photoURL: fbUser.photoURL,
            defaultReminderOffsets: [4320, 1440, 0],
          };
          setUser(profile);
          setIsDemoUser(false);
          await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user: profile, isDemoUser: false }));
        } else if (!isDemoUser) {
          // If no firebase user and not in demo mode, check if we had demo stored
          const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.isDemoUser) {
              setUser(parsed.user);
              setIsDemoUser(true);
            }
          }
        }
        setIsLoading(false);
      });
    } catch (err) {
      console.warn('Firebase Auth initialization error (can use demo mode):', err);
      setIsLoading(false);
    }

    return () => unsubscribe();
  }, [isDemoUser]);

  const signInWithGoogle = async () => {
    setIsLoading(true);
    try {
      if (Platform.OS === 'web') {
        // Web Google sign-in
        const { app } = initFirebase();
        const auth = getAuth(app);
        const provider = new GoogleAuthProvider();
        const res = await signInWithPopup(auth, provider);
        const fbUser = res.user;
        const profile: UserProfile = {
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName || 'Developer',
          photoURL: fbUser.photoURL,
          defaultReminderOffsets: [4320, 1440, 0],
        };
        setUser(profile);
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user: profile, isDemoUser: false }));
      } else {
        // Native Google Sign-In
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        const signinResult = await GoogleSignin.signIn();
        const idToken = (signinResult as any).data?.idToken || (signinResult as any).idToken;

        if (!idToken) {
          throw new Error('No ID token received from Google Sign-In.');
        }

        const credential = GoogleAuthProvider.credential(idToken);
        const { app } = initFirebase();
        const auth = getAuth(app);
        await signInWithCredential(auth, credential);
      }
    } catch (error: any) {
      console.error('Sign-in error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signInAsDemoUser = async (name = 'Suraj', email = 'suraj.dev@example.com') => {
    setIsLoading(true);
    const demoProfile: UserProfile = {
      uid: 'demo_user_12345',
      email,
      displayName: name,
      photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
      defaultReminderOffsets: [4320, 1440, 0],
    };
    setUser(demoProfile);
    setIsDemoUser(true);
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user: demoProfile, isDemoUser: true }));
    setIsLoading(false);
  };

  const signOutUser = async () => {
    setIsLoading(true);
    try {
      if (!isDemoUser) {
        try {
          if (Platform.OS !== 'web') {
            await GoogleSignin.signOut();
          }
          const { app } = initFirebase();
          const auth = getAuth(app);
          await signOut(auth);
        } catch (e) {
          console.warn('Sign out warning:', e);
        }
      }
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      setUser(null);
      setFirebaseUser(null);
      setIsDemoUser(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        isLoading,
        isDemoUser,
        signInWithGoogle,
        signInAsDemoUser,
        signOutUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
