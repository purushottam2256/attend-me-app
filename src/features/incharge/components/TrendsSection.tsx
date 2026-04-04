/**
 * TrendsSection - Weekly attendance trend graph with insights
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';
import { safeMax } from '../../../utils/safeUtils';

interface TrendData {
  day: string;
  percentage: number;
}

interface TrendsSectionProps {
  data: TrendData[];
}

export const TrendsSection: React.FC<TrendsSectionProps> = ({ data }) => {
  const { isDark } = useTheme();
  
  // Calculate insight
  const getInsight = (): string => {
    if (!data || data.length === 0) return 'No data available yet';
    
    // Find lowest day
    const sorted = [...data].sort((a, b) => a.percentage - b.percentage);
    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];
    
    if (lowest.percentage < 75) {
      return `Low: ${lowest.day}`;
    }
    if (highest.percentage > 90) {
      return `Peak: ${highest.day}`;
    }
    return 'Stable week';
  };

  // FIXED: safeMax prevents -Infinity crash when data is empty
  const maxPercentage = safeMax(data.map(d => d.percentage), 100);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.insightText, { color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B', marginLeft: 'auto' }]}>
          {getInsight()}
        </Text>
      </View>

      {/* Graph */}
      <View style={[styles.graphContainer, {
        backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(13, 74, 74, 0.04)',
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      }]}>
        {data.length === 0 ? (
          <View style={styles.noDataContainer}>
            <Ionicons name="bar-chart-outline" size={normalizeFont(32)} color={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)'} />
            <Text style={[styles.noDataText, { color: isDark ? 'rgba(255,255,255,0.4)' : '#94A3B8' }]}>
              No attendance data this week
            </Text>
          </View>
        ) : (
          <View style={styles.barsRow}>
            {data.map((item, index) => {
              const barHeight = (item.percentage / maxPercentage) * 80;
              const color = '#34C759'; // Apple Green for all bars (Zen Mode)
              
              return (
                <View key={index} style={styles.barWrapper}>
                  <View style={styles.barContainer}>
                    <View 
                      style={[styles.bar, { 
                        height: barHeight, 
                        backgroundColor: color,
                        shadowColor: color,
                      }]} 
                    />
                  </View>
                  <Text style={[styles.dayLabel, { color: isDark ? 'rgba(255,255,255,0.5)' : '#64748B' }]}>
                    {item.day}
                  </Text>
                  <Text style={[styles.percentLabel, { color: isDark ? 'rgba(255,255,255,0.7)' : '#334155' }]}>
                    {item.percentage}%
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: scale(16),
    marginTop: verticalScale(20),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  title: {
    fontSize: normalizeFont(16),
    fontWeight: '700',
  },
  insightText: {
    fontSize: normalizeFont(12),
    fontWeight: '500',
    fontStyle: 'italic',
  },
  graphContainer: {
    borderRadius: moderateScale(16),
    borderWidth: 1,
    padding: scale(16),
    minHeight: verticalScale(140),
  },
  noDataContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(20),
  },
  noDataText: {
    marginTop: verticalScale(8),
    fontSize: normalizeFont(13),
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: verticalScale(100),
  },
  barWrapper: {
    alignItems: 'center',
    flex: 1,
  },
  barContainer: {
    height: verticalScale(80),
    justifyContent: 'flex-end',
  },
  bar: {
    width: scale(24),
    borderRadius: moderateScale(6),
    minHeight: verticalScale(8),
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.3,
    shadowRadius: moderateScale(4),
    elevation: 3,
  },
  dayLabel: {
    fontSize: normalizeFont(10),
    fontWeight: '600',
    marginTop: verticalScale(6),
  },
  percentLabel: {
    fontSize: normalizeFont(9),
    fontWeight: '500',
  },
});

export default TrendsSection;
