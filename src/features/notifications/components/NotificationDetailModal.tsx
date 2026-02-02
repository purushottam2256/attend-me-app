import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

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
                                size={24} 
                                color="#10B981" 
                            />
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color={isDark ? '#94A3B8' : '#64748B'} />
                        </TouchableOpacity>
                    </View>

                    {/* Content */}
                    <ScrollView style={styles.content}>
                        <Text style={[styles.date, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                            {notification.timestamp}
                        </Text>
                        <Text style={[styles.title, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                            {notification.title}
                        </Text>
                        <Text style={[styles.body, { color: isDark ? '#CBD5E1' : '#334155' }]}>
                            {notification.body}
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
                            <Ionicons name="trash-outline" size={20} color="#EF4444" />
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
    padding: 24,
  },
  modalContainer: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    marginBottom: 24,
  },
  date: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    lineHeight: 28,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  deleteText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
  doneButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  doneText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
