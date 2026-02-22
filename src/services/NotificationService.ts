/**
 * NotificationService - Production-grade Push Notification System
 * 
 * Architecture:
 * - Uses native FCM tokens (not Expo Push tokens) for free unlimited pushes
 * - Supabase Edge Function sends FCM pushes on backend
 * - Local notifications for reminders and scheduled alerts
 * - Multiple Android channels for different notification types
 * 
 * @author Senior Dev Implementation
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../config/supabase';
import createLogger from '../utils/logger';

const log = createLogger('NotificationService');

// ============================================================================
// TYPES
// ============================================================================

export interface PushTokenData {
  type: 'fcm' | 'apns' | 'expo';
  token: string;
}

export interface LocalNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  channelId?: string;
  categoryId?: string;
}

export interface ScheduledNotificationPayload extends LocalNotificationPayload {
  triggerDate: Date;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Configure foreground notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Android Notification Channels
const CHANNELS = {
  DEFAULT: {
    id: 'default',
    name: 'General',
    description: 'General notifications',
    importance: Notifications.AndroidImportance.DEFAULT,
  },
  REQUESTS: {
    id: 'requests',
    name: 'Requests',
    description: 'Substitution and swap requests',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  },
  REMINDERS: {
    id: 'reminders',
    name: 'Reminders',
    description: 'Class and event reminders',
    importance: Notifications.AndroidImportance.HIGH,
  },
  ALERTS: {
    id: 'alerts',
    name: 'Alerts',
    description: 'Important alerts and warnings',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 500, 250, 500],
    lightColor: '#FF0000',
  },
};

// ============================================================================
// NOTIFICATION SERVICE
// ============================================================================

export const NotificationService = {
  // --------------------------------------------------------------------------
  // INITIALIZATION
  // --------------------------------------------------------------------------
  
  /**
   * Initialize the notification system
   * Call this once when the app starts (in NotificationContext)
   */
  async init(): Promise<void> {
    log.info('Initializing...');
    
    // Setup Android channels
    if (Platform.OS === 'android') {
      await this.setupAndroidChannels();
    }
    
    // Setup interactive notification categories
    await this.setupNotificationCategories();
    
    log.info('Initialized successfully');
  },

  /**
   * Setup Android notification channels
   * Different channels for different notification priorities
   */
  async setupAndroidChannels(): Promise<void> {
    for (const channel of Object.values(CHANNELS)) {
      await Notifications.setNotificationChannelAsync(channel.id, {
        name: channel.name,
        description: channel.description,
        importance: channel.importance,
        sound: (channel as any).sound,
        vibrationPattern: (channel as any).vibrationPattern,
        lightColor: (channel as any).lightColor,
      });
    }
    log.info('Android channels configured');
  },

  /**
   * Setup interactive notification categories (action buttons)
   */
  async setupNotificationCategories(): Promise<void> {
    // Substitution Request Actions
    await Notifications.setNotificationCategoryAsync('SUB_REQUEST', [
      {
        identifier: 'ACCEPT',
        buttonTitle: 'Accept',
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'DECLINE',
        buttonTitle: 'Decline',
        options: { isDestructive: true, opensAppToForeground: false },
      },
    ]);

    // Swap Request Actions
    await Notifications.setNotificationCategoryAsync('SWAP_REQUEST', [
      {
        identifier: 'ACCEPT',
        buttonTitle: 'Accept',
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'DECLINE',
        buttonTitle: 'Decline',
        options: { isDestructive: true, opensAppToForeground: false },
      },
    ]);

    // Reminder Actions
    await Notifications.setNotificationCategoryAsync('REMINDER', [
      {
        identifier: 'SNOOZE',
        buttonTitle: 'Snooze 5 min',
        options: { opensAppToForeground: false },
      },
      {
        identifier: 'OPEN',
        buttonTitle: 'Open App',
        options: { opensAppToForeground: true },
      },
    ]);
  },

  // --------------------------------------------------------------------------
  // PUSH TOKEN REGISTRATION (FCM)
  // --------------------------------------------------------------------------

  /**
   * Register for push notifications and get FCM token
   * Returns the native FCM token (not Expo push token)
   */
  async registerForPushNotifications(): Promise<PushTokenData | null> {
    try {
      // 1. Check/Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        log.warn('Permission denied');
        return null;
      }

      // 2. Get NATIVE device token (FCM on Android, APNs on iOS)
      // This is the key difference - we use getDevicePushTokenAsync, not getExpoPushTokenAsync
      const tokenData = await Notifications.getDevicePushTokenAsync();
      
      log.info('Token obtained:', {
        type: tokenData.type,
        token: tokenData.data.substring(0, 15) + '...'
      });

      return {
        type: tokenData.type as 'fcm' | 'apns',
        token: tokenData.data,
      };
    } catch (error: any) {
      log.error('Token registration failed:', error.message);
      return null;
    }
  },

  /**
   * Save push token to Supabase
   */
  async saveTokenToDatabase(userId: string, tokenData: PushTokenData): Promise<boolean> {
    if (!userId || !tokenData) return false;
    
    const { error } = await supabase
      .from('profiles')
      .update({ 
        push_token: tokenData.token,
        push_token_type: tokenData.type, // Store token type for backend to know how to send
        push_token_updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      log.error('Failed to save token:', error.message);
      return false;
    }
    
    log.info('Token saved to database');
    return true;
  },

  /**
   * Clear push token from database (on logout)
   */
  async clearTokenFromDatabase(userId: string): Promise<void> {
    if (!userId) return;
    
    await supabase
      .from('profiles')
      .update({ 
        push_token: null,
        push_token_type: null,
      })
      .eq('id', userId);
    
    log.info('Token cleared from database');
  },

  // --------------------------------------------------------------------------
  // LOCAL NOTIFICATIONS
  // --------------------------------------------------------------------------

  /**
   * Show an immediate local notification
   */
  async showLocalNotification(payload: LocalNotificationPayload): Promise<string> {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        sound: true,
        categoryIdentifier: payload.categoryId,
      },
      trigger: null, // Immediate
    });
    
    return notificationId;
  },

  /**
   * Schedule a notification for a future time
   */
  async scheduleNotification(payload: ScheduledNotificationPayload): Promise<string | null> {
    // Don't schedule if already passed
    if (payload.triggerDate.getTime() < Date.now()) {
      log.info('Skipping past notification');
      return null;
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        sound: true,
        categoryIdentifier: payload.categoryId,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: payload.triggerDate,
        channelId: payload.channelId || CHANNELS.REMINDERS.id,
      },
    });

    return notificationId;
  },

  /**
   * Schedule a class reminder (10 minutes before)
   */
  async scheduleClassReminder(
    subjectName: string,
    classDetails: string,
    startTime: Date
  ): Promise<string | null> {
    const triggerDate = new Date(startTime);
    triggerDate.setMinutes(triggerDate.getMinutes() - 10);

    // If we are within the 10-minute window (trigger passed but class hasn't started)
    const now = new Date();
    if (triggerDate.getTime() < now.getTime() && startTime.getTime() > now.getTime()) {
      const minutesLeft = Math.ceil((startTime.getTime() - now.getTime()) / 60000);
      return this.showLocalNotification({
        title: `📚 Upcoming: ${subjectName}`,
        body: `${classDetails} starts in ${minutesLeft} min`,
        data: { type: 'CLASS_REMINDER' },
        categoryId: 'REMINDER',
      });
    }

    log.info(`Scheduling class reminder for ${subjectName} at ${triggerDate.toLocaleTimeString()}`);
    return this.scheduleNotification({
      title: `📚 Upcoming: ${subjectName}`,
      body: `${classDetails} starts in 10 minutes`,
      triggerDate,
      data: { type: 'CLASS_REMINDER', subjectName },
      channelId: CHANNELS.REMINDERS.id,
      categoryId: 'REMINDER',
    });
  },

  /**
   * Schedule an event reminder (morning of the event)
   */
  async scheduleEventReminder(
    title: string,
    description: string | null,
    date: string
  ): Promise<string | null> {
    const triggerDate = new Date(date);
    triggerDate.setHours(8, 0, 0, 0);

    return this.scheduleNotification({
      title: `🎓 College Event: ${title}`,
      body: description || `Today is ${title}`,
      triggerDate,
      data: { type: 'COLLEGE_EVENT' },
      channelId: CHANNELS.REMINDERS.id,
    });
  },

  // --------------------------------------------------------------------------
  // PUSH NOTIFICATION SENDING (via Supabase Edge Function)
  // --------------------------------------------------------------------------

  /**
   * Send a push notification via Supabase Edge Function
   * This calls the backend which then sends via FCM
   */
  async sendPushNotification(
    recipientToken: string,
    title: string,
    body: string,
    data?: Record<string, any>,
    categoryId?: string, // Added parameter
    imageUrl?: string // Added parameter for image
  ): Promise<boolean> {
    if (!recipientToken) {
      log.warn('No recipient token provided');
      return false;
    }

    try {
      // Call Supabase Edge Function
      const { data: response, error } = await supabase.functions.invoke('send-push', {
        body: {
          token: recipientToken,
          title,
          body,
          data: data || {},
          categoryId, // Pass to backend
          imageUrl, // Pass image URL
        },
      });

      if (error) {
        log.warn('Push failed (Backend):', error.message);
        
        // Try to extract the backend error message from the response context
        if (error.context && typeof error.context.json === 'function') {
           try {
             const errorBody = await error.context.json();
             log.warn('👇 BACKEND ERROR RESPONSE 👇');
             log.warn(JSON.stringify(errorBody, null, 2));
             if (errorBody && errorBody.error && errorBody.error.includes("secret")) {
                 log.warn("💡 HINT: Your Supabase secret might be missing or invalid.");
             }
           } catch (readError) {
             log.warn('Could not read error body:', readError);
           }
        } else {
             log.warn('Full Error Object:', JSON.stringify(error, null, 2));
        }
        
        return false;
      }

      log.info('Push sent successfully');
      return true;
    } catch (error: any) {
      log.error('Push failed:', error.message);
      return false;
    }
  },

  // --------------------------------------------------------------------------
  // UTILITY METHODS
  // --------------------------------------------------------------------------

  /**
   * Cancel all scheduled notifications
   */
  async cancelAllScheduled(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
    log.info('All scheduled notifications cancelled');
  },

  /**
   * Cancel only CLASS_REMINDER notifications, preserving event reminders etc.
   */
  async cancelClassReminders(): Promise<void> {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    let cancelled = 0;
    for (const notification of scheduled) {
      if (notification.content.data?.type === 'CLASS_REMINDER') {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
        cancelled++;
      }
    }
    log.info(`Cancelled ${cancelled} class reminders (preserved ${scheduled.length - cancelled} others)`);
  },

  /**
   * Get all scheduled notifications
   */
  async getAllScheduled(): Promise<Notifications.NotificationRequest[]> {
    return await Notifications.getAllScheduledNotificationsAsync();
  },

  /**
   * Set badge count (iOS)
   */
  async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  },

  /**
   * Clear badge (iOS)
   */
  async clearBadge(): Promise<void> {
    await Notifications.setBadgeCountAsync(0);
  },

  /**
   * Weekly cleanup of old notifications from database
   */
  async cleanupOldNotifications(): Promise<void> {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { error } = await supabase
        .from('notifications')
        .delete()
        .lt('created_at', sevenDaysAgo.toISOString());
        
      if (error) {
        log.warn('Cleanup error:', error.message);
      } else {
        log.info('Old notifications cleaned up');
      }
    } catch (e: any) {
      log.error('Cleanup exception:', e.message);
    }
  },

  // --------------------------------------------------------------------------
  // LEGACY SUPPORT (for backward compatibility)
  // --------------------------------------------------------------------------

  /**
   * @deprecated Use registerForPushNotifications instead
   */
  async registerForPushNotificationsAsync(): Promise<string | undefined> {
    const tokenData = await this.registerForPushNotifications();
    return tokenData?.token;
  },

  /**
   * @deprecated Use saveTokenToDatabase instead
   */
  async updateUserPushToken(userId: string, token: string | null): Promise<void> {
    if (token) {
      await this.saveTokenToDatabase(userId, { type: 'fcm', token });
    } else {
      await this.clearTokenFromDatabase(userId);
    }
  },

  /**
   * @deprecated Use clearTokenFromDatabase instead
   */
  async unregisterForPushNotificationsAsync(userId: string): Promise<void> {
    await this.clearTokenFromDatabase(userId);
    await this.cancelAllScheduled();
  },

  /**
   * Test notification (for debugging)
   */
  async testLocalNotification(): Promise<void> {
    await this.showLocalNotification({
      title: '✅ Test Notification',
      body: 'If you see this, notifications are working!',
      channelId: CHANNELS.DEFAULT.id,
    });
  },
};

export default NotificationService;
