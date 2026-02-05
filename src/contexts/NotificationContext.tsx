/**
 * NotificationContext - Manages notification state and push token lifecycle
 * 
 * Responsibilities:
 * - Initialize NotificationService on app start
 * - Register/unregister push tokens on login/logout
 * - Track unread notification count
 * - Handle notification responses (deep linking, actions)
 * - Subscribe to realtime notification updates
 */

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { supabase } from '../config/supabase';
import { useAuth } from './AuthContext';
import { NotificationService, PushTokenData } from '../services/NotificationService';
import { navigate, navigateNested } from '../navigation/navigationRef';

// ============================================================================
// TYPES
// ============================================================================

interface NotificationContextData {
  // State
  unreadCount: number;
  pushToken: PushTokenData | null;
  isInitialized: boolean;

  // Actions
  refreshNotifications: () => Promise<void>;
  respondToSubstituteRequest: (
    requestId: string,
    action: 'accept' | 'decline'
  ) => Promise<{ success: boolean; message: string; type: 'success' | 'error' | 'warning' | 'info' }>;
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

// ============================================================================
// CONTEXT
// ============================================================================

const NotificationContext = createContext<NotificationContextData>({} as NotificationContextData);

// ============================================================================
// PROVIDER
// ============================================================================

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  
  // State
  const [unreadCount, setUnreadCount] = useState(0);
  const [pushToken, setPushToken] = useState<PushTokenData | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Refs for listeners
  const notificationListenerRef = useRef<Notifications.Subscription | null>(null);
  const responseListenerRef = useRef<Notifications.Subscription | null>(null);
  const realtimeChannelRef = useRef<any>(null);

  // --------------------------------------------------------------------------
  // INITIALIZATION
  // --------------------------------------------------------------------------

  useEffect(() => {
    const initializeNotifications = async () => {
      // Initialize NotificationService (channels, categories)
      await NotificationService.init();
      setIsInitialized(true);
    };

    initializeNotifications();
  }, []);

