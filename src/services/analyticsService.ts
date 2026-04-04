/**
 * Analytics Service — Lightweight event tracking for production insights.
 *
 * Uses AsyncStorage-based local analytics with optional future integration
 * points for Firebase Analytics, Mixpanel, etc.
 *
 * Tracks: screen views, feature usage, errors, performance metrics.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import createLogger from '../utils/logger';
import { safeJsonParse } from '../utils/safeUtils';

const log = createLogger('Analytics');

const ANALYTICS_KEY = '@attend_me/analytics_events';
const MAX_LOCAL_EVENTS = 500; // Cap to prevent storage bloat

export type AnalyticsEvent = {
  name: string;
  params?: Record<string, string | number | boolean>;
  timestamp: string;
  screen?: string;
};

// Current screen tracker
let currentScreen = 'Unknown';

/**
 * Track a screen view. Call from navigation state change listener.
 */
export function trackScreen(screenName: string): void {
  currentScreen = screenName;
  trackEvent('screen_view', { screen_name: screenName });
}

/**
 * Track a custom event (e.g., 'attendance_submitted', 'swap_requested').
 */
export async function trackEvent(
  name: string,
  params?: Record<string, string | number | boolean>
): Promise<void> {
  try {
    const event: AnalyticsEvent = {
      name,
      params,
      timestamp: new Date().toISOString(),
      screen: currentScreen,
    };

    // Store locally
    const raw = await AsyncStorage.getItem(ANALYTICS_KEY);
    const events: AnalyticsEvent[] = raw ? safeJsonParse<AnalyticsEvent[]>(raw, []) : [];

    events.push(event);

    // Cap at MAX_LOCAL_EVENTS (FIFO)
    if (events.length > MAX_LOCAL_EVENTS) {
      events.splice(0, events.length - MAX_LOCAL_EVENTS);
    }

    await AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify(events));

    if (__DEV__) {
      log.info(`[${name}]`, params || '');
    }

    // ─── FUTURE: Send to Firebase/Mixpanel ───
    // import analytics from '@react-native-firebase/analytics';
    // await analytics().logEvent(name, params);
  } catch (error) {
    // Analytics must NEVER crash the app
    if (__DEV__) {
      console.warn('[Analytics] Failed to track event:', error);
    }
  }
}

/**
 * Track an error event for crash/error analytics.
 */
export function trackError(error: Error | string, context?: string): void {
  const message = typeof error === 'string' ? error : error.message;
  trackEvent('app_error', {
    error_message: message.slice(0, 200),
    context: context || currentScreen,
  });
}

/**
 * Track a timing event (e.g., how long a screen takes to load).
 */
export function trackTiming(name: string, durationMs: number): void {
  trackEvent('performance', {
    metric_name: name,
    duration_ms: durationMs,
  });
}

/**
 * Get stored analytics events (for debug/export).
 */
export async function getStoredEvents(): Promise<AnalyticsEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(ANALYTICS_KEY);
    return raw ? safeJsonParse<AnalyticsEvent[]>(raw, []) : [];
  } catch {
    return [];
  }
}

/**
 * Clear stored analytics (after successful upload or for privacy).
 */
export async function clearStoredEvents(): Promise<void> {
  await AsyncStorage.removeItem(ANALYTICS_KEY);
}

// Pre-defined event names for consistency
export const Events = {
  // Attendance
  ATTENDANCE_STARTED: 'attendance_started',
  ATTENDANCE_SUBMITTED: 'attendance_submitted',
  ATTENDANCE_EDIT: 'attendance_edit',

  // Scanning
  BLE_SCAN_STARTED: 'ble_scan_started',
  BLE_SCAN_COMPLETED: 'ble_scan_completed',
  MANUAL_MODE_USED: 'manual_mode_used',

  // Swap/Sub
  SWAP_REQUESTED: 'swap_requested',
  SUB_REQUESTED: 'sub_requested',
  REQUEST_ACCEPTED: 'request_accepted',
  REQUEST_REJECTED: 'request_rejected',

  // Offline
  OFFLINE_SUBMIT: 'offline_submit',
  SYNC_COMPLETED: 'sync_completed',
  SYNC_FAILED: 'sync_failed',

  // Navigation
  TAB_SWITCH: 'tab_switch',

  // Profile
  PROFILE_EDITED: 'profile_edited',
  LEAVE_APPLIED: 'leave_applied',
  QR_VIEWED: 'qr_viewed',
} as const;
