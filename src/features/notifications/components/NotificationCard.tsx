import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface NotificationAction {
  label: string;
  onPress: () => void;
  variant: 'primary' | 'secondary';
  icon?: keyof typeof Ionicons.glyphMap;
}

interface NotificationCardProps {
  title: string;
  body: string;
  timestamp: string;
  type: 'request' | 'alert' | 'info';
  isRead: boolean;
  actions?: NotificationAction[];
  icon?: keyof typeof Ionicons.glyphMap;
  isDark?: boolean;
  selectionMode?: boolean;
  isSelected?: boolean;
  onLongPress?: () => void;
  onPress?: () => void;
}

interface NotificationCardProps {
  // ... existing props
  status?: 'accepted' | 'declined' | 'pending' | null;
}

export const NotificationCard = ({ 
  title, 
  body, 
  timestamp, 
  type, 
  isRead, 
  actions, 
  icon,
  isDark = false,
  selectionMode = false,
  isSelected = false,
  onLongPress,
  onPress,
  status
}: NotificationCardProps) => {

  const getIconColor = () => {
    switch (type) {
      case 'request': return '#10B981'; // Green
      case 'alert': return '#F59E0B';   // Amber
      default: return '#64748B';        // Slate Gray (was Green)
    }
  };

  const isResolved = status === 'accepted' || status === 'declined';
  const effectiveRead = isRead || isResolved; // Treat resolved as read

  const currentIconColor = effectiveRead ? (isDark ? '#475569' : '#CBD5E1') : getIconColor();

  const containerStyle = [
    styles.container,
    { 
        backgroundColor: isDark ? '#082020' : '#FFFFFF',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0',
    },
    // Selection Mode Highlight
    isSelected && {
        backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#EFF6FF',
        borderColor: '#10B981'
    },
    // Read/Resolved state overrides
    effectiveRead && !isSelected && { 
        backgroundColor: isDark ? '#1E293B' : '#F1F5F9', // Strong Gray
        borderColor: isDark ? '#1E293B' : '#F1F5F9',
        shadowOpacity: 0 
    },
    // Unread highlight
    !effectiveRead && !isSelected && { 
        borderColor: isDark ? 'rgba(16, 185, 129, 0.5)' : '#10B981',
    }
  ];

  return (
    <TouchableOpacity 
      activeOpacity={0.7}
      style={containerStyle}
      onLongPress={onLongPress}
      onPress={onPress}
      delayLongPress={300}
    >
      {/* Selection Checkbox */}
      {selectionMode && (
          <View style={styles.selectionContainer}>
              <Ionicons 
                name={isSelected ? "checkbox" : "square-outline"} 
                size={24} 
                color={isSelected ? "#10B981" : (isDark ? "#64748B" : "#CBD5E1")} 
              />
          </View>
      )}

      {/* Left Accent Bar */}
      {!selectionMode && (
          <View style={[
              styles.accentBar, 
              { backgroundColor: effectiveRead ? (isDark ? '#334155' : '#CBD5E1') : currentIconColor }
          ]} />
      )}

      <View style={[styles.contentContainer, effectiveRead && { paddingLeft: 16 }]}> 
        {/* Header Row */}
        <View style={styles.headerRow}>
          <View style={[styles.iconContainer, 
            { backgroundColor: effectiveRead ? (isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9') : `${currentIconColor}15` }
          ]}>
            <Ionicons name={icon || 'notifications'} size={20} color={currentIconColor} />
          </View>
          
          <View style={styles.headerText}>
            <Text style={[
              styles.title, 
              { color: isDark ? '#FFFFFF' : '#0F172A' },
              effectiveRead && { color: isDark ? '#94A3B8' : '#64748B', fontWeight: '400' }
            ]} numberOfLines={1}>
              {title}
            </Text>
          </View>

          {/* Time & Unread Indicator */}
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            {!effectiveRead && (
                <View style={{ 
                    width: 8, 
                    height: 8, 
                    borderRadius: 4, 
                    backgroundColor: '#10B981',
                    marginBottom: 2
                }} />
            )}
            <Text style={[styles.timestamp, effectiveRead && { color: isDark ? '#52525B' : '#94A3B8' }]}>{timestamp}</Text>
          </View>
        </View>

        {/* Body Text */}
        <Text style={[
            styles.body, 
            { color: isDark ? '#E2E8F0' : '#334155' },
            effectiveRead && { color: isDark ? '#64748B' : '#94A3B8' }
        ]} numberOfLines={2}>
          {body}
        </Text>

        {/* Actions or Status Badge */}
        {status && status !== 'pending' ? (
            <View style={styles.statusContainer}>
                <View style={[
                    styles.statusBadge,
                    { backgroundColor: status === 'accepted' ? (isDark ? 'rgba(16, 185, 129, 0.2)' : '#DCFCE7') : (isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2') }
                ]}>
                    <Text style={[
                        styles.statusText,
                        { color: status === 'accepted' ? '#15803D' : '#B91C1C' }
                    ]}>
                        {status === 'accepted' ? 'Accepted' : 'Declined'}
                    </Text>
                </View>
            </View>
        ) : (
            actions && actions.length > 0 && (
            <View style={styles.actionsRow}>
                {actions.map((action, index) => (
                <TouchableOpacity
                    key={index}
                    style={[
                    styles.actionButton,
                    action.variant === 'primary' 
                        ? { backgroundColor: effectiveRead ? '#94A3B8' : '#10B981', borderColor: effectiveRead ? '#94A3B8' : '#10B981' }
                        : { backgroundColor: 'transparent', borderColor: isDark ? '#334155' : '#E2E8F0' }
                    ]}
                    onPress={action.onPress}
                    activeOpacity={0.8}
                >
                    {/* ... icon and text */}
                    {action.icon && <Ionicons name={action.icon} size={16} color={action.variant === 'primary' ? '#FFFFFF' : (isDark ? '#FFFFFF' : '#0F172A')} />}
                    <Text style={[styles.actionText, { color: action.variant === 'primary' ? '#FFFFFF' : (isDark ? '#FFFFFF' : '#0F172A') }]}>{action.label}</Text>
                </TouchableOpacity>
                ))}
            </View>
            )
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  accentBar: {
    width: 6,
    height: '100%',
  },
  contentContainer: {
    flex: 1,
    padding: 16,
    paddingLeft: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  timestamp: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
    paddingLeft: 52, // Align with title text (40px icon + 12px gap)
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingLeft: 52,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    flex: 1,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  selectionContainer: {
    paddingLeft: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusContainer: {
    paddingLeft: 52,
    flexDirection: 'row',
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
