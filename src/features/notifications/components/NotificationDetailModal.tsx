import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';

interface NotificationDetailModalProps {
  visible: boolean;
  notification: any; // Using any for flexibility now, strictly typed in usage
  onClose: () => void;
  onDelete: (id: string) => void;
  isDark: boolean;
}

export const NotificationDetailModal = ({ 
  visible, 
  notification, 
  onClose, 
  onDelete,
  isDark 
}: NotificationDetailModalProps) => {
  if (!notification) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
            <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <TouchableWithoutFeedback>
                <View style={[
                    styles.modalContainer, 
                    { 
                        backgroundColor: isDark ? '#082020' : '#F0FDF4', // Light Green in Light Mode
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(16, 185, 129, 0.1)'
                    }
                ]}>
                    
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={[styles.iconBadge, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#DCFCE7' }]}>
                            <Ionicons 
                                name={notification.type === 'request' ? 'swap-horizontal' : 'notifications'} 
                                size={normalizeFont(24)} 
                                color="#10B981" 
                            />
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={normalizeFont(24)} color={isDark ? '#94A3B8' : '#64748B'} />
                        </TouchableOpacity>
                    </View>

                    {/* Content */}
                    <ScrollView style={styles.content}>
                        <Text style={[styles.date, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                            {notification?.timestamp || 'Just now'}
                        </Text>
                        <Text style={[styles.title, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                            {notification?.title || 'Notification'}
                        </Text>
                        <Text style={[styles.body, { color: isDark ? '#CBD5E1' : '#334155' }]}>
                            {notification?.body || 'No details available.'}
                        </Text>
                    </ScrollView>

                    {/* Actions */}
                    <View style={styles.footer}>
                        <TouchableOpacity 
                            style={[styles.deleteButton, { backgroundColor: isDark ? '#1F2937' : '#FFE4E6' }]}
                            onPress={() => {
                                onDelete(notification.id);
                                onClose();
                            }}
                        >
                            <Ionicons name="trash-outline" size={normalizeFont(20)} color="#EF4444" />
                            <Text style={styles.deleteText}>Delete</Text>
                        </TouchableOpacity>

                        {/* Close button removed as per user request */}
                    </View>

                </View>
            </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: scale(24),
  },
  modalContainer: {
    width: '100%',
    borderRadius: moderateScale(24),
    borderWidth: 1,
    padding: scale(24),
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(10) },
    shadowOpacity: 0.25,
    shadowRadius: moderateScale(20),
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: verticalScale(20),
  },
  iconBadge: {
    width: scale(48),
    height: scale(48),
    borderRadius: moderateScale(16),
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    padding: scale(4),
  },
  content: {
    marginBottom: verticalScale(24),
  },
  date: {
    fontSize: normalizeFont(13),
    fontWeight: '500',
    marginBottom: verticalScale(8),
  },
  title: {
    fontSize: normalizeFont(20),
    fontWeight: '700',
    marginBottom: verticalScale(12),
    lineHeight: verticalScale(28),
  },
  body: {
    fontSize: normalizeFont(16),
    lineHeight: verticalScale(24),
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: verticalScale(8),
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(12),
    gap: scale(8),
  },
  deleteText: {
    color: '#EF4444',
    fontSize: normalizeFont(14),
    fontWeight: '600',
  },
  doneButton: {
    paddingHorizontal: scale(24),
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(12),
  },
  doneText: {
    color: '#FFFFFF',
    fontSize: normalizeFont(14),
    fontWeight: '600',
  },
});
