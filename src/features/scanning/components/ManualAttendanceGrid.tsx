import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  FlatList,
  Animated,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';
import { getFallbackAvatar } from '../../../utils/avatars';

interface Student {
  id: string;
  name: string;
  rollNo: string;
  status: 'pending' | 'present' | 'absent' | 'od' | 'leave';
  batch?: number | null;
  photoUrl?: string;
  isLE?: boolean;
}

interface ManualAttendanceGridProps {
  students: Student[];
  onToggleStatus: (studentId: string) => void;
  onLongPress: (student: Student) => void;
  isDark: boolean;
}

const { width } = Dimensions.get('window');
const GRID_PADDING = scale(12);
const GAP = scale(6);
const COLUMNS = 5;
const ITEM_SIZE = (width - (GRID_PADDING * 2) - (GAP * (COLUMNS - 1))) / COLUMNS;

// Premium color palette — distinct, accessible, production-grade
const StatusConfig = {
  pending: {
    gradient: ['#64748B', '#475569'] as const,
    icon: 'person-outline' as const,
    iconColor: 'rgba(255,255,255,0.4)',
    label: '',
    overlay: 'rgba(71,85,105,0.85)', // Strong gray = absent/unmarked
  },
  present: {
    gradient: ['#10B981', '#059669'] as const,
    icon: 'checkmark-circle' as const,
    iconColor: 'rgba(255,255,255,0.9)',
    label: '',
    overlay: 'rgba(5,150,105,0.15)', // Minimal overlay = vivid/colored
  },
  absent: {
    gradient: ['#EF4444', '#B91C1C'] as const,
    icon: 'close-circle' as const,
    iconColor: '#FFF',
    label: '',
    overlay: 'rgba(185,28,28,0.15)', // Minimal overlay for red
  },
  od: {
    gradient: ['#F59E0B', '#D97706'] as const,
    icon: 'briefcase' as const,
    iconColor: '#FFF',
    label: 'OD',
    overlay: 'rgba(217,119,6,0.2)',
  },
  leave: {
    gradient: ['#F97316', '#EA580C'] as const,
    icon: 'calendar' as const,
    iconColor: '#FFF',
    label: 'LV',
    overlay: 'rgba(234,88,12,0.2)',
  },
};

import { isLateralEntry } from '../../../utils/studentUtils';

const SquareItem = React.memo(({ item, onTap, onLongPress }: { 
    item: Student; 
    onTap: (id: string) => void; 
    onLongPress: (student: Student) => void;
    isDark: boolean 
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const shortRoll = item.rollNo.slice(-2);
  const nameParts = (item.name || '').trim().split(' ');
  const displayName = nameParts.length > 1 ? nameParts[1] : nameParts[0];
  const initials = item.name
    ? item.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  const config = StatusConfig[item.status] || StatusConfig.pending;
  const isInteractive = item.status !== 'od' && item.status !== 'leave';
  const isMarkedPresent = item.status === 'present';
  const isAbsentOrPending = item.status === 'absent' || item.status === 'pending';
  const isLE = isLateralEntry(item.rollNo, item.isLE);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 40, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 5, useNativeDriver: true })
    ]).start();

    Haptics.impactAsync(
      isMarkedPresent ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
    );
    onTap(item.id);
  };

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={isInteractive ? handlePress : undefined}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        onLongPress(item);
      }}
      disabled={!isInteractive && item.status !== 'od' && item.status !== 'leave'}
    >
      <Animated.View style={[styles.squareContainer, { transform: [{ scale: scaleAnim }] }]}>
        <LinearGradient
          colors={config.gradient as [string, string]}
          style={[
            styles.squareGradient,
            isAbsentOrPending && styles.grayedOut,
            isMarkedPresent && styles.presentGlow,
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* Avatar Background */}
          <View style={[StyleSheet.absoluteFillObject, { padding: scale(10) }]}>
            <Image
              source={item.photoUrl ? { uri: item.photoUrl } : getFallbackAvatar(item.id)}
              style={[
                { width: '100%', height: '100%', opacity: 0.35 },
                isAbsentOrPending && { opacity: 0.15 },
                isMarkedPresent && { opacity: 0.45 },
              ]}
              resizeMode="contain"
            />
          </View>

          {/* LE Badge */}
          {isLE && (
            <View style={[styles.lockedBadge, { 
              backgroundColor: 'rgba(56, 189, 248, 0.6)', 
              left: scale(3), 
              right: undefined, 
            }]}>
              <Text style={styles.lockedBadgeText}>LE</Text>
            </View>
          )}

          {/* Status indicator dot */}
          {isMarkedPresent && (
            <View style={styles.presentIndicator}>
              <Ionicons name="checkmark" size={normalizeFont(10)} color="#FFF" />
            </View>
          )}
          
          {/* OD/Leave locked badge */}
          {(item.status === 'od' || item.status === 'leave') && (
            <View style={[styles.lockedBadge, { 
              backgroundColor: item.status === 'od' ? 'rgba(245,158,11,0.5)' : 'rgba(249,115,22,0.5)' 
            }]}>
              <Ionicons name={config.icon} size={normalizeFont(8)} color="#FFF" />
              <Text style={styles.lockedBadgeText}>{config.label}</Text>
            </View>
          )}

          {/* Bottom content: roll + name */}
          <View style={styles.contentContainer}>
            <Text style={[
              styles.rollText,
              isAbsentOrPending && { opacity: 0.6 },
            ]} numberOfLines={1}>
              {shortRoll}
            </Text>
            <Text style={[
              styles.nameText,
              isAbsentOrPending && { opacity: 0.5 },
            ]} numberOfLines={1}>
              {displayName}
            </Text>
          </View>
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
}, (prev, next) => prev.item.status === next.item.status && prev.item.name === next.item.name);

