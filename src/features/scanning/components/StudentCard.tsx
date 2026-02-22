/**
 * StudentCard - Apple Zen Mode Premium Design
 * Refined swipeable cards with elegant status colors
 */

import React, { useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Animated, 
  PanResponder,
  Image,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../contexts';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';

const SWIPE_THRESHOLD = scale(50);


type StudentStatus = 'pending' | 'present' | 'absent' | 'od' | 'leave';

interface StudentCardProps {
  name: string;
  rollNo: string;
  photoUrl?: string;
  status: StudentStatus;
  onStatusChange: (newStatus: StudentStatus) => void;
}

export const StudentCard: React.FC<StudentCardProps> = ({
  name,
  rollNo,
  photoUrl,
  status,
  onStatusChange,
}) => {
  const { isDark } = useTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const isSwipingRef = useRef(false);

  /* Helper to get initials */
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  /* PanResponder for Swipe Gestures */
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // LOCK: Disable swipe for OD/Leave
        if (status === 'od' || status === 'leave') return false;

        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2;
        return isHorizontal && Math.abs(gestureState.dx) > 12;
      },
      onPanResponderGrant: () => {
        isSwipingRef.current = true;
      },
      onPanResponderMove: (_, gestureState) => {
        if (isSwipingRef.current) {
          translateX.setValue(gestureState.dx * 0.7);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        isSwipingRef.current = false;
        
        if (gestureState.dx > SWIPE_THRESHOLD) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onStatusChange('present');
        } else if (gestureState.dx < -SWIPE_THRESHOLD) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          onStatusChange('absent');
        }
        
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          friction: 8,
          tension: 90,
        }).start();
      },
      onPanResponderTerminate: () => {
        isSwipingRef.current = false;
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          friction: 8,
        }).start();
      },
    })
  ).current;
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

  // Background reveal
  const leftBgOpacity = translateX.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const rightBgOpacity = translateX.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const handleTap = () => {
    // LOCK: Disable tap for OD/Leave
    if (status === 'od' || status === 'leave') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return; 
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (status === 'pending') onStatusChange('present');
    else if (status === 'present') onStatusChange('absent');
    else onStatusChange('pending');
  };

  return (
    <View style={styles.container}>
      {/* Background reveal - Absent */}
      <Animated.View style={[styles.bgReveal, styles.bgRevealLeft, { opacity: leftBgOpacity }]}>
        <Ionicons name="close" size={normalizeFont(18)} color="#FFFFFF" />
      </Animated.View>

      {/* Background reveal - Present */}
      <Animated.View style={[styles.bgReveal, styles.bgRevealRight, { opacity: rightBgOpacity }]}>
        <Ionicons name="checkmark" size={normalizeFont(18)} color="#FFFFFF" />
      </Animated.View>

      {/* Card */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.card,
          { 
            backgroundColor: statusStyle.bg,
            borderColor: statusStyle.border,
            transform: [{ translateX }],
          },
        ]}
      >
        <TouchableOpacity 
          style={styles.cardContent} 
          onPress={handleTap}
          activeOpacity={0.85}
        >
          {/* Avatar Removed */}

          {/* Info */}
          <View style={styles.info}>
            <Text style={[styles.name, { color: textColors.name }]} numberOfLines={1}>{name}</Text>
            <Text style={[styles.rollNo, { color: textColors.rollNo }]}>{rollNo}</Text>
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
        </TouchableOpacity>
      </Animated.View>
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
