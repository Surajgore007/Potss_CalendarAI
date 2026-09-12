import { Platform } from 'react-native';

type NetworkCallback = (isOnline: boolean) => void;

let netInfoModule: typeof import('@react-native-community/netinfo') | null = null;

function getNetInfo() {
  if (Platform.OS === 'web') return null;
  if (!netInfoModule) {
    try {
      netInfoModule = require('@react-native-community/netinfo');
    } catch {
      netInfoModule = null;
    }
  }
  return netInfoModule;
}

/**
 * Check whether the device currently has an active, working internet connection.
 */
export async function isOnline(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  try {
    const netInfo = getNetInfo();
    if (!netInfo) return true;

    const state = await netInfo.fetch();
    // isConnected must be true, and isInternetReachable must not be explicitly false
    const connected = !!state.isConnected && state.isInternetReachable !== false;
    return connected;
  } catch {
    // If NetInfo check fails, assume true to avoid locking out the user
    return true;
  }
}

/**
 * Subscribe to network connectivity changes.
 * Calls callback immediately with current status and then on any transition.
 */
export function subscribeToNetworkStatus(callback: NetworkCallback): () => void {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return () => {};

    const handleOnline = () => callback(true);
    const handleOffline = () => callback(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    callback(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }

  try {
    const netInfo = getNetInfo();
    if (!netInfo) {
      callback(true);
      return () => {};
    }

    const unsubscribe = netInfo.addEventListener((state) => {
      const connected = !!state.isConnected && state.isInternetReachable !== false;
      callback(connected);
    });

    return () => {
      unsubscribe();
    };
  } catch {
    callback(true);
    return () => {};
  }
}
