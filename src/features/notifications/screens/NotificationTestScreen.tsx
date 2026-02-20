/**
 * NotificationTestScreen
 * 
 * A development/debug screen to test all notification types
 * Add this to your navigation and use it to verify notification functionality
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { useTheme } from '../../../contexts';
import { useColors } from '../../../hooks/useColors';
import { NotificationService } from '../../../services/NotificationService';
import { useNotifications } from '../../../contexts/NotificationContext';
import { supabase } from '../../../config/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';

export const NotificationTestScreen = () => {
  const { colors } = useTheme() as any; // Using useColors instead below
  const themeColors = useColors();
  const { user } = useAuth();
  const { pushToken, unreadCount, refreshNotifications } = useNotifications();
  const [loading, setLoading] = useState<string | null>(null);

  // Test button component
  const TestButton = ({ 
    title, 
    subtitle, 
    icon, 
    onPress, 
    color = colors.primary 
  }: { 
    title: string; 
    subtitle: string; 
    icon: string; 
    onPress: () => void; 
    color?: string;
  }) => (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: color }]}
      onPress={onPress}
      disabled={loading !== null}
    >
      <Ionicons name={icon as any} size={normalizeFont(24)} color="#fff" />
      <View style={styles.buttonText}>
        <Text style={styles.buttonTitle}>{title}</Text>
        <Text style={styles.buttonSubtitle}>{subtitle}</Text>
      </View>
      {loading === title && (
        <View style={styles.loadingIndicator} />
      )}
    </TouchableOpacity>
  );

  // Test: Immediate Local Notification
  const testLocalNotification = async () => {
    setLoading('Local Notification');
    try {
      await NotificationService.showLocalNotification({
        title: '🧪 Test Notification',
        body: 'This is an immediate local notification!',
        data: { type: 'TEST_LOCAL' },
      });
      Alert.alert('Success', 'Local notification sent!');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
    setLoading(null);
  };

  // Test: Scheduled Notification (5 seconds from now)
  const testScheduledNotification = async () => {
    setLoading('Scheduled Notification');
    try {
      const triggerDate = new Date(Date.now() + 5000); // 5 seconds
      const id = await NotificationService.scheduleNotification({
        title: '⏰ Scheduled Test',
        body: 'This notification was scheduled 5 seconds ago!',
        triggerDate,
        data: { type: 'TEST_SCHEDULED' },
        categoryId: 'REMINDER',
      });
      Alert.alert('Success', `Notification scheduled for 5 seconds from now. ID: ${id}`);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
    setLoading(null);
  };

  // Test: Class Reminder (10 minutes from now)
  const testClassReminder = async () => {
    setLoading('Class Reminder');
    try {
      // Schedule 10 mins from now means the class "starts" 20 mins from now
      const classTime = new Date(Date.now() + 20 * 60 * 1000);
      const id = await NotificationService.scheduleClassReminder(
        'Data Structures',
        'CSE-A 2nd Year',
        classTime
      );
      Alert.alert('Success', `Class reminder scheduled! ID: ${id}`);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
    setLoading(null);
  };

  // Test: Create In-App Notification (Supabase)
  const testInAppNotification = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in');
      return;
    }
    setLoading('In-App Notification');
    try {
      const { error } = await supabase.from('notifications').insert({
        user_id: user.id,
        type: 'info',
        title: '📬 Test In-App Notification',
        body: 'This notification was created in the database!',
        is_read: false,
      });
      if (error) throw error;
      await refreshNotifications();
      Alert.alert('Success', 'In-app notification created! Check the Notifications screen.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
    setLoading(null);
  };

  // Test: Substitution Request Notification
  const testSubRequestNotification = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in');
      return;
    }
    setLoading('Sub Request');
    try {
      await NotificationService.showLocalNotification({
        title: '🔔 Substitution Request',
        body: 'Dr. Smith needs a substitute for P3 CSE-A tomorrow',
        data: { type: 'SUB_REQUEST', requestId: 'test-123' },
        categoryId: 'SUB_REQUEST',
      });
      Alert.alert('Success', 'Sub request notification sent with action buttons!');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
    setLoading(null);
  };

  // Test: Push Notification via Edge Function
  const testPushNotification = async () => {
    if (!pushToken?.token) {
      Alert.alert('Error', 'No push token available. Make sure you have granted notification permissions.');
      return;
    }
    setLoading('Push Notification');
    try {
      const success = await NotificationService.sendPushNotification(
        pushToken.token,
        '🚀 Push Test',
        'This push notification was sent via Supabase Edge Function!',
        { type: 'TEST_PUSH' }
      );
      if (success) {
        Alert.alert('Success', 'Push notification sent! Check your device.');
      } else {
        Alert.alert('Warning', 'Push may have failed. Check Supabase Edge Function logs.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
    setLoading(null);
  };

  // Get all scheduled notifications
  const getScheduledNotifications = async () => {
    setLoading('View Scheduled');
    try {
      const scheduled = await NotificationService.getAllScheduled();
      if (scheduled.length === 0) {
        Alert.alert('Scheduled Notifications', 'No scheduled notifications');
      } else {
        const list = scheduled.map(n => `• ${n.content.title}`).join('\n');
        Alert.alert(`${scheduled.length} Scheduled Notifications`, list);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
    setLoading(null);
  };

  // Cancel all scheduled
  const cancelAllScheduled = async () => {
    setLoading('Cancel All');
    try {
      await NotificationService.cancelAllScheduled();
      Alert.alert('Success', 'All scheduled notifications cancelled');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
    setLoading(null);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: themeColors.textPrimary }]}>Notification Testing</Text>
        <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
          Test all notification types
        </Text>
      </View>

      {/* Status Section */}
      <View style={[styles.statusCard, { backgroundColor: themeColors.surface }]}>
        <Text style={[styles.statusTitle, { color: themeColors.textPrimary }]}>Status</Text>
        <View style={styles.statusRow}>
          <Text style={[styles.statusLabel, { color: themeColors.textSecondary }]}>Push Token:</Text>
          <Text style={[styles.statusValue, { color: pushToken ? themeColors.success : themeColors.danger }]}>
            {pushToken ? `${pushToken.type.toUpperCase()} ✓` : 'Not registered'}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={[styles.statusLabel, { color: themeColors.textSecondary }]}>Unread Count:</Text>
          <Text style={[styles.statusValue, { color: themeColors.textPrimary }]}>{unreadCount}</Text>
        </View>
        {pushToken && (
          <Text style={[styles.tokenPreview, { color: themeColors.textTertiary }]}>
            Token: {pushToken.token.substring(0, 30)}...
          </Text>
        )}
      </View>

      {/* Test Buttons */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Local Notifications</Text>
        
        <TestButton
          title="Local Notification"
          subtitle="Show immediate notification"
          icon="send"
          onPress={testLocalNotification}
        />
        
        <TestButton
          title="Scheduled Notification"
          subtitle="Schedule for 5 seconds from now"
          icon="time"
          onPress={testScheduledNotification}
          color="#6366f1"
        />
        
        <TestButton
          title="Class Reminder"
          subtitle="Test class reminder format"
          icon="school"
          onPress={testClassReminder}
          color="#8b5cf6"
        />

        <TestButton
          title="Sub Request (Interactive)"
          subtitle="With Accept/Decline buttons"
          icon="swap-horizontal"
          onPress={testSubRequestNotification}
          color="#ec4899"
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Database & Push</Text>
        
        <TestButton
          title="In-App Notification"
          subtitle="Create in Supabase notifications table"
          icon="layers"
          onPress={testInAppNotification}
          color="#14b8a6"
        />
        
        <TestButton
          title="Push Notification"
          subtitle="Send via Supabase Edge Function"
          icon="rocket"
          onPress={testPushNotification}
          color="#f59e0b"
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Management</Text>
        
        <TestButton
          title="View Scheduled"
          subtitle="List all scheduled notifications"
          icon="list"
          onPress={getScheduledNotifications}
          color="#64748b"
        />
        
        <TestButton
          title="Cancel All"
          subtitle="Cancel all scheduled notifications"
          icon="trash"
          onPress={cancelAllScheduled}
          color="#ef4444"
        />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: themeColors.textTertiary }]}>
          ℹ️ Some notifications require the app to be in background to appear in system tray
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: scale(20),
    paddingTop: verticalScale(60),
  },
  title: {
    fontSize: normalizeFont(28),
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: normalizeFont(14),
    marginTop: verticalScale(4),
  },
  statusCard: {
    margin: scale(16),
    padding: scale(16),
    borderRadius: moderateScale(12),
  },
  statusTitle: {
    fontSize: normalizeFont(16),
    fontWeight: '600',
    marginBottom: verticalScale(12),
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: verticalScale(8),
  },
  statusLabel: {
    fontSize: normalizeFont(14),
  },
  statusValue: {
    fontSize: normalizeFont(14),
    fontWeight: '600',
  },
  tokenPreview: {
    fontSize: normalizeFont(10),
    marginTop: verticalScale(8),
    fontFamily: 'monospace',
  },
  section: {
    padding: scale(16),
  },
  sectionTitle: {
    fontSize: normalizeFont(18),
    fontWeight: '600',
    marginBottom: verticalScale(12),
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: scale(16),
    borderRadius: moderateScale(12),
    marginBottom: verticalScale(12),
  },
  buttonText: {
    marginLeft: scale(12),
    flex: 1,
  },
  buttonTitle: {
    color: '#fff',
    fontSize: normalizeFont(16),
    fontWeight: '600',
  },
  buttonSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: normalizeFont(12),
    marginTop: verticalScale(2),
  },
  loadingIndicator: {
    width: scale(20),
    height: scale(20),
    borderRadius: moderateScale(10),
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    borderTopColor: '#fff',
  },
  footer: {
    padding: scale(20),
    paddingBottom: verticalScale(40),
  },
  footerText: {
    fontSize: normalizeFont(12),
    textAlign: 'center',
  },
});

export default NotificationTestScreen;