export const ManualAttendanceGrid: React.FC<ManualAttendanceGridProps> = ({
  students,
  onToggleStatus,
  onLongPress,
  isDark
}) => {
  return (
    <View style={styles.container}>
      <FlatList
        data={students}
        keyExtractor={(item) => item.id}
        numColumns={COLUMNS}
        contentContainerStyle={styles.gridContent}
        columnWrapperStyle={styles.columnWrapper}
        renderItem={({ item }) => (
            <SquareItem
              item={item}
              onTap={onToggleStatus}
              onLongPress={onLongPress}
              isDark={isDark}
            />
        )}
        showsVerticalScrollIndicator={false}
        initialNumToRender={30}
        maxToRenderPerBatch={30}
        windowSize={10}
        removeClippedSubviews={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gridContent: {
    padding: GRID_PADDING,
    paddingBottom: verticalScale(120),
  },
  columnWrapper: {
    gap: GAP,
    marginBottom: GAP,
  },
  squareContainer: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: moderateScale(10),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.2,
    shadowRadius: moderateScale(4),
    elevation: 3,
  },
  squareGradient: {
    flex: 1,
    borderRadius: moderateScale(10),
    justifyContent: 'flex-end',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  // Grayed out = absent/pending look
  grayedOut: {
    opacity: 0.7,
  },
  // Present = vivid glow
  presentGlow: {
    borderColor: 'rgba(16,185,129,0.5)',
    shadowColor: '#10B981',
  },
  // Large initials as background watermark (replaces image for crash safety)
  initialsWatermark: {
    position: 'absolute',
    top: '15%',
    fontSize: normalizeFont(22),
    fontWeight: '900',
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 1,
  },
  // Green checkmark for present
  presentIndicator: {
    position: 'absolute',
    top: scale(3),
    right: scale(3),
    width: scale(16),
    height: scale(16),
    borderRadius: scale(8),
    backgroundColor: 'rgba(16,185,129,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  // OD/Leave locked badge
  lockedBadge: {
    position: 'absolute',
    top: scale(3),
    right: scale(3),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(2),
    paddingHorizontal: scale(4),
    paddingVertical: verticalScale(2),
    borderRadius: moderateScale(4),
  },
  lockedBadgeText: {
    color: '#FFF',
    fontSize: normalizeFont(7),
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  contentContainer: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
    paddingBottom: scale(4),
    paddingHorizontal: scale(2),
  },
  rollText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: normalizeFont(12),
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  nameText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: normalizeFont(8),
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: normalizeFont(10),
    maxWidth: '100%',
  },
});
