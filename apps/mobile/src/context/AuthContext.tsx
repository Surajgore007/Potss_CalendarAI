import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri } from 'expo-auth-session';
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
  onAuthStateChanged,
  signInWithPopup,
  signInWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  signOut,
  User as FirebaseUser,
  Auth,
} from '@firebase/auth';
import { UserProfile, UserRole, initFirebase, trackUserRegistration, fetchUserRole } from '@eventpulse/shared';

let cachedAuth: Auth | null = null;
function getAppAuth(app: any): Auth {
  if (!cachedAuth) {
    try {
      if (Platform.OS !== 'web') {
        cachedAuth = initializeAuth(app, {
          persistence: getReactNativePersistence(AsyncStorage),
        });
      } else {
        cachedAuth = getAuth(app);
      }
    } catch {
      cachedAuth = getAuth(app);
    }
  }
  return cachedAuth!;
}

// Complete any auth session redirects in browser/custom tabs
WebBrowser.maybeCompleteAuthSession();

const AUTH_STORAGE_KEY = '@eventpulse_saved_user_profile';

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';

interface AuthContextType {
  user: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  role: UserRole;
  isAdmin: boolean;
  isLoading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name?: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Setup Google Auth Session Request with standard Google-compliant redirect resolution
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID || GOOGLE_WEB_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
    redirectUri: makeRedirectUri({
      scheme: 'com.suraj.eventpulse',
    }),
  });

  // 1. Immediate offline session hydration from local encrypted device storage
  useEffect(() => {
    AsyncStorage.getItem(AUTH_STORAGE_KEY)
      .then((stored) => {
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed && parsed.uid) {
              setUser(parsed);
              setIsLoading(false);
            }
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {});
  }, []);

  // 2. Listen to Firebase auth state changes (Zero fake mock accounts)
  useEffect(() => {
    let unsubscribe = () => {};

    try {
      const { app } = initFirebase();
      const auth = getAppAuth(app);

      unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
        if (fbUser) {
          setFirebaseUser(fbUser);
          const userRole = await fetchUserRole(fbUser.uid);
          const profile: UserProfile = {
            uid: fbUser.uid,
            email: fbUser.email || '',
            displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
            photoURL: fbUser.photoURL || null,
            role: userRole,
            defaultReminderOffsets: [4320, 1440, 0],
          };
          setUser(profile);
          await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(profile));
          trackUserRegistration(fbUser.uid).catch(() => {});
        } else {
          // Explicitly clear session state when Firebase Auth is logged out
          setFirebaseUser(null);
          setUser(null);
          await AsyncStorage.removeItem(AUTH_STORAGE_KEY).catch(() => {});
        }
        setIsLoading(false);
      });
    } catch (err) {
      console.warn('Firebase Auth initialization warning:', err);
      setIsLoading(false);
    }

    return () => unsubscribe();
  }, []);

  // Handle real response from Google OAuth Flow
  useEffect(() => {
    const handleGoogleResponse = async () => {
      if (response?.type === 'success') {
        setIsLoading(true);
        setAuthError(null);
        try {
          const { id_token, access_token } = (response.params || {}) as any;
          const idToken = id_token || response.authentication?.idToken || (response as any).idToken;

          if (!idToken) {
            throw new Error('Google did not return an ID token. Check the OAuth client configuration.');
          }

          const { app } = initFirebase();
          const auth = getAppAuth(app);
          const credential = GoogleAuthProvider.credential(idToken, access_token);
          await signInWithCredential(auth, credential);
        } catch (err) {
          console.error('Error signing in with Google credential:', err);
          setAuthError(err instanceof Error ? err.message : 'Google sign-in failed.');
        } finally {
          setIsLoading(false);
        }
      } else if (response?.type === 'error' || response?.type === 'cancel') {
        if (response.type === 'error') {
          const params = (response as any).params || {};
          const errorCode = params.error || 'oauth_error';
          const errorDesc = params.error_description || (response as any).error?.message || 'Google authorization failed.';
          const detailedMessage = `OAuth Error [${errorCode}]: ${errorDesc}`;
          console.warn('Google Auth response error:', detailedMessage);
          setAuthError(detailedMessage);
        }
        setIsLoading(false);
      }
    };

    if (response) {
      handleGoogleResponse();
    }
  }, [response]);

  const signInWithGoogle = async () => {
    setIsLoading(true);
    setAuthError(null);
    try {
      if (Platform.OS === 'web') {
        if (!GOOGLE_WEB_CLIENT_ID) {
          throw new Error('Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID environment variable.');
        }
        const { app } = initFirebase();
        const auth = getAppAuth(app);
        const provider = new GoogleAuthProvider();
        provider.addScope('email');
        provider.addScope('profile');
        await signInWithPopup(auth, provider);
      } else {
        if (!GOOGLE_ANDROID_CLIENT_ID && Platform.OS === 'android') {
          throw new Error('Missing EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID environment variable.');
        }
        if (!GOOGLE_WEB_CLIENT_ID) {
          throw new Error('Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID environment variable for token exchange.');
        }

        try {
          const result = await promptAsync();
          if (result.type === 'error') {
            const params = (result as any).params || {};
            const errorCode = params.error || 'prompt_error';
            const errorDesc = params.error_description || (result as any).error?.message || 'Google authorization failed.';
            throw new Error(`OAuth Error [${errorCode}]: ${errorDesc}`);
          }
          if (result.type !== 'success') {
            setIsLoading(false);
          }
        } catch (oauthErr) {
          console.warn('OAuth prompt error:', oauthErr);
          setIsLoading(false);
          throw oauthErr;
        }
      }
    } catch (error: any) {
      console.error('Google Sign-in error:', error);
      setAuthError(error?.message || 'Google sign-in failed.');
      setIsLoading(false);
      throw error;
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const cleanEmail = email.trim();
      const cleanPass = pass.trim();

      if (!cleanEmail || !cleanPass) {
        throw new Error('Please enter both email and password.');
      }

      const { app } = initFirebase();
      const auth = getAppAuth(app);
      await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
    } catch (err: any) {
      console.error('Email sign-in failed:', err);
      let msg = "We're getting things ready. Please check your connection and try again in a moment.";
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        msg = 'Invalid email or password. Please check your credentials.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Too many attempts. Please wait a moment before trying again.';
      } else if (err.code === 'auth/network-request-failed') {
        msg = 'Network connection issue. Please check your connection.';
      }
      setAuthError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signUpWithEmail = async (email: string, pass: string, name?: string) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const cleanEmail = email.trim();
      const cleanPass = pass.trim();
      const cleanName = name?.trim();

      if (!cleanEmail || !cleanPass) {
        throw new Error('Please enter both email and password.');
      }
      if (cleanPass.length < 6) {
        throw new Error('Password must be at least 6 characters long.');
      }

      const { app } = initFirebase();
      const auth = getAppAuth(app);
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPass);
      if (cleanName) {
        try {
          await updateProfile(cred.user, { displayName: cleanName });
        } catch (e) {}
      }
    } catch (err: any) {
      console.error('Email sign-up failed:', err);
      let msg = "We're getting things ready. Please check your connection and try again in a moment.";
      if (err.code === 'auth/email-already-in-use') {
        msg = 'An account with this email already exists. Please sign in.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password is too weak. Please use at least 6 characters.';
      } else if (err.code === 'auth/network-request-failed') {
        msg = 'Network connection issue. Please check your connection.';
      }
      setAuthError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const sendPasswordReset = async (email: string) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const cleanEmail = email.trim();
      if (!cleanEmail) throw new Error('Please enter your email address to reset password.');
      const { app } = initFirebase();
      const auth = getAppAuth(app);
      await sendPasswordResetEmail(auth, cleanEmail);
    } catch (err: any) {
      console.error('Password reset failed:', err);
      let msg = "We're getting things ready. Please check your connection and try again in a moment.";
      if (err.code === 'auth/user-not-found') {
        msg = 'No account found with this email address.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      }
      setAuthError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signOutUser = async () => {
    setIsLoading(true);
    try {
      try {
        const { app } = initFirebase();
        const auth = getAppAuth(app);
        await signOut(auth);
      } catch (e) {
        console.warn('Sign out warning:', e);
      }
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      setUser(null);
      setFirebaseUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const getIdToken = async (forceRefresh: boolean = false): Promise<string | null> => {
    if (!firebaseUser) return null;
    try {
      return await firebaseUser.getIdToken(forceRefresh);
    } catch (err) {
      console.error('Failed to get fresh Firebase ID token:', err);
      return null;
    }
  };

  const role: UserRole = user?.role || 'student';
  const isAdmin: boolean = role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        role,
        isAdmin,
        isLoading,
        authError,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        sendPasswordReset,
        signOutUser,
        getIdToken,
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
