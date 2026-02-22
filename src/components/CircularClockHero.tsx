/**
 * CircularClockHero - Premium "Floating Lens" Live Class Card
 * 
 * Clean, minimal design with:
 * - Glowing circular progress ring
 * - Large centered time display
 * - Class info below
 * - Slide-to-start action
 */

import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  TouchableOpacity,
  Dimensions,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from '@react-navigation/native';
import { useTheme } from '../contexts';
import { scale, verticalScale, moderateScale, normalizeFont } from '../utils/responsive';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const RING_SIZE = moderateScale(140);
const STROKE_WIDTH = scale(8);
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface CircularClockHeroRef {
  reset: () => void;
}

interface CircularClockHeroProps {
  subjectName: string;
  section: string;
  startTime: string;
  endTime: string;
  progress: number;
  onSlideComplete: () => void;
  onManualEntry: () => void;
}

export const CircularClockHero = forwardRef<CircularClockHeroRef, CircularClockHeroProps>(({
  subjectName,
  section,
  startTime,
  endTime,
  progress,
  onSlideComplete,
  onManualEntry,
}, ref) => {
  const { isDark } = useTheme();
  const isFocused = useIsFocused();
  const glowAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Slider state
  const sliderX = useRef(new Animated.Value(0)).current;
  const [sliderCompleted, setSliderCompleted] = useState(false);
  const [sliderMaxWidth, setSliderMaxWidth] = useState(scale(200));
  const thumbWidth = scale(48);
  const maxSlide = sliderMaxWidth - thumbWidth - 8;

  useImperativeHandle(ref, () => ({
    reset: () => {
      sliderX.setValue(0);
      setSliderCompleted(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  }));

  // Update time (only when focused)
  useEffect(() => {
    if (!isFocused) return;
    setCurrentTime(new Date()); // Update immediately on focus
    const interval = setInterval(() => setCurrentTime(new Date()), 60000); 
    return () => clearInterval(interval);
  }, [isFocused]);

  // Subtle glow pulse (only when focused)
  useEffect(() => {
    let anim: Animated.CompositeAnimation;
    if (isFocused) {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      anim.start();
    } else {
      glowAnim.setValue(0); // Reset
    }
    return () => anim?.stop();
  }, [glowAnim, isFocused]);

  // Subtle pulse animation for clock ring (only when focused)
  useEffect(() => {
    let anim: Animated.CompositeAnimation;
    if (isFocused) {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.03,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      anim.start();
    } else {
      pulseAnim.setValue(1); // Reset
    }
    return () => anim?.stop();
  }, [pulseAnim, isFocused]);

  const strokeDashoffset = CIRCUMFERENCE - (progress / 100) * CIRCUMFERENCE;

  // Slider handling
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !sliderCompleted,
      onMoveShouldSetPanResponder: () => !sliderCompleted,
      onPanResponderGrant: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onPanResponderMove: (_, gestureState) => {
        const newX = Math.max(0, Math.min(gestureState.dx, maxSlide));
        sliderX.setValue(newX);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx >= maxSlide * 0.85) {
          Animated.spring(sliderX, {
            toValue: maxSlide,
            useNativeDriver: false,
          }).start(() => {
            setSliderCompleted(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onSlideComplete();
          });
        } else {
          Animated.spring(sliderX, {
            toValue: 0,
            useNativeDriver: false,
            friction: 5,
          }).start();
        }
      },
    })
  ).current;

  const sliderTextOpacity = sliderX.interpolate({
    inputRange: [0, maxSlide * 0.3],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const timeRemaining = Math.round((100 - progress) * 50 / 100);

  // Theme colors
  const colors = {
    cardBg: isDark ? '#082020' : '#FFFFFF',
    cardBorder: isDark ? 'rgba(61, 220, 151, 0.2)' : 'rgba(0,0,0,0.08)',
    ringBg: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(13, 74, 74, 0.1)',
    ringProgress: '#3DDC97',
    textPrimary: isDark ? '#FFFFFF' : '#0F172A',
    textSecondary: isDark ? 'rgba(255,255,255,0.7)' : '#64748B',
    textMuted: isDark ? 'rgba(255,255,255,0.5)' : '#94A3B8',
    accent: '#3DDC97',
    sliderBg: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(13, 74, 74, 0.08)',
    glow: 'rgba(61, 220, 151, 0.4)',
  };

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.6],
  });

  return (
    <View style={styles.container}>
      {/* Main Card */}
      <View style={[styles.card, { 
        backgroundColor: colors.cardBg,
        borderColor: colors.cardBorder,
        shadowColor: isDark ? colors.accent : '#000',
      }]}>
        
        {/* Header Row */}
        <View style={styles.headerRow}>
          <View style={styles.liveIndicator}>
            <View style={[styles.liveDot, { backgroundColor: colors.accent }]} />
            <Text style={[styles.liveText, { color: colors.accent }]}>LIVE NOW</Text>
          </View>
          <Text style={[styles.timeRange, { color: colors.textMuted }]}>
            {startTime} - {endTime}
          </Text>
        </View>

        {/* Clock Circle */}
        <View style={styles.clockSection}>
          {/* Glow effect */}
          <Animated.View style={[styles.glowRing, { 
            opacity: glowOpacity,
            borderColor: colors.glow,
          }]} />
          
          {/* SVG Ring with pulse */}
          <Animated.View style={[styles.ringContainer, { transform: [{ scale: pulseAnim }] }]}>
            <Svg width={RING_SIZE} height={RING_SIZE}>
              <Defs>
                <SvgGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor="#3DDC97" />
                  <Stop offset="100%" stopColor="#0D9488" />
                </SvgGradient>
              </Defs>
              {/* Background ring */}
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RADIUS}
                stroke={colors.ringBg}
                strokeWidth={STROKE_WIDTH}
                fill="transparent"
              />
              {/* Progress ring */}
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RADIUS}
                stroke="url(#ringGrad)"
                strokeWidth={STROKE_WIDTH}
                fill="transparent"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
              />
            </Svg>
            
            {/* Center content */}
            <View style={styles.clockCenter}>
              <Text style={[styles.clockTime, { color: colors.textPrimary }]}>
                {formatTime(currentTime)}
              </Text>
              <Text style={[styles.clockProgress, { color: colors.accent }]}>
                {Math.round(progress)}% • {timeRemaining}m left
              </Text>
            </View>
          </Animated.View>
        </View>

        {/* Class Info */}
        <View style={styles.classInfo}>
          <Text style={[styles.subjectName, { color: colors.textPrimary }]} numberOfLines={1}>
            {subjectName}
          </Text>
          <Text style={[styles.sectionText, { color: colors.textSecondary }]}>
            {section}
          </Text>
        </View>

        {/* Action Row */}
        <View style={styles.actionRow}>
          {/* Slide to Start */}
          <View 
            style={[styles.slider, { backgroundColor: colors.sliderBg }]}
            onLayout={(e) => setSliderMaxWidth(e.nativeEvent.layout.width)}
          >
            <Animated.Text style={[styles.sliderText, { 
              color: colors.textMuted,
              opacity: sliderTextOpacity,
            }]}>
              Slide to Scan
            </Animated.Text>
            
            <Animated.View
              style={[styles.sliderThumb, { transform: [{ translateX: sliderX }] }]}
              {...panResponder.panHandlers}
            >
              <LinearGradient
                colors={['#3DDC97', '#0D9488']}
                style={styles.thumbGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
              <Ionicons name="chevron-forward" size={normalizeFont(24)} color="#FFF" />
              </LinearGradient>
            </Animated.View>
          </View>

          {/* Manual Entry */}
          <TouchableOpacity 
            style={[styles.manualBtn, { backgroundColor: colors.sliderBg }]}
            onPress={onManualEntry}
            activeOpacity={0.8}
          >
            <Ionicons name="create-outline" size={normalizeFont(22)} color={colors.accent} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginHorizontal: scale(16),
    marginBottom: verticalScale(16),
  },
  card: {
    borderRadius: moderateScale(24),
    padding: scale(20),
    borderWidth: 1,
    shadowOffset: { width: 0, height: verticalScale(8) },
    shadowOpacity: 0.15,
    shadowRadius: moderateScale(24),
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(16),
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: scale(8),
    height: scale(8),
    borderRadius: moderateScale(4),
    marginRight: scale(6),
  },
  liveText: {
    fontSize: normalizeFont(12),
    fontWeight: '700',
    letterSpacing: 1,
  },
  timeRange: {
    fontSize: normalizeFont(12),
    fontWeight: '500',
  },
  clockSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: verticalScale(12),
  },
  glowRing: {
    position: 'absolute',
    width: RING_SIZE + scale(30),
    height: RING_SIZE + scale(30),
    borderRadius: (RING_SIZE + scale(30)) / 2,
    borderWidth: scale(3),
  },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  clockTime: {
    fontSize: normalizeFont(28),
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  clockProgress: {
    fontSize: normalizeFont(12),
    fontWeight: '600',
    marginTop: verticalScale(2),
  },
  classInfo: {
    alignItems: 'center',
    marginTop: verticalScale(8),
    marginBottom: verticalScale(16),
  },
  subjectName: {
    fontSize: normalizeFont(18),
    fontWeight: '700',
    textAlign: 'center',
  },
  sectionText: {
    fontSize: normalizeFont(13),
    fontWeight: '500',
    marginTop: verticalScale(2),
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
  },
  slider: {
    flex: 1,
    height: verticalScale(52),
    borderRadius: moderateScale(26),
    justifyContent: 'center',
    paddingHorizontal: scale(4),
    overflow: 'hidden',
  },
  sliderText: {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    fontSize: normalizeFont(14),
    fontWeight: '600',
  },
  sliderThumb: {
    width: scale(48),
    height: scale(48),
    borderRadius: moderateScale(24),
    overflow: 'hidden',
  },
  thumbGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualBtn: {
    width: scale(52),
    height: scale(52),
    borderRadius: moderateScale(26),
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default CircularClockHero;
