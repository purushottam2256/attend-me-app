import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  FlatList,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';

interface Student {
  id: string;
  name: string;
  rollNo: string;
  status: 'pending' | 'present' | 'absent' | 'od' | 'leave';
  batch?: number | null;
}

interface ManualAttendanceGridProps {
  students: Student[];
  onToggleStatus: (studentId: string) => void;
  onLongPress: (student: Student) => void;
  batchFilter: 'all' | 1 | 2;
  isDark: boolean;
}

const { width } = Dimensions.get('window');
const GRID_PADDING = scale(12);
const GAP = scale(8);
const COLUMNS = 5;
const ITEM_SIZE = (width - (GRID_PADDING * 2) - (GAP * (COLUMNS - 1))) / COLUMNS;

const StatusColors = {
  pending: ['#9CA3AF', '#6B7280'], // Gray (unmarked)
  present: ['#10B981', '#059669'], // Green
  absent: ['#EF4444', '#DC2626'],  // Red
  od: ['#F59E0B', '#D97706'],      // Amber
  leave: ['#8B5CF6', '#7C3AED'],   // Violet
};

const SquareItem = React.memo(({ item, onTap, onLongPress, isDark }: { 
    item: Student; 
    onTap: (id: string) => void; 
    onLongPress: (student: Student) => void;
    isDark: boolean 
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  // Formatting: "21P31A0501" -> "501" usually, but user asked for "name and roll no"
  // Let's show last 3 digits of roll + First Name
  const shortRoll = item.rollNo.slice(-3);
  const firstName = item.name.split(' ')[0];

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.95, duration: 50, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 100, useNativeDriver: true })
    ]).start();

    if (item.status === 'present') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onTap(item.id);
  };

  const isInteractive = item.status === 'present' || item.status === 'absent' || item.status === 'pending';
  const colors = StatusColors[item.status] || StatusColors.present;
  
  // Opacity for non-interactive states (OD/Leave)
  const opacity = isInteractive ? 1 : 0.8;

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
      <Animated.View style={[styles.squareContainer, { transform: [{ scale }], opacity }]}>
        <LinearGradient
          colors={colors as [string, string]}
          style={styles.squareGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
            {/* Status Icon / Badge for OD/Leave */}
            {(item.status === 'od' || item.status === 'leave') && (
                <View style={styles.statusBadge}>
                    <Text style={styles.statusBadgeText}>{item.status.toUpperCase().slice(0, 1)}</Text>
                </View>
            )}
            
            <View style={styles.contentContainer}>
                <Text style={styles.rollText} numberOfLines={1}>{shortRoll}</Text>
                <Text style={styles.nameText} numberOfLines={1}>{firstName}</Text>
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
  batchFilter,
  isDark
}) => {
  // Filter students
  const filteredStudents = students.filter(s => {
    if (batchFilter === 'all') return true;
    return s.batch === batchFilter;
  });

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredStudents}
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
    paddingBottom: verticalScale(120), // Space for FAB
  },
  columnWrapper: {
    gap: GAP,
    marginBottom: GAP,
  },
  squareContainer: {
    width: ITEM_SIZE,
    height: ITEM_SIZE, // Square
    borderRadius: moderateScale(8), // Smaller radius for smaller items
    shadowColor: "#000",
    shadowOffset: { width: 0, height: verticalScale(1) },
    shadowOpacity: 0.15,
    shadowRadius: moderateScale(2),
    elevation: 2,
  },
  squareGradient: {
    flex: 1,
    borderRadius: moderateScale(8),
    padding: scale(2), // Less padding
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  contentContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
  },
  rollText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: normalizeFont(16), // Smaller font
    fontWeight: '800',
    marginBottom: 0, // Tight layout
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
  },
  nameText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: normalizeFont(9), // Very small for name
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: normalizeFont(10),
    marginTop: verticalScale(2),
    maxWidth: '100%',
  },
  statusBadge: {
    position: 'absolute',
    top: scale(2),
    right: scale(2),
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: scale(3),
    paddingVertical: verticalScale(1),
    borderRadius: moderateScale(3),
  },
  statusBadgeText: {
    color: '#FFF',
    fontSize: normalizeFont(7),
    fontWeight: '800',
  },
  checkIcon: { // Removed Check icon for space
      display: 'none' 
  }
});
