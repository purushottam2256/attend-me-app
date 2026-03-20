/**
 * TrafficLightZone - Shows P1 & P4 attendance as traffic light indicators
 * 
 * New Zen Mode:
 * - Minimalist Design
 * - Positive Colors (Greens/Teals) only
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../contexts';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';

interface PeriodData {
  slot_id: string;
  present_count: number;
  total_count: number;
  percentage: number;
}

interface TrafficLightZoneProps {
  p1: PeriodData | null;
  p4: PeriodData | null;
}

const ZenLight: React.FC<{
  label: string;
  data: PeriodData | null;
  isDark: boolean;
}> = ({ label, data, isDark }) => {
  const percentage = data?.percentage ?? 0;
  // Zen Colors: Always positive tones, varying opacity/shade or distinct specific zen colors
  // High = Deep Green, Mid = Soft Teal, Low = Muted Sage (No Red)
  const ringColor = percentage >= 90 ? '#34C759' : percentage >= 75 ? '#5AC8FA' : '#8E8E93'; 

  return (
    <View style={[styles.zenCard, { 
      backgroundColor: isDark ? '#082020' : '#FFFFFF',
      shadowColor: "#000",
      shadowOffset: { width: 0, height: verticalScale(4) },
      shadowOpacity: 0.05,
      shadowRadius: moderateScale(12),
      elevation: 2
    }]}>
      <Text style={[styles.periodLabel, { color: isDark ? '#8E8E93' : '#86868B' }]}>
        {label}
      </Text>
      
      <View style={styles.centerContent}>
        {data ? (
            <View style={{alignItems: 'center'}}>
                <Text style={[styles.percentText, { color: isDark ? '#FFF' : '#000' }]}>
                    {percentage}<Text style={{fontSize: normalizeFont(20), color: '#8E8E93'}}>%</Text>
                </Text>
                <View style={[styles.statusBar, { backgroundColor: ringColor }]} />
            </View>
        ) : (
            <Text style={{color: '#8E8E93', fontSize: normalizeFont(14), fontWeight: '600', textAlign: 'center'}}>Yet to be taken</Text>
        )}
      </View>

      {data && (
         <Text style={[styles.countText, { color: isDark ? '#636366' : '#AEAEB2' }]}>
            {data.present_count} / {data.total_count} Present
         </Text>
      )}
    </View>
  );
};

export const TrafficLightZone: React.FC<TrafficLightZoneProps> = ({ p1, p4 }) => {
  const { isDark } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <ZenLight label="Morning (P1)" data={p1} isDark={isDark} />
        <ZenLight label="Afternoon (P4)" data={p4} isDark={isDark} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: scale(20),
    marginTop: verticalScale(20),
  },
  row: {
    flexDirection: 'row',
    gap: scale(16),
  },
  zenCard: {
    flex: 1,
    padding: scale(20),
    borderRadius: moderateScale(24),
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: verticalScale(140),
  },
  periodLabel: {
    fontSize: normalizeFont(13),
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  centerContent: {
    marginVertical: verticalScale(12),
  },
  percentText: {
    fontSize: normalizeFont(42),
    fontWeight: '800',
    letterSpacing: -1,
  },
  statusBar: {
    width: scale(40),
    height: verticalScale(4),
    borderRadius: moderateScale(2),
    marginTop: verticalScale(8),
  },
  countText: {
    fontSize: normalizeFont(13),
    fontWeight: '500',
  }
});

export default TrafficLightZone;
