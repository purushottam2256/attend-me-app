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
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../config/supabase';

import { useNetwork } from '../../../contexts';
import { SlideToLogin, SlideToLoginRef } from '../../../components/ui';
import { Colors } from '../../../constants';
import { signIn, isBiometricEnabled, getStoredProfile, getCurrentSession } from '../../../services/authService';

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
  const [hasBiometric, setHasBiometric] = useState(false);
  const [biometricType, setBiometricType] = useState<string>('');
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
    checkBiometricAvailability();
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

  const checkBiometricAvailability = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const storedProfile = await getStoredProfile();

      // Biometric only for returning users (who have a stored profile)
      if (compatible && enrolled && storedProfile) {
        setHasBiometric(true);
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricType('Face ID');
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricType('Fingerprint');
        }
      }
    } catch (error) {
      console.error('Biometric check error:', error);
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

  const handleBiometricLogin = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Sign in with ${biometricType}`,
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (result.success) {
        // If Online: Verify valid session with server
        // If Offline: Trust local profile (cache mode)
        if (isOnline) {
            const { data: { user }, error } = await supabase.auth.getUser();
            
            if (error || !user) {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                setError("Session expired. Please log in with password.");
                return;
            }
        }

        const profile = await getStoredProfile();
        if (profile) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onLoginSuccess(profile.full_name || 'User', (profile.role as any) || 'faculty');
        } else {
            setError("Profile not found locally.");
        }
      }
    } catch (error) {
      console.error('Biometric error:', error);
      setError("Biometric authentication failed");
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
                source={require('../../../../assets/college-logo.png')}
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

                  {/* Biometric */}
                  {hasBiometric && (
                    <View style={styles.biometricSection}>
                      <View style={styles.divider}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>or</Text>
                        <View style={styles.dividerLine} />
                      </View>

                      <TouchableOpacity
                        style={styles.biometricButton}
                        onPress={handleBiometricLogin}
                      >
                        <Ionicons 
                          name={biometricType === 'Face ID' ? 'scan-outline' : 'finger-print'} 
                          size={28} 
                          color={Colors.premium.accent} 
                        />
                        <Text style={styles.biometricText}>
                          Use {biometricType}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
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
    width: 300,
    height: 300,
    borderRadius: 150,
    top: -80,
    right: -80,
  },
  orb2: {
    width: 200,
    height: 200,
    borderRadius: 100,
    bottom: 100,
    left: -60,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 16,
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.premium.textPrimary,
    letterSpacing: 1.5,
    marginTop: 16,
  },
  tagline: {
    fontSize: 13,
    color: Colors.premium.textSecondary,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  formCard: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  blur: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  formInner: {
    padding: 24,
    backgroundColor: Colors.premium.surface,
  },
  welcomeText: {
    fontSize: 34,
    fontWeight: '700',
    color: Colors.premium.textPrimary,
    marginBottom: 6,
  },
  subtitleText: {
    fontSize: 17,
    color: Colors.premium.textSecondary,
    marginBottom: 28,
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.premium.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.premium.border,
    paddingHorizontal: 16,
    marginBottom: 16,
    height: 56,
  },
  inputFocused: {
    borderColor: Colors.premium.borderFocus,
    backgroundColor: Colors.premium.surfaceLight,
  },
  inputIcon: {
    fontSize: 16,
    marginRight: 12,
    opacity: 0.7,
  },
  input: {
    flex: 1,
    fontSize: 17,
    color: Colors.premium.textPrimary,
  },
  eyeButton: {
    padding: 8,
  },
  eyeIcon: {
    fontSize: 16,
    opacity: 0.7,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotText: {
    fontSize: 15,
    color: Colors.premium.accent,
    fontWeight: '500',
  },
  sliderWrapper: {
    marginBottom: 16,
  },
  biometricSection: {
    marginTop: 8,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.premium.border,
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 12,
    color: Colors.premium.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.premium.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.premium.border,
    paddingVertical: 14,
  },
  biometricIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  biometricText: {
    fontSize: 14,
    color: Colors.premium.textSecondary,
    fontWeight: '500',
  },
  footer: {
    alignItems: 'center',
    marginTop: 32,
    paddingBottom: 20,
  },
  footerText: {
    fontSize: 11,
    color: Colors.premium.textMuted,
    letterSpacing: 0.5,
  },
});

export default LoginScreen;
