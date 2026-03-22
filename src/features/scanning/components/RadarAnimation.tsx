/**
 * RadarAnimation - Apple Zen Mode Premium Design
 * Minimal, elegant pulsing radar with refined animations
 * Offloaded to Native UI Thread via Reanimated
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withRepeat, 
  withSequence, 
  withDelay, 
  Easing,
  interpolate,
  cancelAnimation
} from 'react-native-reanimated';
import { useTheme } from '../../../contexts';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';

interface RadarAnimationProps {
  detected: number;
  total: number;
  isScanning: boolean;
  isAutoPilot?: boolean;
  size?: number;
  centerImage?: any; // Allow passing an image source
  themeColor?: string; // Allow overriding the main accent color
}

export const RadarAnimation: React.FC<RadarAnimationProps> = ({
  detected,
  total,
  isScanning,
  isAutoPilot = false,
  size: propSize,
  centerImage,
  themeColor,
}) => {
  const { isDark } = useTheme();

  // Reanimated shared values
  const pulse1 = useSharedValue(0);
  const pulse2 = useSharedValue(0);
  const pulse3 = useSharedValue(0);
  const glowPulse = useSharedValue(0);

  // Mint Green accent (matches home page) or custom themeColor
  const effectiveAccent = themeColor || '#3DDC97';
  
  const colors = {
    accent: effectiveAccent,
    accentGlow: themeColor ? 'rgba(255, 255, 255, 0.2)' : 'rgba(61, 220, 151, 0.20)', // White glow if custom theme used (assuming custom is for dark bg)
    accentSubtle: themeColor ? 'rgba(255, 255, 255, 0.1)' : 'rgba(61, 220, 151, 0.08)',
    surface: themeColor ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.08)',
    innerCircle: centerImage ? 'transparent' : (isDark ? '#1C1C1E' : '#FFFFFF'), // Transparent if image
    detectedText: effectiveAccent,
    totalText: themeColor ? 'rgba(255,255,255,0.7)' : (isDark ? 'rgba(255,255,255,0.5)' : '#8E8E93'),
    divider: themeColor ? 'rgba(255,255,255,0.3)' : (isDark ? 'rgba(255,255,255,0.15)' : '#E5E5EA'),
    border: themeColor ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.10)',
  };

  useEffect(() => {
    if (!isScanning) {
      cancelAnimation(pulse1);
      cancelAnimation(pulse2);
      cancelAnimation(pulse3);
      cancelAnimation(glowPulse);
      pulse1.value = 0;
      pulse2.value = 0;
      pulse3.value = 0;
      glowPulse.value = 0;
      return;
    }

    const duration = isAutoPilot ? 3500 : 2500;

    const createPulse = (sharedVal: any, delay: number) => {
      sharedVal.value = 0;
      sharedVal.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(1, { duration, easing: Easing.out(Easing.cubic) }),
            withTiming(0, { duration: 0 }) // Instant reset back to 0
          ),
          -1, // Infinite
          false
        )
      );
    };

    // Subtle glow animation
    glowPulse.value = 0;
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    // Staggered pulsing rings
    createPulse(pulse1, 0);
    createPulse(pulse2, duration / 3);
    createPulse(pulse3, (duration * 2) / 3);

    return () => {
      cancelAnimation(pulse1);
      cancelAnimation(pulse2);
      cancelAnimation(pulse3);
      cancelAnimation(glowPulse);
    };
  }, [isScanning, isAutoPilot, pulse1, pulse2, pulse3, glowPulse]);

  const size = propSize || 200; // Default size if not provided
  const centerSize = size * 0.475; // 95/200
  const innerSize = size * 0.39;   // 78/200
  const glowSize = size * 0.55;    // 110/200
  const ringSize = size * 0.9;     // 180/200

  // Dynamic styles
  const dynamicStyles = {
    container: {
      width: size,
      height: size,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    glow: {
      position: 'absolute' as const,
      width: glowSize,
      height: glowSize,
      borderRadius: glowSize / 2,
    },
    centerCircle: {
      width: centerSize,
      height: centerSize,
      borderRadius: centerSize / 2,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderWidth: 1,
    },
    innerCircle: {
      width: innerSize,
      height: innerSize,
      borderRadius: innerSize / 2,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      shadowOffset: { width: 0, height: verticalScale(4) },
      shadowOpacity: 0.15,
      shadowRadius: moderateScale(12),
      elevation: 6,
    },
  };

  const useRingStyle = (progress: any) => {
    return useAnimatedStyle(() => {
      return {
        width: ringSize,
        height: ringSize,
        borderRadius: ringSize / 2,
        borderColor: colors.accent,
        opacity: interpolate(progress.value, [0, 0.5, 1], [0.6, 0.25, 0]),
        transform: [
          { scale: interpolate(progress.value, [0, 1], [0.5, 1.3]) }
        ]
      };
    });
  };

  const ringStyle1 = useRingStyle(pulse1);
  const ringStyle2 = useRingStyle(pulse2);
  const ringStyle3 = useRingStyle(pulse3);

  const glowAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(glowPulse.value, [0, 1], [0.15, 0.35])
    };
  });

  const percentage = total > 0 ? Math.round((detected / total) * 100) : 0;

  return (
    <View style={dynamicStyles.container}>
      {/* Pulsing rings - more refined/subtle */}
      <Animated.View style={[styles.ring, ringStyle1]} />
      <Animated.View style={[styles.ring, ringStyle2]} />
      <Animated.View style={[styles.ring, ringStyle3]} />

      {/* Subtle glow */}
      <Animated.View style={[
        dynamicStyles.glow, 
        { backgroundColor: colors.accentSubtle },
        glowAnimatedStyle
      ]} />

      {/* Center circle - Apple-style glass effect */}
      <View style={[dynamicStyles.centerCircle, { 
        backgroundColor: colors.surface, 
        borderColor: colors.border 
      }]}>
        <View style={[dynamicStyles.innerCircle, { 
          backgroundColor: centerImage ? (isDark ? '#000' : '#FFF') : colors.innerCircle,
          shadowColor: colors.accent,
          overflow: 'hidden' // Ensure image stays inside
        }]}>
          {centerImage ? (
            <Image 
              source={centerImage} 
              style={{ width: '85%', height: '85%', opacity: 0.9 }} 
              resizeMode="contain" 
            />
          ) : (
            <>
              {/* Counter */}
              <Text style={[styles.detectedCount, { color: colors.detectedText }]}>{detected}</Text>
              <View style={[styles.divider, { backgroundColor: colors.divider }]} />
              <Text style={[styles.totalCount, { color: colors.totalText }]}>{total}</Text>
            </>
          )}
        </View>
      </View>

      {/* Status pill - minimal glass */}
      <View style={[styles.statusPill, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}>
        <View style={[styles.statusDot, isScanning && { backgroundColor: colors.accent }]} />
        <Text style={styles.statusText}>
          {isScanning ? `${percentage}%` : 'Paused'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
  },
  detectedCount: {
    fontSize: normalizeFont(28),
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  divider: {
    width: scale(22),
    height: 1.5,
    marginVertical: verticalScale(3),
    borderRadius: 1,
  },
  totalCount: {
    fontSize: normalizeFont(15),
    fontWeight: '500',
  },
  statusPill: {
    position: 'absolute',
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(5),
    borderRadius: moderateScale(12),
  },
  statusDot: {
    width: scale(5),
    height: scale(5),
    borderRadius: moderateScale(2.5),
    backgroundColor: '#636366',
  },
  statusText: {
    fontSize: normalizeFont(11),
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    letterSpacing: 0.3,
  },
});

export default RadarAnimation;
