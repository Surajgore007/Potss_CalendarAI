import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveUserPushToken } from '@eventpulse/shared';

const PUSH_TOKEN_STORAGE_KEY = '@vanko_cached_push_token';
const DEFAULT_EAS_PROJECT_ID = 'd27b40b1-ee0c-41d0-8304-03737c41cc50';

/**
 * Register device for remote push notifications:
 * 1. Configures Android Notification Channel 'sies-gst-announcements' (Android 8+)
 * 2. Prompts user for notification permission (Android 13+ runtime POST_NOTIFICATIONS)
 * 3. Retrieves Expo Push Token via EAS project ID
 * 4. Syncs token to Firestore under /users/{uid}
 */
export async function registerForPushNotificationsAsync(
  uid: string,
  college: string = 'General'
): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    // 1. Android Notification Channel setup
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('sies-gst-announcements', {
        name: 'Campus & Community Announcements',
        description: 'Instant updates for newly added campus events, deadlines, and hackathons',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4F46E5',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }

    // 2. Permission check
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Push notification permission was not granted by user.');
      return null;
    }

    // 3. Resolve Project ID and fetch Expo Push Token
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      DEFAULT_EAS_PROJECT_ID;

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const pushToken = tokenResponse.data;

    if (!pushToken) return null;

    // 4. Always sync push token directly to current user's profile in Firestore (/users/{uid})
    await saveUserPushToken(uid, pushToken, college);
    await AsyncStorage.setItem(`${PUSH_TOKEN_STORAGE_KEY}_${uid}`, pushToken);
    console.log('[Push] Registered Expo push token for UID:', uid, pushToken);

    return pushToken;
  } catch (err: any) {
    if (err?.message?.includes('Default FirebaseApp is not initialized')) {
      console.info('[Push] Native FCM push registration requires native build with google-services.json.');
    } else if (err?.message?.includes('Network request failed') || err?.name === 'TypeError') {
      console.info('[Push] Push notification registration deferred: network currently unreachable.');
    } else {
      console.warn('[Push] Could not register push token:', err?.message || err);
    }
    return null;
  }
}

/**
 * Unregister device on logout to prevent private/community alerts on shared/signed-out devices
 */
export async function unregisterPushTokenAsync(uid: string): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
    await saveUserPushToken(uid, null);
  } catch (err) {
    console.warn('Could not unregister push token:', err);
  }
}
