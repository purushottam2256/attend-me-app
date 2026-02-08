
import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { formatDistanceToNow } from 'date-fns';

const safeDate = (dateString: any) => {
    if (!dateString) return new Date();
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? new Date() : date;
};

const getRelativeTime = (dateString: any) => {
    try {
        const date = safeDate(dateString);
        return formatDistanceToNow(date, { addSuffix: true });
    } catch (e) {
        return 'Just now';
    }
};

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
    background: isSelected ? 'rgba(61, 220, 151, 0.1)' 
               : isDark ? '#082020' : '#FFFFFF', // Zen Black / White
    textPrimary: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? 'rgba(255,255,255,0.6)' : '#666666',
    border: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
    unreadBg: isDark ? 'rgba(0, 168, 132, 0.08)' : 'rgba(0, 168, 132, 0.05)',
    selectedBg: isDark ? 'rgba(0, 168, 132, 0.15)' : 'rgba(0, 168, 132, 0.1)',
    deleteRed: '#F15C6D',
  };

  // Type icon colors
  const getIconColor = () => {
    switch (type) {
      case 'request': return '#8B5CF6'; // Purple (Swapped/Sub)
      case 'alert': return '#F59E0B';   // Orange (Incomplete/Alert)
      case 'info': return '#10B981';    // Green (Live/Active)
      default: return '#3B82F6';        // Blue (Upcoming/Info)
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
  // Render delete action - Simple reveal
  const renderRightActions = (_progress: any, dragX: any) => {
    // Optional: Animate opacity or scale based on drag, but keeping it simple ensures clickability
    return (
      <View style={styles.deleteAction}>
        <TouchableOpacity 
          style={[styles.deleteButton, { backgroundColor: colors.deleteRed }]}
          onPress={() => {
            swipeableRef.current?.close();
            onDelete?.();
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>
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
          backgroundColor: isSelected ? colors.selectedBg : (isRead ? colors.background : colors.unreadBg),
          borderBottomColor: colors.border,
        }
      ]}
    >
      {/* Selection indicator */}
      {selectionMode && (
        <View style={[
          styles.checkbox,
          { 
            backgroundColor: isSelected ? '#3DDC97' : 'transparent', // Accent green
            borderColor: isSelected ? '#3DDC97' : colors.textSecondary,
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
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.time, { color: colors.textSecondary }]}>
            {getRelativeTime(timestamp)}
          </Text>
        </View>
        
        <View style={styles.bodyRow}>
          {/* Unread indicator */}
          {!isRead && (
            <View style={[styles.unreadDot, { backgroundColor: '#3DDC97' }]} />
          )}
          <Text 
            style={[styles.body, { color: colors.textSecondary }]} 
            // Flexible height
          >
            {body}
          </Text>
          
          {/* Status badge */}
          {status && status !== 'pending' && (
            <View style={[
              styles.statusBadge, 
              { backgroundColor: status === 'accepted' ? '#3DDC97' : '#F15C6D' }
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
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    minHeight: 50,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 32, 
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: 'rgba(255,255,255,0.05)', // Subtle background for icon
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  time: {
    fontSize: 11,
    fontWeight: '400',
    marginLeft: 8,
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
    width: 80, // Explicit width for Swipeable
  },
  deleteButton: {
    width: 80, // Match action width
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
