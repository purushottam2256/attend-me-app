/**
 * Splash Screen
 * Original design with premium polish - ripple effects emanating from logo
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts, Layout } from '@constants';
import { getCurrentSession, getStoredProfile } from '@services/authService';

const { width } = Dimensions.get('window');

interface SplashScreenProps {
  onFinish: (isAuthenticated: boolean) => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [statusText, setStatusText] = useState('Initializing...');
  
  // Animation values
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const ripple1 = useRef(new Animated.Value(0)).current;
  const ripple2 = useRef(new Animated.Value(0)).current;
  const ripple3 = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    startAnimations();
    checkAuthWithDelay();
  }, []);

  const startAnimations = () => {
    // Logo fade in and scale
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // Text fade in
    setTimeout(() => {
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
    }, 400);

    // Ripple animations - staggered loop
    const createRipple = (anim: Animated.Value, delay: number) => {
      const animate = () => {
        anim.setValue(0);
        Animated.timing(anim, {
          toValue: 1,
          duration: 2000,
          delay,
          useNativeDriver: true,
        }).start(() => animate());
      };
      animate();
    };

    createRipple(ripple1, 0);
    createRipple(ripple2, 600);
    createRipple(ripple3, 1200);
  };

  const checkAuthWithDelay = async () => {
    const minDuration = 5500;
    const startTime = Date.now();

    // Status messages
    setTimeout(() => setStatusText('Loading resources...'), 1500);
    setTimeout(() => setStatusText('Checking authentication...'), 3000);
    setTimeout(() => setStatusText('Almost ready...'), 4500);

    try {
      const session = await getCurrentSession();
      const profile = await getStoredProfile();

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, minDuration - elapsed);

      setTimeout(() => {
        onFinish(!!session && !!profile);
      }, remaining);
    } catch (error) {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, minDuration - elapsed);
      setTimeout(() => onFinish(false), remaining);
    }
  };

  const getRippleStyle = (ripple: Animated.Value) => ({
    transform: [
      {
        scale: ripple.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 2.5],
        }),
      },
    ],
    opacity: ripple.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0.6, 0.3, 0],
    }),
  });

  return (
    <LinearGradient
      colors={[Colors.premium.gradientStart, Colors.premium.gradientMid, Colors.premium.gradientEnd]}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      {/* Ripple Effects */}
      <View style={styles.rippleContainer}>
        <Animated.View style={[styles.ripple, getRippleStyle(ripple1)]} />
        <Animated.View style={[styles.ripple, getRippleStyle(ripple2)]} />
        <Animated.View style={[styles.ripple, getRippleStyle(ripple3)]} />
      </View>

      {/* Logo */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          },
        ]}
      >
        <View style={styles.logoGlow} />
        <Image
          source={require('@assets/splash.png')}
          style={[styles.logo, { borderRadius: 100 }]} // Added border radius for round icon
          resizeMode="contain"
        />
      </Animated.View>

      {/* Status Text */}
      <Animated.View style={[styles.statusContainer, { opacity: textOpacity }]}>
        <Text style={styles.statusText}>{statusText}</Text>
      </Animated.View>

      {/* Version */}
      <Text style={styles.versionText}>v1.0.0</Text>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rippleContainer: {
    position: 'absolute',
    width: width * 0.6,
    height: width * 0.6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ripple: {
    position: 'absolute',
    width: width * 0.5,
    height: width * 0.5,
    borderRadius: width * 0.25,
    borderWidth: 2,
    borderColor: Colors.premium.accent,
  },
  logoContainer: {
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Colors.premium.accentGlow,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 24,
  },
  statusContainer: {
    position: 'absolute',
    bottom: 120,
  },
  statusText: {
    fontSize: 16,
    color: Colors.premium.textSecondary,
    letterSpacing: 0.5,
  },
  versionText: {
    position: 'absolute',
    bottom: 50,
    fontSize: 13,
    color: Colors.premium.textMuted,
    letterSpacing: 1,
  },
});

export default SplashScreen;
