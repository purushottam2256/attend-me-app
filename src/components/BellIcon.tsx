import React from 'react';
import { TouchableOpacity, View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from '../contexts/NotificationContext';
import { useNavigation } from '@react-navigation/native';

interface BellIconProps {
  style?: any;
  size?: number;
  color?: string;
}

export const BellIcon = ({ style, size = 24, color = '#FFF' }: BellIconProps) => {
  const { unreadCount } = useNotifications();
  const navigation = useNavigation();
  const handlePress = () => {
      // @ts-ignore
      navigation.navigate('Notifications');
  };

  return (
    <TouchableOpacity onPress={handlePress} style={[styles.container, style]}>
      <Ionicons name="notifications-outline" size={size} color={color} />
      {unreadCount > 0 && (
        <View style={styles.badge}>
           <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    // padding: 8, // Removed to allow external sizing
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#0D4A4A', // Match header bg for cutout effect
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  dot: { // Deprecated
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  }
});
