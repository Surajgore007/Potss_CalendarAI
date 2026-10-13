import { Platform } from 'react-native';
import Constants from 'expo-constants';

export interface TelemetryPayload {
  message: string;
  stack?: string;
  componentStack?: string;
  isFatal?: boolean;
  context?: string;
}

/**
 * Asynchronously report crash or unhandled exception to Cloudflare Worker telemetry endpoint.
 * 100% free, zero external third-party SDK dependencies, with rate-limiting at the edge.
 */
export function reportErrorTelemetry(payload: TelemetryPayload): void {
  try {
    const workerUrl =
      process.env.EXPO_PUBLIC_WORKER_URL ||
      process.env.EXPO_PUBLIC_API_URL ||
      'https://vanko-api.vanko-app.workers.dev';

    fetch(`${workerUrl.replace(/\/$/, '')}/api/telemetry/error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: payload.message || 'Unknown error',
        stack: payload.stack?.slice(0, 1500) || '',
        componentStack: payload.componentStack?.slice(0, 1500) || '',
        isFatal: !!payload.isFatal,
        context: payload.context || 'global',
        platform: Platform.OS,
        version: Constants.expoConfig?.version ?? '1.0.2',
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});
  } catch {
    // Fail silently — never throw during error reporting
  }
}

/**
 * Initialize global React Native uncaught exception listener on device startup.
 * Catches unhandled asynchronous exceptions across background threads and promise chains.
 */
export function initGlobalErrorTracking(): void {
  if (Platform.OS === 'web') return;

  const globalScope = global as any;
  if (globalScope?.ErrorUtils?.setGlobalHandler) {
    const defaultHandler = globalScope.ErrorUtils.getGlobalHandler?.() || null;

    globalScope.ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
      reportErrorTelemetry({
        message: error?.message || String(error),
        stack: error?.stack || '',
        isFatal: !!isFatal,
        context: 'unhandled_js_exception',
      });

      if (defaultHandler) {
        defaultHandler(error, isFatal);
      }
    });
  }
}
