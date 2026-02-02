import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

interface ConfirmationModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmJson?: string; // Optional JSON string for lottie or just icon name
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isDark: boolean;
}

export const ConfirmationModal = ({ 
  visible, 
  title, 
  message, 
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = false,
  onConfirm, 
  onCancel,
  isDark 
}: ConfirmationModalProps) => {

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.overlay}>
            <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            <TouchableWithoutFeedback>
                <View style={[
                    styles.modalContainer, 
                    { 
                        backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
                    }
                ]}>
                    
                    {/* Icon */}
                    <View style={[
                        styles.iconBadge, 
                        { backgroundColor: isDestructive ? (isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2') : (isDark ? 'rgba(59, 130, 246, 0.2)' : '#DBEAFE') }
                    ]}>
                        <Ionicons 
                            name={isDestructive ? "trash-outline" : "alert-circle-outline"} 
                            size={32} 
                            color={isDestructive ? "#EF4444" : "#3B82F6"} 
                        />
                    </View>

                    {/* Content */}
                    <Text style={[styles.title, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                        {title}
                    </Text>
                    <Text style={[styles.message, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                        {message}
                    </Text>

                    {/* Actions */}
                    <View style={styles.footer}>
                        <TouchableOpacity 
                            style={[styles.button, styles.cancelButton, {  borderColor: isDark ? '#334155' : '#E2E8F0' }]}
                            onPress={onCancel}
                        >
                            <Text style={[styles.buttonText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                                {cancelLabel}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={[
                                styles.button, 
                                styles.confirmButton, 
                                { backgroundColor: isDestructive ? '#EF4444' : '#3B82F6' }
                            ]}
                            onPress={onConfirm}
                        >
                            <Text style={[styles.buttonText, { color: '#FFFFFF', fontWeight: '600' }]}>
                                {confirmLabel}
                            </Text>
                        </TouchableOpacity>
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  confirmButton: {
    
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
