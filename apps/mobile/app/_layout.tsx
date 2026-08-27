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
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { OnboardingModal } from '../src/components/OnboardingModal';

const ONBOARDING_KEY_PREFIX = '@vanko_onboarding_done_';

function InitialLayout() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checkedUid, setCheckedUid] = useState<string | null>(null);
  const initialUrlHandledRef = React.useRef(false);

  const handleDeepLinkUrl = (rawUrl: string) => {
    try {
      const parsed = Linking.parse(rawUrl);
      const sharedText = (parsed.queryParams?.text || parsed.queryParams?.shared_text) as string;
      if (sharedText && sharedText.trim().length > 0) {
        router.push({
          pathname: '/(auth)/extract',
          params: { text: sharedText, autoExtract: 'true' },
        });
        return true;
      }
    } catch (e) {
      console.warn('Error handling incoming share URL:', e);
    }
    return false;
  };

  // 1. Listen for background / runtime deep links
  useEffect(() => {
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLinkUrl(event.url);
    });
    return () => subscription.remove();
  }, []);

  // 2. Handle cold-start initial URL once auth hydration completes
  useEffect(() => {
    if (isLoading) return;

    if (!initialUrlHandledRef.current) {
      initialUrlHandledRef.current = true;
      Linking.getInitialURL().then((url) => {
        if (url) {
          const handled = handleDeepLinkUrl(url);
          if (handled) return;
        }
        applyRouteGuard();
      }).catch(() => {
        applyRouteGuard();
      });
    } else {
      applyRouteGuard();
    }
  }, [user, isLoading, segments]);

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
      <AuthProvider>
        <EventsProvider>
          <StatusBar style="light" />
          <InitialLayout />
        </EventsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
