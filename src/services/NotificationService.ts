import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../config/supabase';

// Configure behavior (Foreground)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const NotificationService = {
  
  // 1. Setup Categories (Interactive Buttons)
  async setupNotificationCategories() {
    await Notifications.setNotificationCategoryAsync('SUB_REQUEST', [
      {
        identifier: 'ACCEPT',
        buttonTitle: 'Accept',
        options: { opensAppToForeground: true }, // Must open app to verify location/auth
      },
      {
        identifier: 'DECLINE',
        buttonTitle: 'Decline',
        options: { isDestructive: true, opensAppToForeground: false }, // Can decline in background
      },
    ]);
  },
  
  async registerForPushNotificationsAsync() {
    let token;
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return undefined;
    }
    
    // Project ID check would go here if using EAS
    token = (await Notifications.getExpoPushTokenAsync()).data;
    return token;
  },

  async updateUserPushToken(userId: string, token: string) {
      await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
  },

  async scheduleClassReminder(
    subjectName: string, 
    classDetails: string, // "Year-Sec-Dept"
    startTime: Date
  ) {
    const triggerDate = new Date(startTime);
    triggerDate.setMinutes(triggerDate.getMinutes() - 10); // 10 mins before

    // Don't schedule if already passed
    if (triggerDate.getTime() < Date.now()) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Upcoming Class: ${subjectName}`,
        body: `Your class for ${classDetails} starts in 10 minutes. Don't forget to take attendance!`,
        sound: true,
        data: { type: 'CLASS_REMINDER' },
      },
      trigger: { 
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate 
      },
    });
  },

  async cancelAll() {
    await Notifications.cancelAllScheduledNotificationsAsync();
  },

  async getAllScheduled() {
    return await Notifications.getAllScheduledNotificationsAsync();
  },
  
  // Weekly Cleanup Routine
  async cleanupOldNotifications() {
     try {
       // Client-side fallback:
       const sevenDaysAgo = new Date();
       sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
       
       const { error: deleteError } = await supabase
         .from('notifications')
         .delete()
         .lt('created_at', sevenDaysAgo.toISOString());
         
       if (deleteError) console.log('Cleanup Error:', deleteError);
     } catch (e) {
       console.log('Cleanup Exception:', e);
     }
  },

  // 4. Send Push Notification (Client-to-Client)
  async sendPushNotification(expoPushToken: string, title: string, body: string, data?: any) {
    if (!expoPushToken) return;
    
    const message = {
      to: expoPushToken,
      sound: 'default',
      title: title,
      body: body,
      data: data || {},
      _displayInForeground: true,
    };

    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
    } catch (error) {
      console.log('Push Error:', error);
    }
  }
};
