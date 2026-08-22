import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Slot } from 'expo-router';
import { AuthProvider } from '../src/context/AuthContext';
import { EventsProvider } from '../src/context/EventsContext';

import { useRouter, useSegments } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useEffect } from 'react';

import * as Linking from 'expo-linking';

function InitialLayout() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Listen for incoming deep links or shared text from WhatsApp
  useEffect(() => {
    const handleUrl = (event: { url: string }) => {
      const parsed = Linking.parse(event.url);
      if (parsed.queryParams?.text || parsed.queryParams?.shared_text) {
        const sharedText = (parsed.queryParams.text || parsed.queryParams.shared_text) as string;
        router.push({
          pathname: '/(auth)/extract',
          params: { text: sharedText, autoExtract: 'true' },
        });
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    const subscription = Linking.addEventListener('url', handleUrl);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === '(auth)';
    
    if (!user && inAuthGroup) {
      // Redirect to login if user is not authenticated and trying to access (auth) group
      router.replace('/(public)/login');
    } else if (user && !inAuthGroup) {
      // Redirect to dashboard if user is authenticated and not in (auth) group
      router.replace('/(auth)');
    } else if (!user && !segments.length) {
      // If at absolute root and not logged in, go to login
      router.replace('/(public)/login');
    }
  }, [user, isLoading, segments]);

  return <Slot />;
}

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
