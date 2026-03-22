/**
 * ScanBlockedModal - Professional modal shown when scanning is restricted
 * 
 * Scenarios:
 * - College hours ended (after 5pm)
 * - Before college hours (before 8:30am)
 * - During break time (no active class)
 * - Holiday or event day
 * - No class scheduled for current time
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export type BlockReason = 
  | 'after_hours' 
  | 'before_hours' 
  | 'break_time' 
  | 'no_class' 
  | 'holiday' 
  | 'event'
  | 'class_ended';

interface NextClassInfo {
  name: string;
  time: string;
}

interface PreviousClassInfo {
  name: string;
  section: string;
  time: string;
}

interface ScanBlockedModalProps {
  visible: boolean;
  onClose: () => void;
  onTakePreviousAttendance?: () => void;
  reason: BlockReason;
  holidayName?: string;
  eventName?: string;
  nextClass?: NextClassInfo | null;
  previousClass?: PreviousClassInfo | null;
  currentTime?: string;
}

const getReasonConfig = (reason: BlockReason, holidayName?: string, eventName?: string) => {
  switch (reason) {
    case 'after_hours':
      return {
        icon: 'moon-outline' as const,
        iconColor: '#6366F1',
        title: 'Day Complete',
        subtitle: 'All scheduled classes have concluded for today. Attendance scanning resumes tomorrow at 8:30 AM.',
        suggestion: 'See you tomorrow!',
      };
    case 'before_hours':
      return {
        icon: 'sunny-outline' as const,
        iconColor: '#F97316',
        title: 'Good Morning!',
        subtitle: 'Classes begin at 8:30 AM. Prepare for a productive day ahead.',
        suggestion: 'Scanning will be available shortly.',
      };
    case 'break_time':
    case 'no_class':
      return {
        icon: 'cafe-outline' as const,
        iconColor: '#F59E0B',
        title: 'Break Time',
        subtitle: 'No active class at the moment. You can take late attendance for a previous class or go back.',
        suggestion: 'Your next class will appear on the dashboard.',
      };
    case 'holiday':
      return {
        icon: 'gift-outline' as const,
        iconColor: '#10B981',
        title: holidayName || 'Holiday',
        subtitle: 'No classes scheduled today. Enjoy your time off!',
        suggestion: 'See you on the next working day.',
      };
    case 'event':
      return {
        icon: 'megaphone-outline' as const,
        iconColor: '#F59E0B',
        title: eventName || 'Special Event',
        subtitle: 'Regular classes are suspended for today\'s event.',
        suggestion: 'Attendance is not required.',
      };
    case 'class_ended':
      return {
        icon: 'checkmark-circle-outline' as const,
        iconColor: '#22C55E',
        title: 'Session Complete',
        subtitle: 'The attendance window for this class has closed.',
        suggestion: 'View past attendance in History.',
      };
    default:
      return {
        icon: 'information-circle-outline' as const,
        iconColor: '#64748B',
        title: 'Scanning Unavailable',
        subtitle: 'Attendance scanning is temporarily unavailable.',
        suggestion: 'Please try again later.',
      };
  }
};

export const ScanBlockedModal: React.FC<ScanBlockedModalProps> = ({
  visible,
  onClose,
  onTakePreviousAttendance,
  reason,
  holidayName,
  eventName,
  nextClass,
  previousClass,
  currentTime,
}) => {
  const insets = useSafeAreaInsets();
  const config = getReasonConfig(reason, holidayName, eventName);
  
  // Show previous class option for break_time and no_class
  const showPreviousClassOption = (reason === 'break_time' || reason === 'no_class') && onTakePreviousAttendance;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <BlurView intensity={40} tint="dark" style={styles.overlay}>
        <View style={[styles.container, { paddingBottom: insets.bottom + verticalScale(24) }]}>
          {/* Icon Circle */}
          <View style={[styles.iconCircle, { backgroundColor: `${config.iconColor}15` }]}>
            <View style={[styles.iconInner, { backgroundColor: `${config.iconColor}25` }]}>
              <Ionicons name={config.icon} size={normalizeFont(48)} color={config.iconColor} />
            </View>
          </View>

          {/* Title */}
          <Text style={styles.title}>{config.title}</Text>
          
          {/* Subtitle */}
          <Text style={styles.subtitle}>{config.subtitle}</Text>

          {/* Current Time Display */}
          {currentTime && (
            <View style={styles.timeContainer}>
              <Ionicons name="time-outline" size={normalizeFont(16)} color="rgba(255,255,255,0.5)" />
              <Text style={styles.timeText}>Current Time: {currentTime}</Text>
            </View>
          )}

          {/* Previous Class Card (for break time) */}
          {showPreviousClassOption && previousClass && (
            <View style={styles.previousClassCard}>
              <View style={styles.previousClassHeader}>
                <Ionicons name="time-outline" size={normalizeFont(18)} color="#F59E0B" />
                <Text style={styles.previousClassLabel}>Previous Class</Text>
              </View>
              <Text style={styles.previousClassName}>{previousClass.name}</Text>
              <Text style={styles.previousClassSection}>{previousClass.section} • {previousClass.time}</Text>
            </View>
          )}

          {/* Next Class Info */}
          {nextClass && (
            <View style={styles.nextClassCard}>
              <View style={styles.nextClassHeader}>
                <Ionicons name="arrow-forward-circle-outline" size={normalizeFont(18)} color="#3DDC97" />
                <Text style={styles.nextClassLabel}>Next Class</Text>
              </View>
              <Text style={styles.nextClassName}>{nextClass.name}</Text>
              <Text style={styles.nextClassTime}>{nextClass.time}</Text>
            </View>
          )}

          {/* Suggestion */}
          <View style={styles.suggestionContainer}>
            <Ionicons name="bulb-outline" size={normalizeFont(16)} color="#F59E0B" />
            <Text style={styles.suggestionText}>{config.suggestion}</Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            {/* Take Previous Attendance Button (for break time) */}
            {showPreviousClassOption && (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={onTakePreviousAttendance}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#F59E0B', '#D97706']}
                  style={styles.buttonGradient}
                >
                  <Ionicons name="list-outline" size={normalizeFont(20)} color="#FFF" style={{ marginRight: scale(8) }} />
                  <Text style={styles.buttonText}>Take Late Attendance</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {/* Go Home Button */}
            <TouchableOpacity
              style={[styles.secondaryButton, !showPreviousClassOption && styles.fullWidthButton]}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#1A6B6B', '#0D4A4A']}
                style={styles.buttonGradient}
              >
                <Ionicons name="home-outline" size={normalizeFont(20)} color="#FFF" style={{ marginRight: scale(8) }} />
                <Text style={styles.buttonText}>Go Back Home</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(24),
  },
  container: {
    width: SCREEN_WIDTH - scale(48),
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: moderateScale(28),
    padding: scale(32),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  iconCircle: {
    width: scale(120),
    height: scale(120),
    borderRadius: moderateScale(60),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(24),
  },
  iconInner: {
    width: scale(88),
    height: scale(88),
    borderRadius: moderateScale(44),
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: normalizeFont(24),
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: verticalScale(12),
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: normalizeFont(15),
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: verticalScale(22),
    marginBottom: verticalScale(20),
    paddingHorizontal: scale(8),
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    marginBottom: verticalScale(16),
  },
  timeText: {
    fontSize: normalizeFont(13),
    color: 'rgba(255,255,255,0.5)',
  },
  previousClassCard: {
    width: '100%',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: moderateScale(16),
    padding: scale(16),
    marginBottom: verticalScale(12),
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  previousClassHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    marginBottom: verticalScale(8),
  },
  previousClassLabel: {
    fontSize: normalizeFont(12),
    fontWeight: '600',
    color: '#F59E0B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previousClassName: {
    fontSize: normalizeFont(17),
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: verticalScale(4),
  },
  previousClassSection: {
    fontSize: normalizeFont(13),
    color: 'rgba(255,255,255,0.6)',
  },
  nextClassCard: {
    width: '100%',
    backgroundColor: 'rgba(61, 220, 151, 0.1)',
    borderRadius: moderateScale(16),
    padding: scale(16),
    marginBottom: verticalScale(16),
    borderWidth: 1,
    borderColor: 'rgba(61, 220, 151, 0.2)',
  },
  nextClassHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    marginBottom: verticalScale(8),
  },
  nextClassLabel: {
    fontSize: normalizeFont(12),
    fontWeight: '600',
    color: '#3DDC97',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nextClassName: {
    fontSize: normalizeFont(17),
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: verticalScale(4),
  },
  nextClassTime: {
    fontSize: normalizeFont(13),
    color: 'rgba(255,255,255,0.6)',
  },
  suggestionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    marginBottom: verticalScale(24),
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: moderateScale(12),
  },
  suggestionText: {
    fontSize: normalizeFont(13),
    color: '#F59E0B',
    flex: 1,
  },
  buttonContainer: {
    width: '100%',
    gap: verticalScale(12),
  },
  primaryButton: {
    width: '100%',
    borderRadius: moderateScale(16),
    overflow: 'hidden',
  },
  secondaryButton: {
    width: '100%',
    borderRadius: moderateScale(16),
    overflow: 'hidden',
  },
  fullWidthButton: {
    marginTop: 0,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(16),
    paddingHorizontal: scale(24),
  },
  buttonText: {
    fontSize: normalizeFont(16),
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default ScanBlockedModal;
