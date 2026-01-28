/**
 * Root Navigator
 * The "Gatekeeper" - manages app-level auth state and navigation
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SplashScreenExpo from 'expo-splash-screen';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import { SplashScreen } from '../screens/SplashScreen';
import { LoginScreen, ForgotPasswordScreen } from '../features/auth';
import { Colors } from '../constants';
import { signOut, getStoredProfile } from '../services/authService';
import { MainTabNavigator } from './MainTabNavigator';
import {
  MyClassHubScreen,
  PermissionScreen,
  ManagePermissionsScreen,
} from '../features/incharge/screens';

// Keep native splash screen visible
SplashScreenExpo.preventAutoHideAsync();

// Navigation types
export type AuthStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  LoginSuccess: undefined;
  Main: undefined;
  Permission: undefined;
  ManagePermissions: undefined;
};

// Stacks
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

// Auth Navigator
const AuthNavigator: React.FC<{ onLoginSuccess: (userName: string) => void }> = ({ onLoginSuccess }) => {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <AuthStack.Screen name="Login">
        {(props) => (
          <LoginScreen
            {...props}
            onLoginSuccess={onLoginSuccess}
            onForgotPassword={() => props.navigation.navigate('ForgotPassword')}
          />
        )}
      </AuthStack.Screen>
      <AuthStack.Screen name="ForgotPassword">
        {(props) => (
          <ForgotPasswordScreen
            {...props}
            onBack={() => props.navigation.goBack()}
            onSuccess={() => props.navigation.navigate('Login')}
          />
        )}
      </AuthStack.Screen>
    </AuthStack.Navigator>
  );
};

// DashboardPlaceholder removed - using MainTabNavigator now

// App State Types
type AppState = 'LOADING' | 'SPLASH' | 'AUTH' | 'MAIN';

export const RootNavigator: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('LOADING');
  const [userName, setUserName] = useState<string>('User');
  const [userRole, setUserRole] = useState<'faculty' | 'class_incharge' | 'lab_incharge' | 'hod' | 'management'>('faculty');
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      setAppState('SPLASH');
    }
  }, [fontsLoaded]);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreenExpo.hideAsync();
    }
  }, [fontsLoaded]);

  const handleSplashFinish = async (isAuthenticated: boolean) => {
    if (isAuthenticated) {
      // Get stored profile to show user name and role
      const profile = await getStoredProfile();
      if (profile) {
        setUserName(profile.full_name || 'User');
        setUserRole((profile.role as any) || 'faculty');
      }
      setAppState('MAIN');
    } else {
      setAppState('AUTH');
    }
  };

  const handleLoginSuccess = (name: string) => {
    setUserName(name);
    setAppState('MAIN'); // Go directly to main dashboard
  };

  const handleLogout = async () => {
    await signOut();
    setAppState('AUTH');
  };

  // Loading state
  if (appState === 'LOADING') {
    return null;
  }

  // Custom Splash Screen
  if (appState === 'SPLASH') {
    return (
      <View style={styles.container} onLayout={onLayoutRootView}>
        <SplashScreen onFinish={handleSplashFinish} />
      </View>
    );
  }

  // Main Navigation

  return (
    <View style={styles.container} onLayout={onLayoutRootView}>
      <NavigationContainer>
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          {appState === 'AUTH' ? (
            <RootStack.Screen name="Auth">
              {() => <AuthNavigator onLoginSuccess={handleLoginSuccess} />}
            </RootStack.Screen>
          ) : (
            <RootStack.Screen name="Main">
              {() => <MainTabNavigator userName={userName} userRole={userRole} onLogout={handleLogout} />}
            </RootStack.Screen>
          )}
          <RootStack.Screen 
            name="Permission" 
            component={PermissionScreen}
            options={{ presentation: 'modal' }}
          />
          <RootStack.Screen 
            name="ManagePermissions" 
            component={ManagePermissionsScreen}
            options={{ headerShown: false }}
          />
        </RootStack.Navigator>
      </NavigationContainer>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neutral.background,
  },
  dashboardContainer: {
    flex: 1,
    backgroundColor: Colors.neutral.background,
  },
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: Colors.primary.main,
  },
  welcomeHeaderText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  logoutIcon: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
  },
  dashboardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholderCard: {
    backgroundColor: '#fff',
    padding: 40,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  placeholderEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  placeholderTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.neutral.textDark,
    marginBottom: 8,
  },
  placeholderSubtitle: {
    fontSize: 14,
    color: Colors.neutral.textLight,
  },
});

export default RootNavigator;
