/**
 * Premium Login Screen
 * Minimal, polished, designer-quality with glassmorphism
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Dimensions,
  TextInput,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@config/supabase';

import { useNetwork } from '@contexts';
import { SlideToLogin, SlideToLoginRef } from '@components/ui';
import { Colors } from '@constants';
import { signIn, isBiometricEnabled, getStoredProfile, getCurrentSession } from '@services/authService';
import { scale, verticalScale, moderateScale, normalizeFont } from '@utils/responsive';

const { width, height } = Dimensions.get('window');

interface LoginScreenProps {
  onLoginSuccess: (userName: string, role: string) => void;
  onForgotPassword: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  onForgotPassword,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const { isOnline, queueAction } = useNetwork();
  const sliderRef = useRef<SlideToLoginRef>(null);

  // Animations
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formSlide = useRef(new Animated.Value(40)).current;
  const passwordOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    startEntryAnimation();
    loadLastEmail();
  }, []);

  const startEntryAnimation = () => {
    // Logo fade in and scale
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // Form slides up
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(formOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(formSlide, {
          toValue: 0,
          friction: 8,
          tension: 50,
          useNativeDriver: true,
        }),
      ]).start();
    }, 300);
  };

  const loadLastEmail = async () => {
    try {
      const savedEmail = await AsyncStorage.getItem('last_email');
      if (savedEmail) setEmail(savedEmail);
    } catch (e) {
      console.log('Failed to load email');
    }
  };



  const togglePasswordVisibility = () => {
    Animated.sequence([
      Animated.timing(passwordOpacity, { toValue: 0.5, duration: 100, useNativeDriver: true }),
      Animated.timing(passwordOpacity, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    setShowPassword(!showPassword);
  };

  const handleSlideComplete = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your credentials');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      sliderRef.current?.reset();
      return;
    }

    if (!isOnline) {
      setError('You are offline. Login will proceed when connected.');
      sliderRef.current?.reset();
      queueAction(performLogin, 'Logging in');
      return;
    }

    await performLogin();
  };

  const performLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { user, error: loginError } = await signIn(email.trim(), password);
      
      if (loginError) {
        setError(loginError);
        sliderRef.current?.reset();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (user) {
        await AsyncStorage.setItem('last_email', email.trim());
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onLoginSuccess(user.full_name || email.split('@')[0], user.role || 'faculty');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
      sliderRef.current?.reset();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <View style={styles.container}>
      {/* Background Gradient */}
      <LinearGradient
        colors={[
          Colors.premium.gradientStart,
          Colors.premium.gradientMid,
          Colors.premium.gradientEnd,
        ]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Decorative Orbs */}
      <View style={[styles.orb, styles.orb1]} />
      <View style={[styles.orb, styles.orb2]} />

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Logo Section */}
            <Animated.View
              style={[
                styles.logoSection,
                {
                  opacity: logoOpacity,
                  transform: [{ scale: logoScale }],
                },
              ]}
            >
              <Image
                source={require('@assets/college-logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
              <Text style={styles.appName}>Attend-Me</Text>
              <Text style={styles.tagline}>Your Attendance, Simplified</Text>
            </Animated.View>

            {/* Form Card */}
            <Animated.View
              style={[
                styles.formCard,
                {
                  opacity: formOpacity,
                  transform: [{ translateY: formSlide }],
                },
              ]}
            >
              <BlurView intensity={25} tint="dark" style={styles.blur}>
                <View style={styles.formInner}>
                  {/* Welcome Text */}
                  <Text style={styles.welcomeText}>Welcome back</Text>
                  <Text style={styles.subtitleText}>Sign in to continue</Text>

                  {/* Error Message */}
                  {error && (
                    <View style={styles.errorContainer}>
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  )}

                  {/* Email Input */}
                  <View
                    style={[
                      styles.inputContainer,
                      focusedField === 'email' && styles.inputFocused,
                    ]}
                  >
                    <Text style={styles.inputIcon}>✉</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Email address"
                      placeholderTextColor={Colors.premium.textMuted}
                      value={email}
                      onChangeText={(text) => {
                        setEmail(text);
                        setError(null);
                      }}
                      keyboardType="email-address"
                      textContentType="emailAddress"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect={false}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                    />
                  </View>

                  {/* Password Input */}
                  <View
                    style={[
                      styles.inputContainer,
                      focusedField === 'password' && styles.inputFocused,
                    ]}
                  >
                    <Text style={styles.inputIcon}>🔒</Text>
                    <Animated.View style={{ flex: 1, opacity: passwordOpacity }}>
                      <TextInput
                        style={styles.input}
                        placeholder="Password"
                        placeholderTextColor={Colors.premium.textMuted}
                        value={password}
                        onChangeText={(text) => {
                          setPassword(text);
                          setError(null);
                        }}
                        secureTextEntry={!showPassword}
                        onFocus={() => setFocusedField('password')}
                        onBlur={() => setFocusedField(null)}
                      />
                    </Animated.View>
                    <TouchableOpacity onPress={togglePasswordVisibility} style={styles.eyeButton}>
                      <Text style={styles.eyeIcon}>{showPassword ? '👁' : '👁‍🗨'}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Forgot Password */}
                  <TouchableOpacity onPress={onForgotPassword} style={styles.forgotButton}>
                    <Text style={styles.forgotText}>Forgot password?</Text>
                  </TouchableOpacity>

                  {/* Slide to Login */}
                  <View style={styles.sliderWrapper}>
                    <SlideToLogin
                      ref={sliderRef}
                      onSlideComplete={handleSlideComplete}
                      isLoading={isLoading}
                      disabled={!email.trim() || !password.trim()}
                    />
                  </View>


                </View>
              </BlurView>
            </Animated.View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>MRCE Attend-Me • v1.0.0</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  orb: {
    position: 'absolute',
    backgroundColor: Colors.premium.accent,
    opacity: 0.08,
  },
  orb1: {
    width: scale(300),
    height: scale(300),
    borderRadius: moderateScale(150),
    top: verticalScale(-80),
    right: scale(-80),
  },
  orb2: {
    width: scale(200),
    height: scale(200),
    borderRadius: moderateScale(100),
    bottom: verticalScale(100),
    left: scale(-60),
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: scale(24),
    justifyContent: 'center',
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: verticalScale(32),
  },
  logo: {
    width: scale(80),
    height: scale(80),
    borderRadius: moderateScale(16),
  },
  appName: {
    fontSize: normalizeFont(28),
    fontWeight: '700',
    color: Colors.premium.textPrimary,
    letterSpacing: 1.5,
    marginTop: verticalScale(16),
  },
  tagline: {
    fontSize: normalizeFont(13),
    color: Colors.premium.textSecondary,
    marginTop: verticalScale(4),
    letterSpacing: 0.5,
  },
  formCard: {
    borderRadius: moderateScale(24),
    overflow: 'hidden',
  },
  blur: {
    borderRadius: moderateScale(24),
    overflow: 'hidden',
  },
  formInner: {
    padding: scale(24),
    backgroundColor: Colors.premium.surface,
  },
  welcomeText: {
    fontSize: normalizeFont(34),
    fontWeight: '700',
    color: Colors.premium.textPrimary,
    marginBottom: verticalScale(6),
  },
  subtitleText: {
    fontSize: normalizeFont(17),
    color: Colors.premium.textSecondary,
    marginBottom: verticalScale(28),
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: moderateScale(12),
    padding: scale(12),
    marginBottom: verticalScale(16),
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: normalizeFont(13),
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.premium.surface,
    borderRadius: moderateScale(14),
    borderWidth: 1,
    borderColor: Colors.premium.border,
    paddingHorizontal: scale(16),
    marginBottom: verticalScale(16),
    height: verticalScale(56),
  },
  inputFocused: {
    borderColor: Colors.premium.borderFocus,
    backgroundColor: Colors.premium.surfaceLight,
  },
  inputIcon: {
    fontSize: normalizeFont(16),
    marginRight: scale(12),
    opacity: 0.7,
  },
  input: {
    flex: 1,
    fontSize: normalizeFont(17),
    color: Colors.premium.textPrimary,
  },
  eyeButton: {
    padding: scale(8),
  },
  eyeIcon: {
    fontSize: normalizeFont(16),
    opacity: 0.7,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginBottom: verticalScale(24),
  },
  forgotText: {
    fontSize: normalizeFont(15),
    color: Colors.premium.accent,
    fontWeight: '500',
  },
  sliderWrapper: {
    marginBottom: verticalScale(16),
  },
  footer: {
    alignItems: 'center',
    marginTop: verticalScale(32),
    paddingBottom: verticalScale(20),
  },
  footerText: {
    fontSize: normalizeFont(11),
    color: Colors.premium.textMuted,
    letterSpacing: 0.5,
  },
});

export default LoginScreen;
