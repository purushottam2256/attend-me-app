/**
 * TrendsSection - Weekly attendance trend graph with insights
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts';

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
    if (data.length === 0) return 'No data available yet';
    
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

  const maxPercentage = Math.max(...data.map(d => d.percentage), 100);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Ionicons name="trending-up-outline" size={18} color={isDark ? '#3DDC97' : '#0D4A4A'} />
          <Text style={[styles.title, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
            Weekly Trends
          </Text>
        </View>
        <Text style={[styles.insightText, { color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B' }]}>
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
            <Ionicons name="bar-chart-outline" size={32} color={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)'} />
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
    marginHorizontal: 16,
    marginTop: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  insightText: {
    fontSize: 12,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  graphContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    minHeight: 140,
  },
  noDataContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  noDataText: {
    marginTop: 8,
    fontSize: 13,
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 100,
  },
  barWrapper: {
    alignItems: 'center',
    flex: 1,
  },
  barContainer: {
    height: 80,
    justifyContent: 'flex-end',
  },
  bar: {
    width: 24,
    borderRadius: 6,
    minHeight: 8,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  dayLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 6,
  },
  percentLabel: {
    fontSize: 9,
    fontWeight: '500',
  },
});

export default TrendsSection;
