/**
 * Global Error Handlers — Catches unhandled JS errors and promise rejections.
 * 
 * Call setupGlobalErrorHandlers() at app startup (App.tsx).
 * Prevents silent crashes from unhandled promise rejections.
 */

import { LogBox, Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';

// Initialize Sentry with a placeholder DSN.
// The user should replace this with their actual DSN from sentry.io
Sentry.init({
  dsn: 'YOUR_SENTRY_DSN_HERE',
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

  // 2. Global unhandled promise rejection handler
  // In React Native, unhandled promise rejections can silently kill features
  // without any visible error. This catches them and logs instead of crashing.
  const originalHandler = (global as any).ErrorUtils?.getGlobalHandler?.();

  if ((global as any).ErrorUtils) {
    (global as any).ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      // Log the error
      console.error(`[GlobalErrorHandler] ${isFatal ? 'FATAL' : 'NON-FATAL'}:`, error?.message || error);
      
      // Capture the exact stack trace in the cloud
      Sentry.captureException(error);

      // For non-fatal errors, swallow them to prevent crash
      // For fatal errors, delegate to the original handler (which shows the red screen in dev)
      if (isFatal && originalHandler) {
        originalHandler(error, isFatal);
      }
    });
  }

  // 3. Catch unhandled promise rejections
  // @ts-ignore — React Native's global tracking
  if (typeof global !== 'undefined') {
    const rejectionTracking = require('promise/setimmediate/rejection-tracking');
    rejectionTracking.disable();
    rejectionTracking.enable({
      allRejections: true,
      onUnhandled: (id: number, error: any) => {
        console.warn('[UnhandledPromise]', error?.message || error);
        Sentry.captureException(error);
        // Don't crash — just log it
      },
      onHandled: () => {},
    });
  }
}
