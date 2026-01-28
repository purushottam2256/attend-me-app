/**
 * WatchlistCard - Critical student card with quick actions
 * 
 * Shows students with <75% attendance with Call Parent / WhatsApp options
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../contexts';

interface WatchlistCardProps {
  studentName: string;
  rollNo: string;
  percentage: number;
  parentMobile?: string;
  studentMobile?: string;
}

const getUrgencyColor = (percentage: number): string => {
  if (percentage < 65) return '#DC2626'; // Critical red
  return '#EF4444'; // Warning red
};

export const WatchlistCard: React.FC<WatchlistCardProps> = ({
  studentName,
  rollNo,
  percentage,
  parentMobile,
  studentMobile,
}) => {
  const { isDark } = useTheme();
  const urgencyColor = getUrgencyColor(percentage);
  const isCritical = percentage < 65;

  const handleCallParent = async () => {
    if (!parentMobile) {
      Alert.alert('No Contact', 'Parent mobile number not available');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await Linking.openURL(`tel:${parentMobile}`);
  };

  const handleWhatsApp = async () => {
    if (!studentMobile) {
      Alert.alert('No Contact', 'Student mobile number not available');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const message = `Hi ${studentName}, your attendance is at ${percentage}%. Please ensure regular attendance.`;
    await Linking.openURL(`whatsapp://send?phone=${studentMobile}&text=${encodeURIComponent(message)}`);
  };

  return (
    <View style={[styles.card, {
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)',
      borderColor: isDark ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.2)',
    }]}>
      {/* Urgency indicator */}
      <View style={[styles.urgencyBar, { backgroundColor: urgencyColor }]} />
      
      <View style={styles.content}>
        {/* Student Info */}
        <View style={styles.infoSection}>
          <View style={styles.nameRow}>
            <Text style={[styles.studentName, { color: isDark ? '#FFFFFF' : '#0F172A' }]} numberOfLines={1}>
              {studentName}
            </Text>
            {/* Critical Tag Removed */}
          </View>
          <Text style={[styles.rollNo, { color: isDark ? 'rgba(255,255,255,0.5)' : '#64748B' }]}>
            {rollNo}
          </Text>
        </View>

        {/* Percentage */}
        <View style={[styles.percentageBox, { backgroundColor: `${urgencyColor}20` }]}>
          <Text style={[styles.percentageValue, { color: urgencyColor }]}>
            {percentage}%
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity 
            style={[styles.actionBtn, styles.callBtn]}
            onPress={handleCallParent}
            activeOpacity={0.8}
          >
            <Ionicons name="call" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.actionBtn, styles.whatsappBtn]}
            onPress={handleWhatsApp}
            activeOpacity={0.8}
          >
            <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 10,
  },
  urgencyBar: {
    width: 4,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  infoSection: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  studentName: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  criticalBadge: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  criticalText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  rollNo: {
    fontSize: 12,
    marginTop: 2,
  },
  percentageBox: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    minWidth: 56,
  },
  percentageValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBtn: {
    backgroundColor: '#0D9488',
  },
  whatsappBtn: {
    backgroundColor: '#25D366',
  },
});

export default WatchlistCard;
