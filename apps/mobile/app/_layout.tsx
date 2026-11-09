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
import { handleNotificationPresentation } from '../src/services/notificationService';

// Initialize global crash & error telemetry immediately
initGlobalErrorTracking();

// Initialize notification behavior immediately on module load with multi-tenancy account guard
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: handleNotificationPresentation,
  });
}

const ONBOARDING_KEY_PREFIX = '@vanko_onboarding_done_';
const COLLEGE_PROMPT_KEY_PREFIX = '@vanko_college_prompt_answered_';
const LAST_PROCESSED_SHARE_ID_KEY = '@vanko_last_processed_share_id';
const LAST_PROCESSED_SHARE_KEY_STORE = '@vanko_last_processed_share_key';

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
    shareId?: string;
  };
  const [pendingSharePayload, setPendingSharePayload] = useState<SharePayload | null>(null);
  const lastProcessedPayloadRef = React.useRef<{ key: string; time: number } | null>(null);
  const lastProcessedShareIdRef = React.useRef<string | null>(null);
  const lastProcessedPayloadKeyRef = React.useRef<string | null>(null);

  // Hydrate processed share markers to prevent Android stale intent replays on app reopen
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(LAST_PROCESSED_SHARE_ID_KEY),
      AsyncStorage.getItem(LAST_PROCESSED_SHARE_KEY_STORE),
    ])
      .then(([savedShareId, savedKey]) => {
        if (savedShareId) lastProcessedShareIdRef.current = savedShareId;
        if (savedKey) lastProcessedPayloadKeyRef.current = savedKey;
      })
      .catch(() => {});
  }, []);

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
      const rawShareId = (parsed.queryParams?.shareId || parsed.queryParams?.share_id) as string;

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

      let cleanShareId: string | undefined = undefined;
      if (rawShareId && typeof rawShareId === 'string' && rawShareId.trim().length > 0) {
        cleanShareId = rawShareId.trim();
      }

      if (cleanText && cleanImageUri) {
        return { type: 'both', text: cleanText, imageUri: cleanImageUri, shareId: cleanShareId };
      }
      if (cleanText) {
        return { type: 'text', text: cleanText, shareId: cleanShareId };
      }
      if (cleanImageUri) {
        return { type: 'image', imageUri: cleanImageUri, shareId: cleanShareId };
      }
    } catch (e) {
      console.warn('Error parsing incoming share URL:', e);
    }
    return null;
  };

  const isDuplicatePayload = (payload: SharePayload): boolean => {
    // 1. If explicit shareId is present and already processed, ignore Android intent replay
    if (payload.shareId && lastProcessedShareIdRef.current === payload.shareId) {
      return true;
    }

    // 2. If content key was already processed and consumed, ignore replay on app reopen
    const key = `${payload.type}:${payload.text || ''}:${payload.imageUri || ''}`;
    if (lastProcessedPayloadKeyRef.current === key) {
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
        const payloadKey = `${payloadToProcess.type}:${payloadToProcess.text || ''}:${payloadToProcess.imageUri || ''}`;
        lastProcessedPayloadKeyRef.current = payloadKey;
        AsyncStorage.setItem(LAST_PROCESSED_SHARE_KEY_STORE, payloadKey).catch(() => {});

        if (payloadToProcess.shareId) {
          lastProcessedShareIdRef.current = payloadToProcess.shareId;
          AsyncStorage.setItem(LAST_PROCESSED_SHARE_ID_KEY, payloadToProcess.shareId).catch(() => {});
        }

        lastProcessedPayloadRef.current = {
          key: payloadKey,
          time: Date.now(),
        };

        const params: Record<string, string> = { autoExtract: 'true' };
        if (payloadToProcess.text) {
          params.text = payloadToProcess.text;
        }
        if (payloadToProcess.imageUri) {
          params.imageUri = payloadToProcess.imageUri;
        }
        if (payloadToProcess.shareId) {
          params.shareId = payloadToProcess.shareId;
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
