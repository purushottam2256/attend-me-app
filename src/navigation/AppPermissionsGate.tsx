import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, AppState, AppStateStatus, Linking, TouchableOpacity, Animated, Dimensions } from 'react-native';
import * as Notifications from 'expo-notifications';
import { BleManager } from 'react-native-ble-plx';
import { Colors } from '@constants';
import Ionicons from '@expo/vector-icons/Ionicons';
import { scale, verticalScale, moderateScale, normalizeFont } from '../utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  onPermissionsGranted: () => void;
  onLogout: () => void;
}

const { width } = Dimensions.get('window');

export const AppPermissionsGate: React.FC<Props> = ({ onPermissionsGranted, onLogout }) => {
  const [checking, setChecking] = useState(true);
  const [missingPermissions, setMissingPermissions] = useState<string[]>([]);
  // Use a ref to ensure we only create one manager and can destroy it on unmount
  const managerRef = useRef<BleManager | null>(null);
  if (!managerRef.current) {
    managerRef.current = new BleManager();
  }
  const manager = managerRef.current;
  const insets = useSafeAreaInsets();
  
  // Animation for the toast
  const slideAnim = useRef(new Animated.Value(200)).current;

  const checkPermissions = async () => {
    setChecking(true);
    const missing: string[] = [];

    // Check Notifications
    const { status: notifStatus } = await Notifications.getPermissionsAsync();
    if (notifStatus !== 'granted') {
      missing.push('Notifications');
    }

    // Check Bluetooth
    try {
      const bleState = await manager.state();
      if (bleState === 'PoweredOff') {
        missing.push('Bluetooth (Turn On)');
      } else if (bleState === 'Unauthorized') {
        missing.push('Bluetooth Permission');
      }
    } catch (e) {
      console.log('BLE Check error', e);
    }

    setMissingPermissions(missing);
    setChecking(false);

    if (missing.length === 0) {
      // Hide toast if visible
      Animated.timing(slideAnim, {
        toValue: 200,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        onPermissionsGranted();
      });
    } else {
      // Show toast
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }).start();
      
      // Auto-proceed allows the app underneath to be interactive
      onPermissionsGranted();
    }
  };

  useEffect(() => {
    checkPermissions();

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkPermissions();
      }
    });

    return () => {
      subscription.remove();
      if (managerRef.current) {
        managerRef.current.destroy();
        managerRef.current = null;
      }
    };
  }, []);

  const handleRequestPermissions = async () => {
    if (missingPermissions.includes('Notifications')) {
      await Notifications.requestPermissionsAsync();
    }
    
    if (missingPermissions.includes('Bluetooth (Turn On)') || missingPermissions.includes('Bluetooth Permission')) {
       try {
         manager.enable();
       } catch (e) {
         console.log('Error enabling bluetooth', e);
       }
    }
    
    // Check again after requesting
    checkPermissions();
  };

  const handleOpenSettings = () => {
    Linking.openSettings();
  };

  // If checking or no missing permissions, render nothing (toast is hidden)
  if (checking || missingPermissions.length === 0) return null;

  return (
    <Animated.View 
      style={[
        styles.toastContainer, 
        { 
          paddingBottom: Math.max(insets.bottom, verticalScale(16)),
          transform: [{ translateY: slideAnim }] 
        }
      ]}
    >
      <View style={styles.toastCard}>
        <View style={styles.headerRow}>
          <View style={styles.iconContainer}>
            <Ionicons name="shield-checkmark" size={moderateScale(20)} color="#10B981" />
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.title}>Permissions Required</Text>
            <Text style={styles.subtitle}>
              {missingPermissions.join(', ')} missing
            </Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.settingsButton} onPress={handleOpenSettings}>
            <Ionicons name="settings-outline" size={moderateScale(16)} color="#10B981" />
            <Text style={styles.settingsButtonText}>Settings</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.allowAllButton} onPress={handleRequestPermissions}>
            <Text style={styles.allowAllButtonText}>Allow All</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9999, // Ensure it floats above everything
    paddingHorizontal: scale(16),
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  toastCard: {
    backgroundColor: '#0F172A', // Very dark slate
    borderRadius: moderateScale(16),
    padding: scale(16),
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)', // Green border
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(16),
  },
  iconContainer: {
    width: scale(36),
    height: scale(36),
    borderRadius: moderateScale(18),
    backgroundColor: 'rgba(16, 185, 129, 0.15)', // Light green bg
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: scale(12),
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontSize: normalizeFont(14),
    color: '#FFF',
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
  },
  subtitle: {
    fontSize: normalizeFont(12),
    color: '#94A3B8', // Slate 400
    fontFamily: 'Inter_500Medium',
    marginTop: verticalScale(2),
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: scale(12),
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(16),
    borderRadius: moderateScale(8),
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  settingsButtonText: {
    color: '#10B981', // Green text
    fontSize: normalizeFont(13),
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
    marginLeft: scale(6),
  },
  allowAllButton: {
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(16),
    borderRadius: moderateScale(8),
    backgroundColor: '#10B981', // Solid green
  },
  allowAllButtonText: {
    color: '#000', // Dark text on green background
    fontSize: normalizeFont(13),
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '700',
  },
});
