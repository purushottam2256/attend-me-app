import { Fonts } from '../constants';
/**
 * Main Tab Navigator with Floating Dock
 * 
 * Features:
 * - Floating dock container (not attached to bottom)
 * - Frosted glass effect
 * - Elevated SCAN button
 * - Premium design language
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Animated, Platform } from 'react-native';
import { createBottomTabNavigator, BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';

import { HomeScreen } from '../features/dashboard';
import { AttendanceScreen } from '../features/attendance';
import { HistoryScreen } from '../features/history';
import { ProfileScreen } from '../features/profile';
import { ScanScreen } from '../features/scanning';
import { SwapScreen } from '../features/swap';
import { MyClassHubScreen } from '../features/incharge';
import { useTheme } from '../contexts';
import { withSafeScreen } from '../components/withSafeScreen';

// Wrap every screen in ErrorBoundary — crash in one tab won't kill the app
const SafeHomeScreen = withSafeScreen(HomeScreen, 'HomeScreen');
const SafeScanScreen = withSafeScreen(ScanScreen, 'ScanScreen');
const SafeSwapScreen = withSafeScreen(SwapScreen, 'SwapScreen');
const SafeHistoryScreen = withSafeScreen(HistoryScreen, 'HistoryScreen');
const SafeMyClassHubScreen = withSafeScreen(MyClassHubScreen, 'MyClassHubScreen');

export type MainTabParamList = {
  Home: undefined;
  Delegate: undefined;
  Scan: undefined;
  History: undefined;
  MyClass: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

interface MainTabNavigatorProps {
  userName: string;
  userRole?: 'faculty' | 'class_incharge' | 'lab_incharge' | 'hod' | 'management';
  onLogout: () => void;
}

// Custom Scan Button Interface
interface ScanButtonProps {
  onPress?: () => void;
  accessibilityState?: { selected?: boolean };
}

// Custom Floating Scan Button (no label, centered icon)
const ScanButton: React.FC<ScanButtonProps> = ({ onPress, accessibilityState }) => {
  const focused = accessibilityState?.selected;
  const scaleValue = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleValue, {
      toValue: 0.92,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleValue, {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    }).start();
  };

  return (
    <TouchableOpacity 
      style={styles.scanButtonContainer} 
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
    >
      <Animated.View style={[
        styles.scanButton, 
        focused && styles.scanButtonFocused,
        { transform: [{ scale: scaleValue }] }
      ]}>
        <Ionicons name="bluetooth" size={24} color="#FFFFFF" />
      </Animated.View>
    </TouchableOpacity>
  );
};

// Placeholder screens with premium design
const DelegateScreen: React.FC = () => {
  const { isDark } = useTheme();
  return (
    <View style={[styles.placeholder, { backgroundColor: isDark ? '#0F172A' : '#F0FDF4' }]}>
      <View style={[styles.placeholderIcon, { backgroundColor: 'rgba(61, 220, 151, 0.15)' }]}>
        <Ionicons name="swap-horizontal" size={48} color="#3DDC97" />
      </View>
      <Text style={[styles.placeholderTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
        Swap Classes
      </Text>
      <Text style={[styles.placeholderDesc, { color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B' }]}>
        Request class swaps or substitutes
      </Text>
    </View>
  );
};

// MyClassScreen is imported from features/incharge

// Custom animated tab item for standard tabs
const AnimatedTabItem = ({ isFocused, onPress, iconName, color, label }: any) => {
  const scaleValue = React.useRef(new Animated.Value(isFocused ? 1.15 : 1)).current;

  React.useEffect(() => {
    Animated.spring(scaleValue, {
      toValue: isFocused ? 1.15 : 1,
      friction: 5,
      tension: 200,
      useNativeDriver: true,
    }).start();
  }, [isFocused]);

  const handlePressIn = () => {
    Animated.spring(scaleValue, {
      toValue: 0.9,
      useNativeDriver: true,
    }).start();
  };
  
  const handlePressOut = () => {
    Animated.spring(scaleValue, {
      toValue: isFocused ? 1.15 : 1,
      friction: 4,
      tension: 150,
      useNativeDriver: true,
    }).start();
  };

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.tabItem}
      activeOpacity={0.8}
    >
      <Animated.View style={{ transform: [{ scale: scaleValue }], alignItems: 'center' }}>
        <Ionicons name={iconName} size={23} color={color} />
        <Text style={[styles.tabLabel, { color }]}>
          {label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

// Custom Tab Bar for precise layout control
const CustomTabBar = ({ state, descriptors, navigation, insets }: any) => {
  const { isDark } = useTheme();
  
  // Hide docker when Scan screen is active
  const currentRoute = state.routes[state.index]?.name;
  if (currentRoute === 'Scan') return null;
  
  // Robust bottom offset logic
  // If insets.bottom > 0 (gesture nav), use it.
  // If insets.bottom === 0 (button nav), add generous padding (24px) to clear buttons.
  const bottomOffset = Platform.OS === 'android' 
    ? (insets.bottom > 0 ? insets.bottom : 16) + 20 
    : Math.max(insets.bottom, 12) + 12;

  return (
    <View style={[
      styles.floatingDock, 
      { 
        bottom: bottomOffset,
        backgroundColor: isDark ? 'rgba(13, 74, 74, 0.92)' : 'rgba(255, 255, 255, 0.92)',
        borderColor: isDark ? 'rgba(61, 220, 151, 0.15)' : 'rgba(0, 0, 0, 0.06)',
        borderWidth: 1,
      }
    ]}>
      <BlurView 
        intensity={isDark ? 60 : 80} 
        style={StyleSheet.absoluteFill}
        tint={isDark ? 'dark' : 'light'}
      />
      
      <View style={styles.tabItemsContainer}>
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          
          // Handle hidden tabs (MyClass/Profile logic) via options.tabBarButton
          if (options.tabBarButton && options.tabBarButton() === null) {
            return null;
          }

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          // Special Scan Button Case
          if (route.name === 'Scan') {
             return (
               <View key={route.key} style={styles.scanButtonWrapper}>
                 <ScanButton 
                   onPress={onPress} 
                   accessibilityState={{ selected: isFocused }} 
                 />
               </View>
             );
          }

          // Standard Tab Item
          let iconName: any = 'ellipse';
          if (route.name === 'Home') iconName = isFocused ? 'home' : 'home-outline';
          else if (route.name === 'Delegate') iconName = isFocused ? 'swap-horizontal' : 'swap-horizontal-outline';
          else if (route.name === 'History') iconName = isFocused ? 'time' : 'time-outline';
          else if (route.name === 'MyClass') iconName = isFocused ? 'people' : 'people-outline';
          else if (route.name === 'Profile') iconName = isFocused ? 'person' : 'person-outline';

          const color = isFocused 
            ? (isDark ? '#3DDC97' : '#0D4A4A') 
            : (isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)');

          return (
            <AnimatedTabItem
              key={route.key}
              isFocused={isFocused}
              onPress={onPress}
              iconName={iconName}
              color={color}
              label={options.tabBarLabel || route.name}
            />
          );
        })}
      </View>
    </View>
  );
};

export const MainTabNavigator: React.FC<MainTabNavigatorProps> = ({ userName, userRole, onLogout }) => {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  
  // Class incharges and lab incharges see MyClass instead of Profile in dock
  const showMyClass = userRole === 'class_incharge' || userRole === 'lab_incharge';
  
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} insets={insets} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' }, // Hide default tab bar completely
      }}
    >
      <Tab.Screen 
        name="Home"
        options={{ tabBarLabel: 'Home' }}
      >
        {() => <SafeHomeScreen userName={userName} />}
      </Tab.Screen>
      
      <Tab.Screen 
        name="Delegate"
        component={SafeSwapScreen}
        options={{ tabBarLabel: 'Swap' }}
      />
      
      <Tab.Screen 
        name="Scan" 
        component={SafeScanScreen}
        options={{
          tabBarLabel: 'Scan',
        }}
      />
      
      <Tab.Screen 
        name="History" 
        component={SafeHistoryScreen}
        options={{ tabBarLabel: 'History' }}
      />
      
      {/* MyClass - visible in dock for class/lab incharges */}
      <Tab.Screen 
        name="MyClass"
        component={SafeMyClassHubScreen}
        options={{ 
          tabBarLabel: 'My Class',
          tabBarButton: showMyClass ? undefined : () => null, 
        }}
      />
      
      {/* Profile - visible in dock for non-incharges, but always navigable */}
      <Tab.Screen 
        name="Profile"
        options={{ 
          tabBarLabel: 'Profile',
          tabBarButton: showMyClass ? () => null : undefined, 
        }}
      >
        {() => <ProfileScreen userName={userName} onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  floatingDock: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 70, 
    borderRadius: 35,
    borderTopWidth: 0,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 30,
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  blurContainer: {
    borderRadius: 35,
    overflow: 'hidden',
  },
  tabLabel: {
    fontSize: 9,
    fontFamily: Fonts.family.semiBold,
    marginTop: 4,
    letterSpacing: 0.2,
  },
  tabItemsContainer: {
    flexDirection: 'row',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tabItem: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  scanButtonWrapper: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  scanButtonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
    marginTop: 0, // Reset to 0 so it stays perfectly vertically centered in the dock
  },
  scanButton: {
    width: 56, 
    height: 56,
    borderRadius: 26,
    backgroundColor: '#0D4A4A',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0D4A4A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },
  scanButtonFocused: {
    backgroundColor: '#1A6B6B',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  placeholderIcon: {
    width: 100,
    height: 100,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  placeholderTitle: {
    fontSize: 24,
    fontFamily: Fonts.family.bold,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  placeholderDesc: {
    fontSize: 15,
    fontFamily: Fonts.family.medium,
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default MainTabNavigator;
