/**
 * WatchlistCard - Critical student card with quick actions
 * 
 * Shows students with <75% attendance with Call Parent / WhatsApp options
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../contexts';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';

interface WatchlistCardProps {
  studentName: string;
  rollNo: string;
  percentage: number;
  parentMobile?: string;
  studentMobile?: string;
  onStatusMessage?: (message: string, type: 'success' | 'error' | 'warning') => void;
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
  onStatusMessage,
}) => {
  const { isDark } = useTheme();
  const urgencyColor = getUrgencyColor(percentage);
  const isCritical = percentage < 65;

  const handleCallParent = async () => {
    if (!parentMobile) {
      onStatusMessage?.('Parent mobile number not available', 'error');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await Linking.openURL(`tel:${parentMobile}`);
  };

  const handleWhatsApp = async () => {
    if (!studentMobile) {
      onStatusMessage?.('Student mobile number not available', 'error');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const message = `Dear ${studentName},\n\nThis is to inform you that your current attendance is ${percentage}%, which is below the required threshold of 75%. Please ensure you attend all upcoming classes to avoid any academic actions.\n\nRegards,\nClass Incharge`;
    await Linking.openURL(`whatsapp://send?phone=+91${studentMobile.replace(/\D/g, '')}&text=${encodeURIComponent(message)}`);
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
            {/* Avatar */}
            <View style={{
              width: scale(32),
              height: scale(32),
              borderRadius: scale(16),
              backgroundColor: `${urgencyColor}25`,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: scale(8),
            }}>
              <Text style={{ fontSize: normalizeFont(11), fontWeight: '700', color: urgencyColor }}>
                {studentName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'U'}
              </Text>
            </View>
            <Text style={[styles.studentName, { color: isDark ? '#FFFFFF' : '#0F172A' }]} numberOfLines={1}>
              {studentName}
            </Text>
            {/* Critical Tag Removed */}
          </View>
          <Text style={[styles.rollNo, { color: isDark ? 'rgba(255,255,255,0.5)' : '#64748B', marginLeft: scale(40) }]}>
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
            <Ionicons name="call" size={normalizeFont(18)} color="#FFFFFF" />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.actionBtn, styles.whatsappBtn]}
            onPress={handleWhatsApp}
            activeOpacity={0.8}
          >
            <Ionicons name="logo-whatsapp" size={normalizeFont(18)} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: moderateScale(14),
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: verticalScale(10),
  },
  urgencyBar: {
    width: scale(4),
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(14),
    gap: scale(12),
  },
  infoSection: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  studentName: {
    fontSize: normalizeFont(15),
    fontWeight: '600',
    flex: 1,
  },
  criticalBadge: {
    backgroundColor: '#DC2626',
    paddingHorizontal: scale(6),
    paddingVertical: verticalScale(2),
    borderRadius: moderateScale(4),
  },
  criticalText: {
    color: '#FFFFFF',
    fontSize: normalizeFont(9),
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  rollNo: {
    fontSize: normalizeFont(12),
    marginTop: verticalScale(2),
  },
  percentageBox: {
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
    borderRadius: moderateScale(10),
    alignItems: 'center',
    minWidth: scale(56),
  },
  percentageValue: {
    fontSize: normalizeFont(16),
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: scale(8),
  },
  actionBtn: {
    width: scale(36),
    height: scale(36),
    borderRadius: moderateScale(18),
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
