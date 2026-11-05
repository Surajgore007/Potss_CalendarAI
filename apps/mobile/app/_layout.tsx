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
import { CampusAffiliationModal } from '../src/components/CampusAffiliationModal';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { initGlobalErrorTracking } from '../src/services/telemetry';

// Initialize global crash & error telemetry immediately
initGlobalErrorTracking();

// Initialize notification behavior immediately on module load so notifications are never dropped
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

const ONBOARDING_KEY_PREFIX = '@vanko_onboarding_done_';
const COLLEGE_PROMPT_KEY_PREFIX = '@vanko_college_prompt_answered_';

function InitialLayout() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showCollegePrompt, setShowCollegePrompt] = useState(false);
  const [checkedUid, setCheckedUid] = useState<string | null>(null);

  // Queue to hold incoming route target (from notification tap or deep link) until auth is resolved
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const lastProcessedNotifIdRef = React.useRef<string | null>(null);
  const lastNavigatedRouteRef = React.useRef<{ route: string; time: number } | null>(null);

  // Queue to hold incoming share payload until auth & layout are fully initialized
  type SharePayload = {
    type: 'text' | 'image' | 'both';
    text?: string;
    imageUri?: string;
  };
  const [pendingSharePayload, setPendingSharePayload] = useState<SharePayload | null>(null);
  const lastProcessedPayloadRef = React.useRef<{ key: string; time: number } | null>(null);

  const extractRouteFromNotification = (notification: Notifications.Notification): string | null => {
    try {
      const data = notification?.request?.content?.data;
      if (!data || typeof data !== 'object') return null;

      // 1. Check for direct eventId / id / event_id
      const eventId = data.eventId || data.id || data.event_id;
      if (eventId && typeof eventId === 'string' && eventId.trim().length > 0) {
        return `/event/${eventId.trim()}`;
      }

      // 2. Check for deep link URL in data payload
      if (data.url && typeof data.url === 'string') {
        const match = data.url.match(/event\/([^/?#]+)/);
        if (match && match[1]) {
          return `/event/${match[1].trim()}`;
        }
      }

      // 3. Fallback for campus announcements without specific eventId
      if (data.type === 'community_event' || data.type === 'college_announcement') {
        return '/(auth)/college';
      }
    } catch (e) {
      console.warn('Error extracting route from notification:', e);
    }
    return null;
  };

  const extractRouteFromUrl = (rawUrl: string): string | null => {
    try {
      const parsed = Linking.parse(rawUrl);
      const path = parsed.path || '';
      // Matches "event/123", "(auth)/event/123", "/event/123"
      const match = path.match(/event\/([^/?#]+)/);
      if (match && match[1]) {
        return `/event/${match[1].trim()}`;
      }
      const qId = parsed.queryParams?.eventId || parsed.queryParams?.id;
      if (qId && typeof qId === 'string' && qId.trim().length > 0) {
        return `/event/${qId.trim()}`;
      }
      if (path.includes('college')) {
        return '/(auth)/college';
      }
    } catch (e) {
      console.warn('Error extracting route from URL:', e);
    }
    return null;
  };

  const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
    if (!response?.notification) return;
    const notifId = response.notification.request.identifier;
    if (notifId && lastProcessedNotifIdRef.current === notifId) {
      return; // Deduplicate identical response triggers
    }
    if (notifId) {
      lastProcessedNotifIdRef.current = notifId;
    }

    const route = extractRouteFromNotification(response.notification);
    if (route) {
      setPendingRoute(route);
    }
  };

  const parseSharedPayload = (rawUrl: string): SharePayload | null => {
    try {
      const parsed = Linking.parse(rawUrl);
      const rawText = (parsed.queryParams?.text || parsed.queryParams?.shared_text) as string;
      const rawImageUri = (parsed.queryParams?.imageUri || parsed.queryParams?.image_uri) as string;

      let cleanText: string | undefined = undefined;
      if (rawText && typeof rawText === 'string' && rawText.trim().length > 0) {
        cleanText = rawText.trim();
      }

      let cleanImageUri: string | undefined = undefined;
      if (rawImageUri && typeof rawImageUri === 'string' && rawImageUri.trim().length > 0) {
        let decoded = rawImageUri.trim();
        try {
          decoded = decodeURIComponent(decoded);
        } catch {}
        cleanImageUri = decoded;
      }

      if (cleanText && cleanImageUri) {
        return { type: 'both', text: cleanText, imageUri: cleanImageUri };
      }
      if (cleanText) {
        return { type: 'text', text: cleanText };
      }
      if (cleanImageUri) {
        return { type: 'image', imageUri: cleanImageUri };
      }
    } catch (e) {
      console.warn('Error parsing incoming share URL:', e);
    }
    return null;
  };

  const isDuplicatePayload = (payload: SharePayload): boolean => {
    const key = `${payload.type}:${payload.text || ''}:${payload.imageUri || ''}`;
    const now = Date.now();
    if (
      lastProcessedPayloadRef.current &&
      lastProcessedPayloadRef.current.key === key &&
      now - lastProcessedPayloadRef.current.time < 5000 // 5-second window
    ) {
      return true;
    }
    return false;
  };

  const processIncomingUrl = (url: string) => {
    // 1. Check if it's an event or deep link route
    const route = extractRouteFromUrl(url);
    if (route) {
      setPendingRoute(route);
      return;
    }

    // 2. Check if it's a shared announcement text / screenshot payload
    const payload = parseSharedPayload(url);
    if (payload && !isDuplicatePayload(payload)) {
      setPendingSharePayload(payload);
    }
  };

  // 1. Listen for both cold-start and warm-start share / deep-link intents
  useEffect(() => {
    // Cold start: check initial URL on startup
    Linking.getInitialURL()
      .then((url) => {
        if (url) {
          processIncomingUrl(url);
        }
      })
      .catch((err) => {
        console.warn('Error reading initial URL:', err);
      });

    // Warm start: listen for runtime / background share events
    const subscription = Linking.addEventListener('url', (event) => {
      if (event.url) {
        processIncomingUrl(event.url);
      }
    });

    return () => subscription.remove();
  }, []);

  // 2. Setup Android notification channel & listen for notification taps (cold & warm start)
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

    if (Platform.OS !== 'web') {
      // Cold-start notification check (user tapped notification when app was closed/killed)
      Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (response) {
            handleNotificationResponse(response);
          }
        })
        .catch((err) => {
          console.warn('Error reading last notification response:', err);
        });

      // Warm-start notification listener (user tapped notification while app is running/background)
      const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
        handleNotificationResponse(response);
      });

      return () => responseSub.remove();
    }
  }, []);

  // Sync push notification registration whenever user is logged in
  useEffect(() => {
    if (user?.uid && Platform.OS !== 'web') {
      registerForPushNotificationsAsync(user.uid, user.college || 'SIES_GST').catch(() => {});
    }
  }, [user?.uid]);

  // 3. Process pending notification / deep-link route or share payload once auth is ready
  useEffect(() => {
    if (isLoading) return;

    // Priority 1: User tapped a notification or deep link to open a specific event
    if (pendingRoute) {
      if (user) {
        const routeToNavigate = pendingRoute;
        setPendingRoute(null);
        lastNavigatedRouteRef.current = { route: routeToNavigate, time: Date.now() };
        router.push(routeToNavigate as any);
        return;
      } else {
        // User not logged in yet — route to login, but keep pendingRoute held until login succeeds
        applyRouteGuard();
        return;
      }
    }

    // Priority 2: User shared text/screenshot from external app
    if (pendingSharePayload) {
      if (user) {
        const payloadToProcess = pendingSharePayload;
        setPendingSharePayload(null);
        lastProcessedPayloadRef.current = {
          key: `${payloadToProcess.type}:${payloadToProcess.text || ''}:${payloadToProcess.imageUri || ''}`,
          time: Date.now(),
        };

        const params: Record<string, string> = { autoExtract: 'true' };
        if (payloadToProcess.text) {
          params.text = payloadToProcess.text;
        }
        if (payloadToProcess.imageUri) {
          params.imageUri = payloadToProcess.imageUri;
        }

        router.push({
          pathname: '/(auth)/extract',
          params,
        });
        return;
      } else {
        applyRouteGuard();
        return;
      }
    }

    applyRouteGuard();
  }, [user, isLoading, pendingRoute, pendingSharePayload, segments]);

  const applyRouteGuard = () => {
    const inAuthGroup = segments[0] === '(auth)';
    if (!user && inAuthGroup) {
      router.replace('/(public)/login');
    } else if (user && !inAuthGroup) {
      // Prevent overriding a notification / deep-link navigation in flight
      if (lastNavigatedRouteRef.current && Date.now() - lastNavigatedRouteRef.current.time < 2500) {
        return;
      }
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

  // Check if user has answered the college prompt — once per UID
  useEffect(() => {
    if (!user || isLoading || showOnboarding) return;

    if (user.collegeSelected) {
      setShowCollegePrompt(false);
      return;
    }

    const key = `${COLLEGE_PROMPT_KEY_PREFIX}${user.uid}`;
    AsyncStorage.getItem(key)
      .then((val) => {
        if (!val) {
          setShowCollegePrompt(true);
        }
      })
      .catch(() => {});
  }, [user, isLoading, showOnboarding, user?.collegeSelected]);

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
      <CampusAffiliationModal
        visible={showCollegePrompt}
        onClose={() => setShowCollegePrompt(false)}
        currentCollege={user?.college}
      />
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
