/**
 * StudentCard - Apple Zen Mode Premium Design
 * Refined swipeable cards with elegant status colors
 */

import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Image,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import AnimatedRe, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useTheme } from '../../../contexts';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';
import { isLateralEntry } from '../../../utils/studentUtils';

const SWIPE_THRESHOLD = scale(50);

type StudentStatus = 'pending' | 'present' | 'absent' | 'od' | 'leave';

interface StudentCardProps {
  name: string;
  rollNo: string;
  photoUrl?: string;
  status: StudentStatus;
  isLE?: boolean;
  onStatusChange: (newStatus: StudentStatus) => void;
}

export const StudentCard: React.FC<StudentCardProps> = ({
  name,
  rollNo,
  photoUrl,
  status,
  isLE,
  onStatusChange,
}) => {
  const { isDark } = useTheme();
  
  const translateX = useSharedValue(0);

  const handleStatusChange = (newStatus: StudentStatus) => {
    onStatusChange(newStatus);
  };

  const handleNotification = (type: Haptics.NotificationFeedbackType) => {
    Haptics.notificationAsync(type);
  };

  const panGesture = Gesture.Pan()
    .enabled(status !== 'od' && status !== 'leave')
    .activeOffsetX([-12, 12]) // Replaces the math threshold logic
    .onUpdate((event) => {
      translateX.value = event.translationX * 0.7;
    })
    .onEnd((event) => {
      if (event.translationX > SWIPE_THRESHOLD) {
        runOnJS(handleNotification)(Haptics.NotificationFeedbackType.Success);
        runOnJS(handleStatusChange)('present');
      } else if (event.translationX < -SWIPE_THRESHOLD) {
        runOnJS(handleNotification)(Haptics.NotificationFeedbackType.Warning);
        runOnJS(handleStatusChange)('absent');
      }
      
      translateX.value = withSpring(0, { mass: 1, damping: 15, stiffness: 150 });
    });

  const getStatusStyle = () => {
    switch (status) {
      case 'present':
      case 'od': // OD looks like Present
        return { 
          bg: isDark ? '#1C2E1E' : '#E8F9EC', 
          border: isDark ? 'rgba(52, 199, 89, 0.3)' : 'rgba(52, 199, 89, 0.25)', 
          accent: '#34C759',
          text: isDark ? '#34C759' : '#248A3D',
          avatarBg: isDark ? '#1A2E1C' : '#FFFFFF',
        };
      case 'absent':
      case 'leave': // Leave looks like Absent
        return { 
          bg: isDark ? '#2E1C1C' : '#FEF0F0', 
          border: isDark ? 'rgba(255, 107, 107, 0.25)' : 'rgba(255, 107, 107, 0.2)', 
          accent: '#FF6B6B',
          text: isDark ? '#FF6B6B' : '#D63031',
          avatarBg: isDark ? '#2E1A1A' : '#FFFFFF',
        };
      default:
        return { 
          bg: isDark ? '#1C1C1E' : '#FFFFFF', 
          border: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)', 
          accent: isDark ? '#636366' : '#8E8E93',
          text: isDark ? '#636366' : '#8E8E93',
          avatarBg: isDark ? '#2C2C2E' : '#F2F2F7',
        };
    }
  };

  const statusStyle = getStatusStyle();

  // Text colors
  const textColors = {
    name: isDark ? '#FFFFFF' : '#1C1C1E',
    rollNo: status === 'od' ? '#A855F7' : (isDark ? 'rgba(255,255,255,0.5)' : '#8E8E93'),
  };

  // Reanimated Background reveal styles
  const leftBgAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        translateX.value,
        [-SWIPE_THRESHOLD, 0],
        [1, 0],
        Extrapolation.CLAMP
      ),
    };
  });

  const rightBgAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        translateX.value,
        [0, SWIPE_THRESHOLD],
        [0, 1],
        Extrapolation.CLAMP
      ),
    };
  });

  const cardAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

// Tap gestures removed to enforce swipe-only
  return (
    <View style={styles.container}>
      {/* Background reveal - Absent */}
      <AnimatedRe.View style={[styles.bgReveal, styles.bgRevealLeft, leftBgAnimatedStyle]}>
        <Ionicons name="close" size={normalizeFont(18)} color="#FFFFFF" />
      </AnimatedRe.View>

      {/* Background reveal - Present */}
      <AnimatedRe.View style={[styles.bgReveal, styles.bgRevealRight, rightBgAnimatedStyle]}>
        <Ionicons name="checkmark" size={normalizeFont(18)} color="#FFFFFF" />
      </AnimatedRe.View>

      {/* Card */}
      <GestureDetector gesture={panGesture}>
        <AnimatedRe.View
          style={[
            styles.card,
            { 
              backgroundColor: statusStyle.bg,
              borderColor: statusStyle.border,
            },
            cardAnimatedStyle
          ]}
        >
          <View style={styles.cardContent}>
          {/* Avatar Removed */}

          {/* Info */}
          <View style={styles.info}>
            <Text style={[styles.name, { color: textColors.name }]} numberOfLines={1}>{name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.rollNo, { color: textColors.rollNo, marginBottom: 0 }]}>{rollNo}</Text>
              {isLateralEntry(rollNo, isLE) && (
                  <View style={{ backgroundColor: 'rgba(56, 189, 248, 0.2)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 }}>
                      <Text style={{ fontSize: 9, color: textColors.name === '#FFFFFF' ? '#38BDF8' : '#0284C7', fontWeight: 'bold' }}>LE</Text>
                  </View>
              )}
            </View>
          </View>

          {/* Status Indicator / Tag */}
          {(status === 'od' || status === 'leave') ? (
            <View style={[styles.statusTag, { backgroundColor: statusStyle.accent }]}>
              <Text style={styles.statusTagText}>{status.toUpperCase()}</Text>
            </View>
          ) : (
            <View style={[styles.statusIndicator, { backgroundColor: statusStyle.accent }]}>
              <Ionicons 
                name={status === 'present' ? 'checkmark' : status === 'absent' ? 'close' : 'remove'} 
                size={normalizeFont(10)} 
                color="#FFFFFF" 
              />
            </View>
          )}
        </View>
        </AnimatedRe.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: scale(12),
    marginBottom: verticalScale(6),
    height: verticalScale(52),
  },
  bgReveal: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: scale(52),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: moderateScale(14),
  },
  bgRevealLeft: {
    right: 0,
    backgroundColor: '#FF6B6B',
  },
  bgRevealRight: {
    left: 0,
    backgroundColor: '#34C759',
  },
  card: {
    borderRadius: moderateScale(14),
    borderWidth: 1,
    height: '100%',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(10),
    height: '100%',
  },
  avatar: {
    width: scale(36),
    height: scale(36),
    borderRadius: moderateScale(18),
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontSize: normalizeFont(13),
    fontWeight: '600',
  },
  info: {
    flex: 1,
    marginLeft: 0, // Removed margin since avatar is gone
  },
  name: {
    fontSize: normalizeFont(14),
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  rollNo: {
    fontSize: normalizeFont(11),
    fontWeight: '500',
    marginTop: verticalScale(1),
  },
  statusIndicator: {
    width: scale(20),
    height: scale(20),
    borderRadius: moderateScale(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTag: {
    paddingHorizontal: scale(6),
    paddingVertical: verticalScale(3),
    borderRadius: moderateScale(6),
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTagText: {
    fontSize: normalizeFont(9),
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});

export default StudentCard;
