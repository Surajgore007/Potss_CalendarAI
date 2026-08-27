import { LogBox } from 'react-native';

// Ignore known non-fatal advisory warnings in development & Expo Go
LogBox.ignoreLogs([
  '`expo-notifications` functionality is not fully supported in Expo Go',
  'expo-notifications: Android Push notifications',
  '@firebase/auth',
  'Firebase Auth initialization warning',
  'Firestore subscription status',
  'Firestore subscription offline/fallback',
  'Attempted to import the module',
]);

// Comprehensive WebAPI and Runtime Polyfills for React Native / Hermes
if (typeof (globalThis as any).DOMException === 'undefined') {
  class DOMExceptionPolyfill extends Error {
    readonly code: number = 0;
    constructor(message?: string, name?: string) {
      super(message);
      this.name = name || 'DOMException';
    }
  }
  (globalThis as any).DOMException = DOMExceptionPolyfill;
  if (typeof (global as any) !== 'undefined') {
    (global as any).DOMException = DOMExceptionPolyfill;
  }
}

if (typeof (globalThis as any).performance === 'undefined') {
  (globalThis as any).performance = {
    now: () => Date.now(),
  };
  if (typeof (global as any) !== 'undefined') {
    (global as any).performance = (globalThis as any).performance;
  }
}
