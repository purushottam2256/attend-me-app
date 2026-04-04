/**
 * Root Navigator
 * The "Gatekeeper" - manages app-level auth state and navigation
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, AppState as RNAppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './navigationRef';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SplashScreenExpo from 'expo-splash-screen';
import { supabase } from '../config/supabase';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import { SplashScreen } from '@features/core';
import { LoginScreen, ForgotPasswordScreen } from '@features/auth';
import { Colors } from '@constants';
import { signOut, getStoredProfile } from '@services/authService';
import { MainTabNavigator } from './MainTabNavigator';
import { AppPermissionsGate } from './AppPermissionsGate';
import {
  MyClassHubScreen,
  PermissionScreen,
  ManagePermissionsScreen,
  ProjectFeesScreen,
  CumulativeAttendanceScreen,
} from '@features/incharge/screens';
import { ManualEntryScreen } from '@features/scanning/screens/ManualEntryScreen';
import { BeaconDoctorScreen } from '@features/diagnostics/screens/BeaconDoctorScreen';
import { SyncManagerScreen } from '@features/sync/screens/SyncManagerScreen';
import { NotificationScreen } from '@features/notifications/screens/NotificationScreenNew';
import { SwapHistoryScreen } from '@features/swap/screens/SwapHistoryScreen';
import { withSafeScreen } from '@components/withSafeScreen';
import { trackScreen } from '@services/analyticsService';

// Crash-proof all stack screens
const SafeManualEntry = withSafeScreen(ManualEntryScreen, 'ManualEntryScreen');
const SafeBeaconDoctor = withSafeScreen(BeaconDoctorScreen, 'BeaconDoctorScreen');
const SafeSyncManager = withSafeScreen(SyncManagerScreen, 'SyncManagerScreen');
const SafeNotifications = withSafeScreen(NotificationScreen, 'NotificationScreen');
const SafeSwapHistory = withSafeScreen(SwapHistoryScreen, 'SwapHistoryScreen');
const SafePermission = withSafeScreen(PermissionScreen, 'PermissionScreen');
const SafeManagePerms = withSafeScreen(ManagePermissionsScreen, 'ManagePermissionsScreen');
const SafeProjectFees = withSafeScreen(ProjectFeesScreen, 'ProjectFeesScreen');
const SafeCumulativeAttendance = withSafeScreen(CumulativeAttendanceScreen, 'CumulativeAttendanceScreen');
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
  ProjectFees: undefined;
  CumulativeAttendance: { classInfo: any };
  ManualEntry: { 
    classData: {
      id?: string;
      slot_id?: string;
      subject?: { id: string; name: string; code: string };
      target_dept: string;
      target_year: number;
      target_section: string;
      batch?: number | null;
      isSubstitute?: boolean;
      originalFacultyId?: string | null;
    }; 
    existingAttendance?: Map<string, string>; 
    goBackAction?: () => void 
  };
  BeaconDoctor: undefined;
  SyncManager: undefined;
  Notifications: { filter?: 'requests' | 'all' };
  SwapHistory: undefined;
};

// Stacks
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

// Auth Navigator
const AuthNavigator: React.FC<{ onLoginSuccess: (userName: string, role: string) => void }> = ({ onLoginSuccess }) => {
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

// App State Types
type AppState = 'LOADING' | 'SPLASH' | 'AUTH' | 'GATE' | 'MAIN';

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

  // #2 Audit: Refresh Supabase session when app returns from background
  // Prevents silent 401 errors after extended background periods
  useEffect(() => {
    const subscription = RNAppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });
    return () => subscription.remove();
  }, []);

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
      setAppState('GATE'); // Check permissions before MAIN
    } else {
      setAppState('AUTH');
    }
  };

  const handleLoginSuccess = (name: string, role: string) => {
    setUserName(name);
    setUserRole((role as any) || 'faculty');
    setAppState('GATE'); // Go to gate to check permissions
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

  // Permission Gate
  if (appState === 'GATE') {
    return (
      <View style={styles.container} onLayout={onLayoutRootView}>
        <AppPermissionsGate 
          onPermissionsGranted={() => setAppState('MAIN')}
          onLogout={handleLogout}
        />
      </View>
    );
  }

  // Main Navigation

  return (
    <View style={styles.container} onLayout={onLayoutRootView}>
      <NavigationContainer 
        ref={navigationRef}
        onUnhandledAction={(action) => {
          // Swallow unhandled navigation actions instead of crashing
          if (__DEV__) {
            console.warn('[Navigation] Unhandled action:', action);
          }
        }}
        onStateChange={(state) => {
          // Send automatic screen tracking events
          if (!state) return;
          try {
            // BOUNDS CHECK: Ensure index is valid before accessing routes
            const index = state.index ?? 0;
            if (!state.routes || index < 0 || index >= state.routes.length) return;
            const currentRoute = state.routes[index];
            if (currentRoute) {
              const routeName = currentRoute.name;
              // If we are in the 'Main' tab, drill down to find the specific tab
              if (routeName === 'Main' && currentRoute.state) {
                 const tabState = currentRoute.state as any;
                 const tabIndex = tabState.index ?? 0;
                 if (tabState.routes && tabIndex >= 0 && tabIndex < tabState.routes.length) {
                   const tabRoute = tabState.routes[tabIndex];
                   if (tabRoute) {
                     trackScreen(`Tab_${tabRoute.name}`);
                     return;
                   }
                 }
              }
              trackScreen(routeName);
            }
          } catch (e) {
            // Silently fail if navigation state is somehow malformed
          }
        }}
      >
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
            component={SafePermission}
            options={{ presentation: 'modal' }}
          />
          <RootStack.Screen 
            name="ManagePermissions" 
            component={SafeManagePerms}
            options={{ headerShown: false }}
          />
          <RootStack.Screen 
            name="ManualEntry" 
            component={SafeManualEntry}
            options={{ headerShown: false, animation: 'slide_from_bottom' }}
          />
          <RootStack.Screen 
            name="ProjectFees" 
            component={SafeProjectFees}
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <RootStack.Screen 
            name="CumulativeAttendance" 
            component={SafeCumulativeAttendance}
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <RootStack.Screen 
            name="BeaconDoctor" 
            component={SafeBeaconDoctor}
            options={{ headerShown: false }}
          />
          <RootStack.Screen 
            name="SyncManager" 
            component={SafeSyncManager}
            options={{ headerShown: false }}
          />
        <RootStack.Screen 
          name="Notifications" 
          component={SafeNotifications} 
          options={{ animation: 'slide_from_right' }}
        />
        <RootStack.Screen 
          name="SwapHistory" 
          component={SafeSwapHistory} 
          options={{ animation: 'slide_from_right', headerShown: false }}
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
    alignItems: 'center',
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
