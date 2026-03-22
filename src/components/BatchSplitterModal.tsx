/**
 * BatchSplitterModal - Select batch for lab sessions
 * Options: Full Class, Batch 1 Only, Batch 2 Only
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts';
import { scale, verticalScale, moderateScale, normalizeFont } from '../utils/responsive';

interface BatchSplitterModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (batch: 'full' | 1 | 2) => void;
  subjectName?: string;
}

export const BatchSplitterModal: React.FC<BatchSplitterModalProps> = ({
  visible,
  onClose,
  onSelect,
  subjectName = 'Lab Session',
}) => {
  const { isDark } = useTheme();

  const options = [
    {
      id: 'full' as const,
      icon: 'people' as const,
      label: 'Full Class',
      description: 'Take attendance for all students',
      color: '#0D4A4A',
    },
    {
      id: 1 as const,
      icon: 'person' as const,
      label: 'Batch 1 Only',
      description: 'Students in batch 1',
      color: '#3B82F6',
    },
    {
      id: 2 as const,
      icon: 'person' as const,
      label: 'Batch 2 Only',
      description: 'Students in batch 2',
      color: '#F59E0B',
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[
              styles.modalContent,
              { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }
            ]}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={[styles.title, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                  Select Batch
                </Text>
                <Text style={[styles.subtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  {subjectName}
                </Text>
              </View>

              {/* Options */}
              <View style={styles.options}>
                {options.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.optionCard,
                      { 
                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC',
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0',
                      }
                    ]}
                    onPress={() => onSelect(option.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconContainer, { backgroundColor: `${option.color}15` }]}>
                      <Ionicons name={option.icon} size={normalizeFont(24)} color={option.color} />
                    </View>
                    <View style={styles.optionContent}>
                      <Text style={[styles.optionLabel, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                        {option.label}
                      </Text>
                      <Text style={[styles.optionDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                        {option.description}
                      </Text>
                    </View>
                    <Ionicons 
                      name="chevron-forward" 
                      size={normalizeFont(20)} 
                      color={isDark ? '#475569' : '#CBD5E1'} 
                    />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Cancel Button */}
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    paddingHorizontal: scale(16),
    paddingBottom: verticalScale(32),
  },
  modalContent: {
    borderRadius: moderateScale(24),
    padding: scale(24),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(-4) },
    shadowOpacity: 0.15,
    shadowRadius: moderateScale(20),
    elevation: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: verticalScale(24),
  },
  title: {
    fontSize: normalizeFont(22),
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: normalizeFont(15),
    fontWeight: '500',
    marginTop: verticalScale(4),
  },
  options: {
    gap: scale(12),
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: scale(16),
    borderRadius: moderateScale(16),
    borderWidth: 1,
  },
  iconContainer: {
    width: scale(48),
    height: scale(48),
    borderRadius: moderateScale(14),
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: scale(14),
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontSize: normalizeFont(17),
    fontWeight: '600',
  },
  optionDesc: {
    fontSize: normalizeFont(13),
    marginTop: verticalScale(2),
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: verticalScale(16),
    marginTop: verticalScale(12),
  },
  cancelText: {
    fontSize: normalizeFont(17),
    fontWeight: '600',
    color: '#EF4444',
  },
});

export default BatchSplitterModal;
