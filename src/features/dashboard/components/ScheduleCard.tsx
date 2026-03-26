import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts } from '../../../constants';
import { useTheme } from '../../../contexts';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';
import { ScheduleSlot } from '../screens/HomeScreen';

export interface ScheduleCardProps {
  slot: ScheduleSlot;
  onPress: (slot: ScheduleSlot) => void;
}

export const ScheduleCard: React.FC<ScheduleCardProps> = ({ slot, onPress }) => {
  const { isDark } = useTheme();

  const colors: Record<string, string> = {
    live: '#10B981',        // Green - live
    completed: '#9CA3AF',   // Gray - completed 
    incomplete: '#F97316',  // Orange - not taken
    upcoming: '#3B82F6',    // Blue - upcoming
    swapped: '#F59E0B',     // Amber - swapped
    substitute: '#A78BFA',  // Light purple - substitute
  };

  const statusLabels: Record<string, string> = {
    live: 'Live',
    completed: 'Completed',
    incomplete: 'Incomplete',
    upcoming: 'Upcoming',
  };

  const formatTime = (time: string) => {
    const [hour, min] = time.split(':');
    const h = parseInt(hour, 10);
    const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayHour}:${min}`;
  };

  const isLab = slot.subject?.name?.toLowerCase().includes('lab');
  const batchLabel = slot.batch === 1 ? 'Batch 1' : slot.batch === 2 ? 'Batch 2' : 'Full Class';

  // Fallbacks if slot properties are missing/undefined
  const currentStatus = slot.status || 'upcoming';
  const statusColor = colors[currentStatus] || colors.upcoming;
  const statusLabel = statusLabels[currentStatus] || 'Upcoming';

  return (
    <TouchableOpacity
      style={[
        styles.scheduleCard,
        { backgroundColor: isDark ? '#082020' : '#FFFFFF' },
      ]}
      onPress={() => onPress(slot)}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={[`${statusColor}40`, `${statusColor}00`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.cardGradient}
      />
      
      <View style={[styles.cardAccent, { backgroundColor: statusColor }]} />

      <View style={styles.cardContent}>
        <View style={styles.scheduleTime}>
          <Text style={[styles.timeStart, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
            {formatTime(slot.start_time)}
          </Text>
          <Text style={[styles.timeEnd, { color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B' }]}>
            {formatTime(slot.end_time)}
          </Text>
        </View>

        <View style={styles.scheduleInfo}>
          <Text style={[styles.scheduleSubject, { color: isDark ? '#FFFFFF' : '#0F172A' }]} numberOfLines={1}>
            {slot.subject?.name || 'N/A'}
          </Text>
          
          <View style={styles.scheduleMetaRow}>
            <Text style={[styles.scheduleSectionText, { color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B' }]}>
              {slot.target_dept} • Year {slot.target_year} • {slot.target_section}{slot.batch ? ` • B${slot.batch}` : ''}{slot.room ? ` • ${slot.room}` : ''}
            </Text>
          </View>
          
          <View style={styles.tagsRow}>
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
              {currentStatus === 'live' && <View style={[styles.liveDotSmall, { backgroundColor: statusColor }]} />}
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
            
            {slot.isSwap && (
              <View style={[styles.swapBadge, { backgroundColor: 'rgba(245, 158, 11, 0.2)' }]}>
                <Ionicons name="swap-horizontal" size={11} color="#F59E0B" />
                <Text style={styles.swapBadgeText}>SWAP</Text>
              </View>
            )}
            
            {slot.isSubstitute && (
              <View style={[styles.subBadge, { backgroundColor: 'rgba(167, 139, 250, 0.2)' }]}>
                <Ionicons name="person-outline" size={11} color="#A78BFA" />
                <Text style={styles.subBadgeText}>SUB</Text>
              </View>
            )}
            
            {isLab && (
              <View style={[styles.batchTag, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.15)' }]}>
                <Ionicons name="people-outline" size={11} color="#F59E0B" />
                <Text style={styles.batchTagText}>{batchLabel}</Text>
              </View>
            )}
            
            {slot.periodCount && slot.periodCount > 1 && (
              <View style={[styles.periodBadge, { backgroundColor: isDark ? 'rgba(13, 74, 74, 0.3)' : 'rgba(13, 74, 74, 0.15)' }]}>
                <Ionicons name="copy-outline" size={11} color="#0D4A4A" />
                <Text style={styles.periodBadgeText}>{slot.periodCount}x</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.scheduleAction}>
          <Ionicons 
            name={currentStatus === 'completed' ? 'checkmark-circle' : currentStatus === 'live' ? 'chevron-forward' : 'time-outline'} 
            size={22} 
            color={statusColor} 
          />
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  scheduleCard: {
    borderRadius: moderateScale(20),
    marginBottom: verticalScale(14),
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(4) },
    shadowOpacity: 0.15,
    shadowRadius: moderateScale(8),
    elevation: 4,
  },
  cardGradient: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '40%',
  },
  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: scale(4),
    borderTopLeftRadius: moderateScale(16),
    borderBottomLeftRadius: moderateScale(16),
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: scale(16),
    paddingLeft: scale(20),
  },
  scheduleTime: {
    width: scale(55),
    alignItems: 'flex-start',
  },
  timeStart: {
    fontSize: normalizeFont(16),
    fontFamily: Fonts.family.bold,
  },
  timeEnd: {
    fontSize: normalizeFont(12),
    fontFamily: Fonts.family.medium,
    marginTop: verticalScale(2),
  },
  scheduleInfo: {
    flex: 1,
    marginLeft: scale(14),
  },
  scheduleSubject: {
    fontSize: normalizeFont(16),
    fontFamily: Fonts.family.bold,
    marginBottom: verticalScale(4),
    letterSpacing: -0.2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(3),
    borderRadius: moderateScale(8),
    gap: scale(4),
  },
  liveDotSmall: {
    width: scale(6),
    height: scale(6),
    borderRadius: moderateScale(3),
  },
  statusBadgeText: {
    fontSize: normalizeFont(11),
    fontFamily: Fonts.family.semiBold,
  },
  scheduleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(6),
  },
  scheduleSectionText: {
    fontSize: normalizeFont(13),
    fontFamily: Fonts.family.medium,
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  batchTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(8),
    gap: scale(4),
  },
  swapBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(8),
    gap: scale(4),
  },
  swapBadgeText: {
    fontSize: normalizeFont(10),
    fontFamily: Fonts.family.bold,
    color: '#F59E0B',
    letterSpacing: 0.5,
  },
  subBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(8),
    gap: scale(4),
  },
  subBadgeText: {
    fontSize: normalizeFont(10),
    fontFamily: Fonts.family.bold,
    color: '#A78BFA',
    letterSpacing: 0.5,
  },
  batchTagText: {
    fontSize: normalizeFont(11),
    fontFamily: Fonts.family.semiBold,
    color: '#F59E0B',
  },
  periodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(8),
    gap: scale(4),
  },
  periodBadgeText: {
    fontSize: normalizeFont(10),
    fontFamily: Fonts.family.bold,
    color: '#0D4A4A',
    letterSpacing: 0.3,
  },
  scheduleAction: {
    paddingLeft: scale(12),
  },
});
