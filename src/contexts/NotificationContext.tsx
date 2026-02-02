import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as Notifications from 'expo-notifications';
import { supabase } from '../config/supabase';
import { useAuth } from './AuthContext';
import { NotificationService } from '../services/NotificationService';


interface NotificationContextData {
  unreadCount: number;
  expoPushToken: string | undefined;
  refreshNotifications: () => Promise<void>;
  respondToSubstituteRequest: (requestId: string, action: 'accept' | 'decline') => Promise<{ success: boolean; message: string; type: 'success' | 'error' | 'warning' | 'info' }>;
}

const NotificationContext = createContext<NotificationContextData>({} as NotificationContextData);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth(); // We need userId
  const [unreadCount, setUnreadCount] = useState(0);
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>();
  const [notificationListener, setNotificationListener] = useState<any>();
  const [responseListener, setResponseListener] = useState<any>();

  useEffect(() => {
    if (user) {
      // 1. Setup Categories
      NotificationService.setupNotificationCategories();
      registerForPushNotifications();
      fetchUnreadCount();
      
      // Listen for incoming notifications (foreground)
      const sub1 = Notifications.addNotificationReceivedListener(notification => {
        setUnreadCount(prev => prev + 1);
      });

      // Listen for interaction (user taps notification OR buttons)
      const sub2 = Notifications.addNotificationResponseReceivedListener(async response => {
        const actionId = response.actionIdentifier;
        const data = response.notification.request.content.data;
        
        // Handle Interactive Buttons
        if (actionId === 'ACCEPT' && data.requestId) {
            await respondToSubstituteRequest(data.requestId as string, 'accept');
        } else if (actionId === 'DECLINE' && data.requestId) {
            await respondToSubstituteRequest(data.requestId as string, 'decline');
        } else {
            console.log('Notification Tapped:', data);
        }
      });

      setNotificationListener(sub1);
      setResponseListener(sub2);
      
      // 3. Weekly Cleanup
      NotificationService.cleanupOldNotifications();

      // Listen for database changes (Realtime)
      const channel = supabase
        .channel('public:notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
             // Increment unread count on new notification
             setUnreadCount(prev => prev + 1);
          }
        )
        .subscribe();

      return () => {
        if(sub1) sub1.remove();
        if(sub2) sub2.remove();
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  // ... (registerForPushNotifications, fetchUnreadCount remain the same)
  const registerForPushNotifications = async () => {
    if (!user) return;
    const token = await NotificationService.registerForPushNotificationsAsync();
    if (token) {
      setExpoPushToken(token);
      await NotificationService.updateUserPushToken(user.id, token);
    }
  };

  const fetchUnreadCount = async () => {
    if (!user) return;
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    
    if (!error && count !== null) {
      setUnreadCount(count);
    }
  };

  const respondToSubstituteRequest = async (requestId: string, action: 'accept' | 'decline'): Promise<{ success: boolean; message: string; type: 'success' | 'error' | 'warning' | 'info' }> => {
      if (!user) return { success: false, message: 'Not authenticated', type: 'error' };

      try {
           // 1. Get Request Details (for Sender ID)
           const { data: request, error: fetchError } = await supabase
              .from('substitutions')
              .select('status, original_faculty_id, slot_id')
              .eq('id', requestId)
              .single();

           if (fetchError || !request) return { success: false, message: 'Request not found', type: 'error' };

           // Fetch Original Faculty Push Token
           const { data: senderProfile } = await supabase
              .from('profiles')
              .select('push_token')
              .eq('id', request!.original_faculty_id)
              .single();
           
           // Fetch Current User Name (for the reply message)
           const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
           const myName = profile?.full_name || 'A faculty';

           if (action === 'accept') {
              if (request.status === 'accepted') {
                  return { success: false, message: 'Too Slow! Someone else took this class.', type: 'warning' };
              }
              if (request.status !== 'pending') {
                   return { success: false, message: `Unavailable: Request is ${request.status}`, type: 'warning' };
              }

              // 2. Perform Handshake (Update DB)
              const { error: updateError } = await supabase
                  .from('substitutions')
                  .update({ 
                      status: 'accepted', 
                      substitute_faculty_id: user.id,
                      accepted_at: new Date().toISOString()
                  })
                  .eq('id', requestId)
                  .eq('status', 'pending');

              if (updateError) throw updateError;

              // 3. AUTO-REPLY: Notify Sender
              await supabase.from('notifications').insert({
                  user_id: request.original_faculty_id,
                  type: 'info', // System/Info style (Gray)
                  title: 'Request Accepted',
                  body: `${myName} accepted your request for ${request.slot_id?.split('_')[1] || 'class'}.`,
                  is_read: false
              });

              // Send Real Push
              if (senderProfile?.push_token) {
                  NotificationService.sendPushNotification(
                      senderProfile.push_token,
                      'Request Accepted',
                      `${myName} accepted your request for ${request.slot_id?.split('_')[1] || 'class'}.`
                  );
              }
              
              fetchUnreadCount();
              return { success: true, message: 'You have accepted the class!', type: 'success' };

           } else {
              // Decline Logic
              const { error: declineError } = await supabase
                  .from('substitutions')
                  .update({ status: 'declined' })
                  .eq('id', requestId);
                  
              if(declineError) throw declineError;

              // AUTO-REPLY: Notify Sender
              await supabase.from('notifications').insert({
                  user_id: request.original_faculty_id,
                  type: 'info', // System/Info style
                  title: 'Request Declined',
                  body: `${myName} declined your request for ${request.slot_id?.split('_')[1] || 'class'}.`,
                  is_read: false
              });

              // Send Real Push
              if (senderProfile?.push_token) {
                  NotificationService.sendPushNotification(
                      senderProfile.push_token,
                      'Request Declined',
                      `${myName} declined your request for ${request.slot_id?.split('_')[1] || 'class'}.`
                  );
              }

              fetchUnreadCount();
              return { success: true, message: 'Request declined', type: 'info' };
          }

      } catch (error: any) {
          return { success: false, message: error.message || 'An error occurred', type: 'error' };
      }
  };

  return (
    <NotificationContext.Provider value={{ unreadCount, expoPushToken, refreshNotifications: fetchUnreadCount, respondToSubstituteRequest }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationContext);
