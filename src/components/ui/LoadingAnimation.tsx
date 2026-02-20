/**
 * LoadingAnimation - Premium loading components
 * 
 * Replaces basic ActivityIndicator with:
 * - PulsingDots: Three staggered pulsing dots (teal theme)
 * - SkeletonLine: Shimmer placeholder line
 * - SkeletonCard: Shimmer placeholder card (for notification lists etc.)
 */

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';
import { useTheme } from '../../contexts';

// ============================================================================
// PULSING DOTS
// ============================================================================
interface PulsingDotsProps {
  size?: 'small' | 'medium' | 'large';
  color?: string;
  style?: ViewStyle;
}

const DOT_SIZES = {
  small: { dot: 6, gap: 4 },
  medium: { dot: 10, gap: 6 },
  large: { dot: 14, gap: 8 },
};

export const PulsingDots: React.FC<PulsingDotsProps> = ({ 
  size = 'medium', 
  color = '#0D9488',
  style 
}) => {
  const anims = [
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
  ];

  useEffect(() => {
    const createPulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      );

    const animations = anims.map((a, i) => createPulse(a, i * 150));
    animations.forEach(a => a.start());

    return () => animations.forEach(a => a.stop());
  }, []);

  const { dot, gap } = DOT_SIZES[size];

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(gap) }, style]}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={{
            width: scale(dot),
            height: scale(dot),
            borderRadius: scale(dot / 2),
            backgroundColor: color,
            opacity: anim,
            transform: [{ scale: anim.interpolate({ inputRange: [0.3, 1], outputRange: [0.8, 1.2] }) }],
          }}
        />
      ))}
    </View>
  );
};

// ============================================================================
// SKELETON SHIMMER
// ============================================================================
interface SkeletonLineProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export const SkeletonLine: React.FC<SkeletonLineProps> = ({ 
  width = '100%', 
  height = 14, 
  borderRadius = 6,
  style 
}) => {
  const { isDark } = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const bgColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const highlightColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';

  return (
    <Animated.View
      style={[
        {
          width: (typeof width === 'number' ? scale(width) : width) as any,
          height: verticalScale(height),
          borderRadius: moderateScale(borderRadius),
          backgroundColor: shimmer.interpolate({
            inputRange: [0, 1],
            outputRange: [bgColor, highlightColor],
          }),
        },
        style,
      ]}
    />
  );
};

// ============================================================================
// SKELETON CARD (Notification-style)
// ============================================================================
interface SkeletonCardProps {
  style?: ViewStyle;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({ style }) => {
  const { isDark } = useTheme();

  return (
    <View style={[
      skeletonStyles.card, 
      { 
        backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
        borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
      },
      style,
    ]}>
      {/* Icon placeholder */}
      <SkeletonLine width={40} height={40} borderRadius={20} />
      
      {/* Text content */}
      <View style={{ flex: 1, marginLeft: scale(12), gap: verticalScale(8) }}>
        <SkeletonLine width="70%" height={14} />
        <SkeletonLine width="90%" height={11} />
        <SkeletonLine width="40%" height={10} />
      </View>
    </View>
  );
};

// ============================================================================
// NOTIFICATION SKELETON (Multiple cards)
// ============================================================================
interface NotificationSkeletonProps {
  count?: number;
  style?: ViewStyle;
}

export const NotificationSkeleton: React.FC<NotificationSkeletonProps> = ({ 
  count = 5,
  style 
}) => {
  return (
    <View style={[{ paddingHorizontal: scale(16), paddingTop: verticalScale(12) }, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} style={{ marginBottom: verticalScale(12) }} />
      ))}
    </View>
  );
};

// ============================================================================
// FULL SCREEN LOADING
// ============================================================================
interface FullScreenLoadingProps {
  message?: string;
  color?: string;
}

export const FullScreenLoading: React.FC<FullScreenLoadingProps> = ({ 
  color = '#0D9488' 
}) => {
  const { isDark } = useTheme();

  return (
    <View style={[
      skeletonStyles.fullScreen,
      { backgroundColor: isDark ? '#082020' : '#F8FAFC' }
    ]}>
      <PulsingDots size="large" color={color} />
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================
const skeletonStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: scale(16),
    borderRadius: moderateScale(16),
    borderWidth: 1,
  },
  fullScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default PulsingDots;
