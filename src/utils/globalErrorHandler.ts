/**
 * Global Error Handlers — Catches unhandled JS errors and promise rejections.
 * 
 * Call setupGlobalErrorHandlers() at app startup (App.tsx).
 * 
 * PRODUCTION CRASH PREVENTION:
 * - Fatal JS errors are swallowed in production (logged to Sentry) to prevent full-app crashes.
 * - In __DEV__, fatal errors still show the Red Screen for debugging.
 * - Unhandled promise rejections are always swallowed (logged, never crash).
 */

import { LogBox, Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';

// Initialize Sentry with the actual DSN from the environment
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
  tracesSampleRate: 1.0, // Capture 100% of transactions for performance monitoring
});

let isSetup = false;

export function setupGlobalErrorHandlers(): void {
  if (isSetup) return;
  isSetup = true;

  // 1. Suppress noisy non-critical warnings in dev (won't affect production)
  if (__DEV__) {
    LogBox.ignoreLogs([
      'Non-serializable values were found in the navigation state',
      'Setting a timer for a long period of time',
      'VirtualizedLists should never be nested',
      'EventEmitter.removeListener',
    ]);
  }

  // 2. Global unhandled error handler — THE KEY CRASH PREVENTION LAYER
  // In React Native, unhandled JS errors (even in event handlers, async callbacks,
  // setTimeout, setInterval, etc.) bubble up to ErrorUtils. By default, fatal
  // errors crash the app. We swallow them in production.
  const originalHandler = (global as any).ErrorUtils?.getGlobalHandler?.();

  if ((global as any).ErrorUtils) {
    (global as any).ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      // Safety: error itself could be undefined/null in edge cases
      const safeError = error || new Error('Unknown error (null error object)');

      // Log the error
      console.error(`[GlobalErrorHandler] ${isFatal ? 'FATAL' : 'NON-FATAL'}:`, safeError?.message || safeError);
      
      // Capture the exact stack trace in the cloud
      try {
        Sentry.captureException(safeError, {
          tags: { fatal: String(!!isFatal), environment: __DEV__ ? 'dev' : 'production' },
        });
      } catch {
        // Sentry itself failed — swallow
      }

      if (__DEV__) {
        // In development, show the Red Screen for fatal errors so devs can debug
        if (isFatal && originalHandler) {
          originalHandler(error, isFatal);
        }
      }
      // In PRODUCTION: swallow ALL errors (both fatal and non-fatal)
      // React ErrorBoundary will catch render errors and show recovery UI.
      // Non-render errors (event handlers, async) just get logged to Sentry.
      // This prevents the "app stopped working" dialog on Android.
    });
  }

  // 3. Catch unhandled promise rejections
  // @ts-ignore — React Native's global tracking
  if (typeof global !== 'undefined') {
    try {
      const rejectionTracking = require('promise/setimmediate/rejection-tracking');
      rejectionTracking.disable();
      rejectionTracking.enable({
        allRejections: true,
        onUnhandled: (id: number, error: any) => {
          console.warn('[UnhandledPromise]', error?.message || error);
          try {
            Sentry.captureException(error, {
              tags: { type: 'unhandled_promise' },
            });
          } catch {
            // Sentry failed — swallow
          }
          // Don't crash — just log it
        },
        onHandled: () => {},
      });
    } catch {
     
    }
  }
}
