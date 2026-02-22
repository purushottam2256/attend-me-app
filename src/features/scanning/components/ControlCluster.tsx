/**
 * ControlCluster - Apple Zen Mode Premium Controls
 * Refined, minimal control interface
 */

import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts';

// Mint Green accent (matches home page)
const COLORS = {
  accent: '#3DDC97',
  surface: 'rgba(255, 255, 255, 0.08)',
  surfaceElevated: 'rgba(255, 255, 255, 0.12)',
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.70)',
  border: 'rgba(255, 255, 255, 0.10)',
};

interface ControlClusterProps {
  timeRemaining: number;
  isScanning: boolean;
  isAutoPilot: boolean;
  endTime?: string;
  currentBatch: 'full' | 'b1' | 'b2';
  onToggleScan: () => void;
  onRescan: () => void;
  onTimerPress: () => void;
  onBatchPress: () => void;
}

export const ControlCluster: React.FC<ControlClusterProps> = ({
  timeRemaining,
  isScanning,
  isAutoPilot,
  endTime,
  currentBatch,
  onToggleScan,
  onRescan,
  onTimerPress,
  onBatchPress,
}) => {
  const { isDark } = useTheme();
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getBatchLabel = () => {
    switch (currentBatch) {
      case 'b1': return 'B1';
      case 'b2': return 'B2';
      default: return 'All';
    }
  };

  const handleRescan = () => {
    Animated.timing(rotateAnim, {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      rotateAnim.setValue(0);
    });
    onRescan();
  };

  const handlePlayPress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.92,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start();
    onToggleScan();
  };

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      {/* Timer Display - Minimal glass */}
      <TouchableOpacity style={styles.timerContainer} onPress={onTimerPress} activeOpacity={0.7}>
        <Ionicons name="timer-outline" size={normalizeFont(15)} color={COLORS.textSecondary} />
        <Text style={styles.timerText}>
          {isAutoPilot ? `Until ${endTime}` : formatTime(timeRemaining)}
        </Text>
      </TouchableOpacity>

      {/* Control Buttons */}
      <View style={styles.controlRow}>
        {/* Rescan */}
        <TouchableOpacity style={styles.controlButton} onPress={handleRescan} activeOpacity={0.7}>
          <Animated.View style={{ transform: [{ rotate: rotation }] }}>
            <Ionicons name="refresh" size={normalizeFont(20)} color={COLORS.textPrimary} />
          </Animated.View>
        </TouchableOpacity>

        {/* Play/Pause - Main CTA */}
        <TouchableOpacity activeOpacity={0.85} onPress={handlePlayPress}>
          <Animated.View style={[styles.playButton, { transform: [{ scale: scaleAnim }] }]}>
            <Ionicons 
              name={isScanning ? 'pause' : 'play'} 
              size={normalizeFont(26)} 
              color="#000000" 
              style={!isScanning && { marginLeft: scale(2) }}
            />
          </Animated.View>
        </TouchableOpacity>

        {/* Batch Selector */}
        <TouchableOpacity 
          style={styles.batchButton} 
          onPress={onBatchPress}
          activeOpacity={0.7}
        >
          <Text style={styles.batchLabel}>{getBatchLabel()}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginTop: verticalScale(24),
    gap: verticalScale(18),
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    backgroundColor: COLORS.surface,
    paddingHorizontal: scale(18),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(14),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  timerText: {
    fontSize: normalizeFont(18),
    fontWeight: '600',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(18),
  },
  controlButton: {
    width: scale(48),
    height: scale(48),
    borderRadius: moderateScale(24),
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  playButton: {
    width: scale(64),
    height: scale(64),
    borderRadius: moderateScale(32),
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: verticalScale(6) },
    shadowOpacity: 0.35,
    shadowRadius: moderateScale(14),
    elevation: 8,
  },
  batchButton: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(14),
    borderRadius: moderateScale(24),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  batchLabel: {
    fontSize: normalizeFont(13),
    fontWeight: '600',
    color: COLORS.textPrimary,
    letterSpacing: 0.5,
  },
});

export default ControlCluster;
