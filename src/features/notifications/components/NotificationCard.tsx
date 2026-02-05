import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';

interface NotificationCardProps {
  title: string;
  body: string;
  timestamp: string;
  type: 'request' | 'alert' | 'info';
  isRead: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  isDark?: boolean;
  selectionMode?: boolean;
  isSelected?: boolean;
  onPress?: () => void;
  onDelete?: () => void;
  onLongPress?: () => void;
  status?: 'accepted' | 'declined' | 'pending' | null;
}

/**
 * WHATSAPP-STYLE COMPACT NOTIFICATION CARD
 * - Minimal padding for dense list
 * - Swipe left to delete
 * - Long press to select
 * - Tap to view details
 */
export const NotificationCard = React.memo(({ 
  title, 
  body, 
  timestamp, 
  type, 
  isRead, 
  icon,
  isDark = false,
  selectionMode = false,
  isSelected = false,
  onPress,
  onDelete,
  onLongPress,
  status
}: NotificationCardProps) => {
  const swipeableRef = useRef<Swipeable>(null);

  // WhatsApp-inspired colors
  const colors = {
    bg: isDark ? '#0B141A' : '#FFFFFF',
    border: isDark ? '#1F2C34' : '#E8E8E8',
    textPrimary: isDark ? '#E9EDEF' : '#111B21',
    textSecondary: isDark ? '#8696A0' : '#667781',
    textMuted: isDark ? '#667781' : '#8696A0',
    accent: '#00A884', // WhatsApp green
    unreadBg: isDark ? 'rgba(0, 168, 132, 0.08)' : 'rgba(0, 168, 132, 0.05)',
    selectedBg: isDark ? 'rgba(0, 168, 132, 0.15)' : 'rgba(0, 168, 132, 0.1)',
    deleteRed: '#F15C6D',
  };

  // Type icon colors
  const getIconColor = () => {
    switch (type) {
      case 'request': return '#00A884';
      case 'alert': return '#FFA500';
      default: return '#53BDEB';
    }
  };

  const getIcon = () => {
    if (icon) return icon;
    switch (type) {
      case 'request': return 'swap-horizontal';
      case 'alert': return 'warning';
      default: return 'notifications';
    }
  };

  // Render delete action (swipe right-to-left reveals this)
  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [80, 0],
    });
    
    return (
      <Animated.View style={[styles.deleteAction, { transform: [{ translateX }] }]}>
        <TouchableOpacity 
          style={[styles.deleteButton, { backgroundColor: colors.deleteRed }]}
          onPress={() => {
            swipeableRef.current?.close();
            onDelete?.();
          }}
        >
          <Ionicons name="trash-outline" size={22} color="#FFF" />
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const cardContent = (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={[
        styles.card,
        { 
          backgroundColor: isSelected ? colors.selectedBg : (isRead ? colors.bg : colors.unreadBg),
          borderBottomColor: colors.border,
        }
      ]}
    >
      {/* Selection indicator */}
      {selectionMode && (
        <View style={[
          styles.checkbox,
          { 
            backgroundColor: isSelected ? colors.accent : 'transparent',
            borderColor: isSelected ? colors.accent : colors.textMuted,
          }
        ]}>
          {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
        </View>
      )}

      {/* Icon */}
      <View style={[styles.iconContainer, { backgroundColor: getIconColor() + '20' }]}>
        <Ionicons name={getIcon()} size={18} color={getIconColor()} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text 
            style={[
              styles.title, 
              { 
                color: colors.textPrimary,
                fontWeight: isRead ? '500' : '600' 
              }
            ]} 
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text style={[styles.time, { color: isRead ? colors.textMuted : colors.accent }]}>
            {timestamp}
          </Text>
        </View>
        
        <View style={styles.bodyRow}>
          {/* Unread indicator */}
          {!isRead && (
            <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />
          )}
          <Text 
            style={[styles.body, { color: colors.textSecondary }]} 
            numberOfLines={1}
          >
            {body}
          </Text>
          
          {/* Status badge */}
          {status && status !== 'pending' && (
            <View style={[
              styles.statusBadge, 
              { backgroundColor: status === 'accepted' ? '#00A884' : '#F15C6D' }
            ]}>
              <Ionicons 
                name={status === 'accepted' ? 'checkmark' : 'close'} 
                size={10} 
                color="#FFF" 
              />
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  // If selection mode is active, don't allow swipe
  if (selectionMode) {
    return cardContent;
  }

  // Normal mode - swipeable
  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
    >
      {cardContent}
    </Swipeable>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    flex: 1,
    marginRight: 8,
  },
  time: {
    fontSize: 12,
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  body: {
    fontSize: 14,
    flex: 1,
  },
  statusBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  deleteButton: {
    width: 70,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
