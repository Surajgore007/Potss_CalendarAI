import '../src/polyfills';
import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Slot } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { AuthProvider } from '../src/context/AuthContext';
import { EventsProvider } from '../src/context/EventsContext';

// Intercept incoming OAuth deep links immediately at app root
WebBrowser.maybeCompleteAuthSession();

import { useRouter, useSegments } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync } from '../src/services/pushNotificationService';
import { OnboardingModal } from '../src/components/OnboardingModal';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

// Initialize notification behavior immediately on module load so notifications are never dropped
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

const ONBOARDING_KEY_PREFIX = '@vanko_onboarding_done_';

function InitialLayout() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checkedUid, setCheckedUid] = useState<string | null>(null);

  // Queue to hold incoming share text until auth & layout are fully initialized
  const [pendingShareText, setPendingShareText] = useState<string | null>(null);
  const lastProcessedPayloadRef = React.useRef<{ text: string; time: number } | null>(null);

  const parseSharedText = (rawUrl: string): string | null => {
    try {
      const parsed = Linking.parse(rawUrl);
      const sharedText = (parsed.queryParams?.text || parsed.queryParams?.shared_text) as string;
      if (sharedText && typeof sharedText === 'string' && sharedText.trim().length > 0) {
        return sharedText.trim();
      }
    } catch (e) {
      console.warn('Error parsing incoming share URL:', e);
    }
    return null;
  };

  const isDuplicatePayload = (text: string): boolean => {
    const now = Date.now();
    if (
      lastProcessedPayloadRef.current &&
      lastProcessedPayloadRef.current.text === text &&
      now - lastProcessedPayloadRef.current.time < 5000 // 5-second window
    ) {
      return true;
    }
    return false;
  };

  // 1. Listen for both cold-start and warm-start share / deep-link intents
  useEffect(() => {
    // Cold start: check initial URL on startup
    Linking.getInitialURL()
      .then((url) => {
        if (url) {
          const text = parseSharedText(url);
          if (text && !isDuplicatePayload(text)) {
            setPendingShareText(text);
          }
        }
      })
      .catch((err) => {
        console.warn('Error reading initial URL:', err);
      });

    // Warm start: listen for runtime / background share events
    const subscription = Linking.addEventListener('url', (event) => {
      if (event.url) {
        const text = parseSharedText(event.url);
        if (text && !isDuplicatePayload(text)) {
          setPendingShareText(text);
        }
      }
    });

    return () => subscription.remove();
  }, []);

  // 2. Setup Android notification channel & listen for push notification click to deep-link
  useEffect(() => {
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('sies-gst-announcements', {
        name: 'Campus & Community Announcements',
        description: 'Instant updates for newly added campus events and reminders',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4F46E5',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      }).catch(() => {});
    }

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'community_event' || data?.type === 'event_reminder') {
        router.push('/(auth)/college');
      }
    });

    return () => responseSub.remove();
  }, []);

  // Sync push notification registration whenever user is logged in
  useEffect(() => {
    if (user?.uid && Platform.OS !== 'web') {
      registerForPushNotificationsAsync(user.uid, user.college || 'General').catch(() => {});
    }
  }, [user?.uid]);

  // 3. Process pending share payload or apply route guard once auth is ready
  useEffect(() => {
    if (isLoading) return;

    if (pendingShareText) {
      if (user) {
        const textToProcess = pendingShareText;
        setPendingShareText(null);
        lastProcessedPayloadRef.current = { text: textToProcess, time: Date.now() };

        router.push({
          pathname: '/(auth)/extract',
          params: { text: textToProcess, autoExtract: 'true' },
        });
        return;
      } else {
        // User not logged in yet — route to login, but keep pendingShareText held until login finishes
        applyRouteGuard();
        return;
      }
    }

    applyRouteGuard();
  }, [user, isLoading, pendingShareText, segments]);

  const applyRouteGuard = () => {
    const inAuthGroup = segments[0] === '(auth)';
    if (!user && inAuthGroup) {
      router.replace('/(public)/login');
    } else if (user && !inAuthGroup) {
      router.replace('/(auth)');
    } else if (!user && !segments.length) {
      router.replace('/(public)/login');
    }
  };

  // Check if user has seen onboarding — once per UID, one time only
  useEffect(() => {
    if (!user || checkedUid === user.uid) return;

    const key = `${ONBOARDING_KEY_PREFIX}${user.uid}`;
    AsyncStorage.getItem(key)
      .then((val) => {
        if (!val) {
          setShowOnboarding(true);
        }
        setCheckedUid(user.uid);
      })
      .catch(() => setCheckedUid(user.uid));
  }, [user, checkedUid]);

  const handleOnboardingDismiss = async () => {
    setShowOnboarding(false);
    if (user) {
      const key = `${ONBOARDING_KEY_PREFIX}${user.uid}`;
      await AsyncStorage.setItem(key, 'done').catch(() => {});
    }
  };

  const isResolvingAuth = isLoading || (!user && segments[0] !== '(public)');

  return (
    <View style={layoutStyles.container}>
      <Slot />

      {isResolvingAuth && (
        <View style={layoutStyles.splashOverlay}>
          <ActivityIndicator size="small" color="#18181B" />
        </View>
      )}

      <OnboardingModal visible={showOnboarding} onDismiss={handleOnboardingDismiss} />
    </View>
  );
}

const layoutStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AuthProvider>
          <EventsProvider>
            <StatusBar style="light" />
            <InitialLayout />
          </EventsProvider>
        </AuthProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
