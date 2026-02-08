/**
 * RadarAnimation - Apple Zen Mode Premium Design
 * Minimal, elegant pulsing radar with refined animations
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Image } from 'react-native';
import { useTheme } from '../../../contexts';

interface RadarAnimationProps {
  detected: number;
  total: number;
  isScanning: boolean;
  detected: number;
  total: number;
  isScanning: boolean;
  isAutoPilot?: boolean;
  centerImage?: any; // Allow passing an image source
}

export const RadarAnimation: React.FC<RadarAnimationProps> = ({
  detected,
  total,
  isScanning,
  detected,
  total,
  isScanning,
  isAutoPilot = false,
  centerImage,
}) => {
  const { isDark } = useTheme();
  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const pulse3 = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;

  // Mint Green accent (matches home page)
  const colors = {
    accent: '#3DDC97',
    accentGlow: 'rgba(61, 220, 151, 0.20)',
    accentSubtle: 'rgba(61, 220, 151, 0.08)',
    surface: 'rgba(255, 255, 255, 0.08)',
    innerCircle: isDark ? '#1C1C1E' : '#FFFFFF',
    detectedText: '#3DDC97',
    totalText: isDark ? 'rgba(255,255,255,0.5)' : '#8E8E93',
    divider: isDark ? 'rgba(255,255,255,0.15)' : '#E5E5EA',
    border: 'rgba(255, 255, 255, 0.10)',
  };

  useEffect(() => {
    if (!isScanning) {
      pulse1.setValue(0);
      pulse2.setValue(0);
      pulse3.setValue(0);
      return;
    }

    const duration = isAutoPilot ? 3500 : 2500;

    const createPulse = (anim: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
    };

    // Subtle glow animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    const animations = Animated.parallel([
      createPulse(pulse1, 0),
      createPulse(pulse2, duration / 3),
      createPulse(pulse3, (duration * 2) / 3),
    ]);

    animations.start();

    return () => animations.stop();
  }, [isScanning, isAutoPilot, pulse1, pulse2, pulse3, glowPulse]);

  const createRingStyle = (anim: Animated.Value, baseSize: number) => ({
    width: baseSize,
    height: baseSize,
    borderRadius: baseSize / 2,
    borderColor: colors.accent,
    opacity: anim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0.6, 0.25, 0],
    }),
    transform: [
      {
        scale: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.5, 1.3],
        }),
      },
    ],
  });

  const percentage = total > 0 ? Math.round((detected / total) * 100) : 0;

  const glowOpacity = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.15, 0.35],
  });

  return (
    <View style={styles.container}>
      {/* Pulsing rings - more refined/subtle */}
      <Animated.View style={[styles.ring, createRingStyle(pulse1, 180)]} />
      <Animated.View style={[styles.ring, createRingStyle(pulse2, 180)]} />
      <Animated.View style={[styles.ring, createRingStyle(pulse3, 180)]} />

      {/* Subtle glow */}
      <Animated.View style={[
        styles.glow, 
        { backgroundColor: colors.accentSubtle, opacity: glowOpacity }
      ]} />

      {/* Center circle - Apple-style glass effect */}
      <View style={[styles.centerCircle, { 
        backgroundColor: colors.surface, 
        borderColor: colors.border 
      }]}>
        <View style={[styles.innerCircle, { 
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
  container: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
  },
  glow: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  centerCircle: {
    width: 95,
    height: 95,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  innerCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  detectedCount: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  divider: {
    width: 22,
    height: 1.5,
    marginVertical: 3,
    borderRadius: 1,
  },
  totalCount: {
    fontSize: 15,
    fontWeight: '500',
  },
  statusPill: {
    position: 'absolute',
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,

  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#636366',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    letterSpacing: 0.3,
  },
});

export default RadarAnimation;
