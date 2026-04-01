/**
 * ClassHubSkeleton - Premium shimmer skeleton for MyClassHub loading state
 * 
 * Mirrors the actual layout of the Class Hub screen with staggered
 * fade-in sections for a polished loading experience.
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts';
import { Colors } from '../../../constants';
import { SkeletonLine } from '../../../components/ui/LoadingAnimation';
import { scale, verticalScale, moderateScale } from '../../../utils/responsive';

export const ClassHubSkeleton: React.FC = () => {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();

  // Staggered fade-in for each section
  const sectionAnims = [
    useRef(new Animated.Value(0)).current, // Header
    useRef(new Animated.Value(0)).current, // Traffic Light
    useRef(new Animated.Value(0)).current, // Trends
    useRef(new Animated.Value(0)).current, // Quick Actions
    useRef(new Animated.Value(0)).current, // Absences / Watchlist
  ];

  useEffect(() => {
    const animations = sectionAnims.map((anim, i) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 500,
        delay: i * 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    );
    Animated.stagger(120, animations).start();

    return () => animations.forEach(a => a.stop());
  }, []);

  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.85)';
  const cardBorder = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';

  const SectionWrap = ({ index, children }: { index: number; children: React.ReactNode }) => (
    <Animated.View style={{
      opacity: sectionAnims[index],
      transform: [{
        translateY: sectionAnims[index].interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      }],
    }}>
      {children}
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      {/* Background gradient (matches real screen) */}
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={[Colors.premium.gradientStart, Colors.premium.gradientMid, Colors.premium.gradientEnd]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <View style={[styles.orb, styles.orb1]} />
        <View style={[styles.orb, styles.orb2]} />
      </View>

      <View style={{ flex: 1, paddingTop: insets.top + 20, paddingHorizontal: scale(20) }}>
        {/* 1. Header Skeleton */}
        <SectionWrap index={0}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: verticalScale(24) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(12) }}>
              <SkeletonLine width={44} height={44} borderRadius={14} />
              <View style={{ gap: verticalScale(6) }}>
                <SkeletonLine width={80} height={12} />
                <SkeletonLine width={120} height={28} borderRadius={8} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: scale(12) }}>
              <SkeletonLine width={36} height={36} borderRadius={18} />
              <SkeletonLine width={40} height={40} borderRadius={20} />
            </View>
          </View>
        </SectionWrap>

        {/* 2. Traffic Light Zone Skeleton */}
        <SectionWrap index={1}>
          <View style={{ flexDirection: 'row', gap: scale(12), marginBottom: verticalScale(12) }}>
            <View style={[styles.glassCard, { backgroundColor: cardBg, borderColor: cardBorder, flex: 1 }]}>
              <SkeletonLine width={60} height={10} style={{ marginBottom: verticalScale(8) }} />
              <SkeletonLine width={50} height={32} borderRadius={8} style={{ marginBottom: verticalScale(6) }} />
              <SkeletonLine width="80%" height={8} />
            </View>
            <View style={[styles.glassCard, { backgroundColor: cardBg, borderColor: cardBorder, flex: 1 }]}>
              <SkeletonLine width={60} height={10} style={{ marginBottom: verticalScale(8) }} />
              <SkeletonLine width={50} height={32} borderRadius={8} style={{ marginBottom: verticalScale(6) }} />
              <SkeletonLine width="80%" height={8} />
            </View>
          </View>
          {/* View All Periods button skeleton */}
          <View style={[styles.glassCard, { backgroundColor: cardBg, borderColor: cardBorder, paddingVertical: verticalScale(14), alignItems: 'center', marginBottom: verticalScale(12) }]}>
            <SkeletonLine width={180} height={14} />
          </View>
        </SectionWrap>

        {/* 3. Trends Section Skeleton */}
        <SectionWrap index={2}>
          <View style={[styles.glassCard, { backgroundColor: cardBg, borderColor: cardBorder, marginBottom: verticalScale(16) }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: verticalScale(16) }}>
              <SkeletonLine width={100} height={18} />
              <View style={{ flexDirection: 'row', gap: scale(6) }}>
                <SkeletonLine width={40} height={28} borderRadius={14} />
                <SkeletonLine width={40} height={28} borderRadius={14} />
                <SkeletonLine width={46} height={28} borderRadius={14} />
              </View>
            </View>
            {/* Chart placeholder — bar graph shape */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: verticalScale(100), paddingTop: verticalScale(10) }}>
              {[65, 45, 80, 55, 70, 40, 60].map((h, i) => (
                <SkeletonLine key={i} width={20} height={h} borderRadius={4} />
              ))}
            </View>
          </View>
        </SectionWrap>

        {/* 4. Quick Actions Grid Skeleton */}
        <SectionWrap index={3}>
          <SkeletonLine width={110} height={18} style={{ marginBottom: verticalScale(12) }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(12) }}>
            {[1, 2, 3, 4].map(i => (
              <View key={i} style={[styles.actionSkeleton, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <SkeletonLine width={44} height={44} borderRadius={22} style={{ marginBottom: verticalScale(10) }} />
                <SkeletonLine width={60} height={14} style={{ marginBottom: verticalScale(4) }} />
                <SkeletonLine width={80} height={10} />
              </View>
            ))}
          </View>
        </SectionWrap>

        {/* 5. Watchlist Skeleton */}
        <SectionWrap index={4}>
          <View style={[styles.glassCard, { backgroundColor: cardBg, borderColor: cardBorder, marginTop: verticalScale(24) }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: verticalScale(14) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8) }}>
                <SkeletonLine width={80} height={18} />
                <SkeletonLine width={24} height={20} borderRadius={8} />
              </View>
              <SkeletonLine width={50} height={14} />
            </View>
            {[1, 2, 3].map(i => (
              <View key={i} style={[styles.watchlistSkeleton, { borderColor: cardBorder }]}>
                <SkeletonLine width={32} height={32} borderRadius={16} />
                <View style={{ flex: 1, marginLeft: scale(10), gap: verticalScale(4) }}>
                  <SkeletonLine width="60%" height={14} />
                  <SkeletonLine width="40%" height={10} />
                </View>
                <SkeletonLine width={44} height={28} borderRadius={8} />
              </View>
            ))}
          </View>
        </SectionWrap>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  orb: {
    position: 'absolute',
    borderRadius: moderateScale(200),
  },
  orb1: {
    width: scale(300),
    height: scale(300),
    backgroundColor: 'rgba(61, 220, 151, 0.15)',
    top: verticalScale(-100),
    right: scale(-100),
  },
  orb2: {
    width: scale(250),
    height: scale(250),
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    bottom: verticalScale(200),
    left: scale(-80),
  },
  glassCard: {
    padding: scale(16),
    borderRadius: moderateScale(20),
    borderWidth: 1,
  },
  actionSkeleton: {
    width: '47%',
    padding: scale(18),
    borderRadius: moderateScale(20),
    borderWidth: 1,
  },
  watchlistSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(10),
    borderBottomWidth: 1,
  },
});

export default ClassHubSkeleton;
