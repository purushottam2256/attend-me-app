/**
 * ProgressRing - Pure React Native Circular Progress Indicator
 * Uses View-based approach without react-native-svg
 * Apple-inspired design with smooth animations
 * Offloaded to Native UI Thread via Reanimated
 */

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withRepeat, 
  Easing,
  interpolate,
  cancelAnimation
} from 'react-native-reanimated';
import { scale, moderateScale } from '../utils/responsive';

interface ProgressRingProps {
  progress: number; // 0-100
  size?: number;
  strokeWidth?: number;
  backgroundColor?: string;
  progressColor?: string;
  children?: React.ReactNode;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  progress,
  size = moderateScale(120),
  strokeWidth = scale(8),
  backgroundColor = 'rgba(255,255,255,0.15)',
  progressColor = '#3DDC97',
  children,
}) => {
  const animatedValue = useSharedValue(0);
  const rotation = useSharedValue(0);

  useEffect(() => {
    animatedValue.value = withTiming(progress, {
      duration: 800,
      easing: Easing.out(Easing.cubic)
    });
  }, [progress, animatedValue]);

  // Create a rotating effect for visual progress
  useEffect(() => {
    rotation.value = 0;
    rotation.value = withRepeat(
      withTiming(1, {
        duration: 2000,
        easing: Easing.linear
      }),
      -1,
      false
    );
    
    return () => cancelAnimation(rotation);
  }, [rotation]);

  const spinStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { rotate: `${rotation.value * 360}deg` }
      ]
    };
  });

  const glowStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        animatedValue.value,
        [0, 50, 100],
        [0.2, 0.4, 0.6]
      )
    };
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Background Circle */}
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: backgroundColor,
          },
        ]}
      />
      
      {/* Progress Arc - Using multiple segments for visual effect */}
      <Animated.View
        style={[
          styles.progressContainer,
          {
            width: size,
            height: size,
          },
          spinStyle
        ]}
      >
        {/* Progress indicator dots */}
        {[...Array(12)].map((_, i) => {
          const angle = (i * 30 * Math.PI) / 180;
          const radius = (size - strokeWidth) / 2;
          const x = radius * Math.cos(angle) + size / 2 - scale(4);
          const y = radius * Math.sin(angle) + size / 2 - scale(4);
          const shouldShow = (i / 12) * 100 <= progress;
          
          return (
            <View
              key={i}
              style={[
                styles.progressDot,
                {
                  left: x,
                  top: y,
                  backgroundColor: shouldShow ? progressColor : backgroundColor,
                  opacity: shouldShow ? 1 : 0.3,
                },
              ]}
            />
          );
        })}
      </Animated.View>

      {/* Animated glow ring */}
      <Animated.View
        style={[
          styles.glowRing,
          {
            width: size + scale(8),
            height: size + scale(8),
            borderRadius: (size + scale(8)) / 2,
            borderWidth: 2,
            borderColor: progressColor,
          },
          glowStyle
        ]}
      />
      
      {/* Center Content */}
      <View style={styles.centerContent}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  circle: {
    position: 'absolute',
  },
  progressContainer: {
    position: 'absolute',
  },
  progressDot: {
    position: 'absolute',
    width: scale(8),
    height: scale(8),
    borderRadius: moderateScale(4),
  },
  glowRing: {
    position: 'absolute',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ProgressRing;