  // --------------------------------------------------------------------------
  // USER SESSION HANDLING
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!user || !isInitialized) return;

    // Register for push notifications
    registerPushToken();
    
    // Fetch initial unread count
    fetchUnreadCount();
    
    // Setup listeners
    setupNotificationListeners();
    
    // Setup realtime subscription
    setupRealtimeSubscription();
    
    // Weekly cleanup
    NotificationService.cleanupOldNotifications();

    return () => {
      // Cleanup listeners
      notificationListenerRef.current?.remove();
      responseListenerRef.current?.remove();
      
      // Cleanup realtime channel
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
    };
  }, [user, isInitialized]);

  // --------------------------------------------------------------------------
  // PUSH TOKEN REGISTRATION
  // --------------------------------------------------------------------------

  const registerPushToken = async () => {
    if (!user) return;

    const tokenData = await NotificationService.registerForPushNotifications();
    
    if (tokenData) {
      setPushToken(tokenData);
      await NotificationService.saveTokenToDatabase(user.id, tokenData);
    }
  };

  // --------------------------------------------------------------------------
  // NOTIFICATION LISTENERS
  // --------------------------------------------------------------------------

  const setupNotificationListeners = () => {
    // Foreground notification received
    notificationListenerRef.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('[NotificationContext] Foreground notification:', notification.request.content.title);
        setUnreadCount((prev) => prev + 1);
      }
    );

    // User interacted with notification (tap or action button)
    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        await handleNotificationResponse(response);
      }
    );
  };

  // --------------------------------------------------------------------------
  // NOTIFICATION RESPONSE HANDLING
  // --------------------------------------------------------------------------

  const handleNotificationResponse = async (response: Notifications.NotificationResponse) => {
    const actionId = response.actionIdentifier;
    const data = response.notification.request.content.data as Record<string, any>;

    console.log('[NotificationContext] Response:', { actionId, data });

    // Handle interactive button actions
    switch (actionId) {
      case 'ACCEPT':
        if (data.requestId) {
          await respondToSubstituteRequest(data.requestId, 'accept');
        }
        break;

      case 'DECLINE':
        if (data.requestId) {
          await respondToSubstituteRequest(data.requestId, 'decline');
        }
        break;

      case 'SNOOZE':
        // Re-schedule reminder for 5 minutes
        await NotificationService.scheduleNotification({
          title: response.notification.request.content.title || 'Reminder',
          body: response.notification.request.content.body || '',
          triggerDate: new Date(Date.now() + 5 * 60 * 1000),
          data,
        });
        break;

      case 'OPEN':
      case Notifications.DEFAULT_ACTION_IDENTIFIER:
        // Navigate based on notification type
        handleDeepLink(data);
        break;
    }
  };

  // --------------------------------------------------------------------------
  // DEEP LINKING
  // --------------------------------------------------------------------------

  const handleDeepLink = (data: Record<string, any>) => {
    const type = data.type;

    switch (type) {
      case 'SUB_REQUEST':
      case 'SWAP_REQUEST':
        navigate('Notifications');
        break;

      case 'CLASS_REMINDER':
        navigateNested('MainTabs', 'Home');
        break;

      case 'ATTENDANCE_ALERT':
        navigate('MyClassHub');
        break;

      default:
        // Default: open notifications screen
        navigate('Notifications');
    }
  };

  // --------------------------------------------------------------------------
  // REALTIME SUBSCRIPTION
  // --------------------------------------------------------------------------

  const setupRealtimeSubscription = () => {
    if (!user) return;

    realtimeChannelRef.current = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[NotificationContext] New notification:', payload.new);
          setUnreadCount((prev) => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Refresh count when notifications are updated (marked as read)
          fetchUnreadCount();
        }
      )
      .subscribe();
  };

  // --------------------------------------------------------------------------
  // UNREAD COUNT
  // --------------------------------------------------------------------------

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;

    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (!error && count !== null) {
      setUnreadCount(count);
      NotificationService.setBadgeCount(count);
    }
  }, [user]);

  // --------------------------------------------------------------------------
  // MARK AS READ
  // --------------------------------------------------------------------------

  const markNotificationAsRead = async (notificationId: string) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllAsRead = async () => {
    if (!user) return;

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    setUnreadCount(0);
    NotificationService.clearBadge();
  };

  // --------------------------------------------------------------------------
  // SUBSTITUTE REQUEST RESPONSE
  // --------------------------------------------------------------------------

  const respondToSubstituteRequest = async (
    requestId: string,
    action: 'accept' | 'decline'
  ): Promise<{ success: boolean; message: string; type: 'success' | 'error' | 'warning' | 'info' }> => {
    if (!user) return { success: false, message: 'Not authenticated', type: 'error' };

    try {
      // 1. Fetch request details
      const { data: request, error: fetchError } = await supabase
        .from('substitutions')
        .select('status, original_faculty_id, slot_id')
        .eq('id', requestId)
        .single();

      if (fetchError || !request) {
        return { success: false, message: 'Request not found', type: 'error' };
      }

      // 2. Get sender's push token
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('push_token')
        .eq('id', request.original_faculty_id)
        .single();

      // 3. Get current user's name
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();
      const myName = profile?.full_name || 'A faculty';

      const slotLabel = request.slot_id?.split('_')[1] || 'class';

      if (action === 'accept') {
        // Check if already taken
        if (request.status === 'accepted') {
          return { success: false, message: 'Too late! Someone else took this class.', type: 'warning' };
        }
        if (request.status !== 'pending') {
          return { success: false, message: `Request is ${request.status}`, type: 'warning' };
        }

        // Update request
        const { error: updateError } = await supabase
          .from('substitutions')
          .update({
            status: 'accepted',
            substitute_faculty_id: user.id,
            accepted_at: new Date().toISOString(),
          })
          .eq('id', requestId)
          .eq('status', 'pending');

        if (updateError) throw updateError;

        // Create in-app notification for sender
        await supabase.from('notifications').insert({
          user_id: request.original_faculty_id,
          type: 'info',
          title: 'Request Accepted ✅',
          body: `${myName} accepted your request for ${slotLabel}.`,
          is_read: false,
        });

        // Send push notification
        if (senderProfile?.push_token) {
          await NotificationService.sendPushNotification(
            senderProfile.push_token,
            'Request Accepted ✅',
            `${myName} accepted your request for ${slotLabel}.`,
            { type: 'SUB_RESPONSE', requestId }
          );
        }

        await fetchUnreadCount();
        return { success: true, message: 'You have accepted the class!', type: 'success' };
      } else {
        // Decline
        const { error: declineError } = await supabase
          .from('substitutions')
          .update({ status: 'declined' })
          .eq('id', requestId);

        if (declineError) throw declineError;

        // Create in-app notification for sender
        await supabase.from('notifications').insert({
          user_id: request.original_faculty_id,
          type: 'info',
          title: 'Request Declined',
          body: `${myName} declined your request for ${slotLabel}.`,
          is_read: false,
        });

        // Send push notification
        if (senderProfile?.push_token) {
          await NotificationService.sendPushNotification(
            senderProfile.push_token,
            'Request Declined',
            `${myName} declined your request for ${slotLabel}.`,
            { type: 'SUB_RESPONSE', requestId }
          );
        }

        await fetchUnreadCount();
        return { success: true, message: 'Request declined', type: 'info' };
      }
    } catch (error: any) {
      console.error('[NotificationContext] Error responding to request:', error);
      return { success: false, message: error.message || 'An error occurred', type: 'error' };
    }
  };

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <NotificationContext.Provider
      value={{
        unreadCount,
        pushToken,
        isInitialized,
        refreshNotifications: fetchUnreadCount,
        respondToSubstituteRequest,
        markNotificationAsRead,
        markAllAsRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

// ============================================================================
// HOOK
// ============================================================================

export const useNotifications = () => useContext(NotificationContext);
