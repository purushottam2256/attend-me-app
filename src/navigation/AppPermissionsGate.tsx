import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, AppState, AppStateStatus, Linking, TouchableOpacity } from 'react-native';
import * as Notifications from 'expo-notifications';
import { BleManager } from 'react-native-ble-plx';
import { Colors } from '@constants';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  onPermissionsGranted: () => void;
  onLogout: () => void;
}

export const AppPermissionsGate: React.FC<Props> = ({ onPermissionsGranted, onLogout }) => {
  const [checking, setChecking] = useState(true);
  const [missingPermissions, setMissingPermissions] = useState<string[]>([]);
  const manager = React.useMemo(() => new BleManager(), []);

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
    };
  }, []);

  const handleRequestPermissions = async () => {
    if (missingPermissions.includes('Notifications')) {
      await Notifications.requestPermissionsAsync();
    }
    
    if (missingPermissions.includes('Bluetooth (Turn On)')) {
       // On Android we could enable it, but standard approach is leading to settings
       manager.enable();
    }
    
    // Some permissions need settings app
    Linking.openSettings();
  };

  if (checking) return null; // Or a subtle loading spinner

  if (missingPermissions.length === 0) return null; // Will trigger onPermissionsGranted

  return (
    <LinearGradient colors={['#050D0D', '#0A1A1A']} style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconContainer}>
            <Ionicons name="shield-checkmark" size={48} color="#F97316" />
        </View>
        <Text style={styles.title}>Action Required</Text>
        <Text style={styles.subtitle}>Attend-Me requires the following permissions to function correctly:</Text>
        
        <View style={styles.list}>
          {missingPermissions.map((perm, idx) => (
            <View key={idx} style={styles.listItem}>
              <Ionicons name="close-circle" size={20} color="#EF4444" />
              <Text style={styles.listText}>{perm}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.mainButton} onPress={handleRequestPermissions}>
          <Text style={styles.mainButtonText}>Fix Permissions</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 32,
    borderRadius: 24,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    color: '#FFF',
    fontFamily: 'Inter_700Bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  list: {
    width: '100%',
    marginBottom: 32,
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: 16,
    borderRadius: 16,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  listText: {
    color: '#FFF',
    marginLeft: 12,
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
  mainButton: {
    backgroundColor: '#F97316',
    width: '100%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  mainButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  logoutButton: {
    padding: 12,
  },
  logoutButtonText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  }
});
