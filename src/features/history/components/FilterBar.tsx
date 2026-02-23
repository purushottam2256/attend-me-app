/**
 * FilterBar - Year/Section/Period filter component for HistoryScreen
 * Clean, theme-aware filter boxes with horizontal scrollable chips
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useColors } from '../../../hooks';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';

interface FilterBarProps {
  filterYear: string;
  filterSection: string;
  filterPeriod: string;
  filterBatch: string;
  availableYears: string[];
  availableSections: string[];
  availablePeriods: string[];
  availableBatches: string[];
  onYearChange: (year: string) => void;
  onSectionChange: (section: string) => void;
  onPeriodChange: (period: string) => void;
  onBatchChange: (batch: string) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filterYear,
  filterSection,
  filterPeriod,
  filterBatch,
  availableYears,
  availableSections,
  availablePeriods,
  availableBatches,
  onYearChange,
  onSectionChange,
  onPeriodChange,
  onBatchChange,
}) => {
  const colors = useColors();

  const renderFilterBox = (
    label: string,
    options: string[],
    selected: string,
    onSelect: (value: string) => void,
    displayFn?: (value: string) => string
  ) => (
    <View style={[styles.filterBox, { 
      backgroundColor: colors.inputBg,
      borderColor: colors.cardBorder,
    }]}>
      <Text style={[styles.filterLabel, { color: colors.textMuted }]}>{label}</Text>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        contentContainerStyle={styles.filterChips}
      >
        {options.map(opt => (
          <TouchableOpacity
            key={`${label}-${opt}`}
            style={[
              styles.filterChip,
              { backgroundColor: colors.inputBg },
              selected === opt && { backgroundColor: colors.indicator }
            ]}
            onPress={() => onSelect(opt)}
          >
            <Text style={{ 
              color: selected === opt ? '#000' : colors.textSecondary,
              fontSize: normalizeFont(12),
              fontWeight: '600',
            }}>
              {displayFn ? displayFn(opt) : opt === 'all' ? 'All' : opt}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.container}>
      {availableYears.length > 1 && renderFilterBox('Year', availableYears, filterYear, onYearChange)}
      {availableSections.length > 1 && renderFilterBox('Section', availableSections, filterSection, onSectionChange)}
      {availablePeriods.length > 1 && renderFilterBox('Period', availablePeriods, filterPeriod, onPeriodChange)}
      {availableBatches.length > 1 && renderFilterBox('Batch', availableBatches, filterBatch, onBatchChange, (val) => val === 'all' ? 'All Batches' : `Batch ${val}`)}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: verticalScale(8),
  },
  filterBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
    marginHorizontal: scale(12),
    marginTop: verticalScale(8),
    borderRadius: moderateScale(12),
    borderWidth: 1,
  },
  filterLabel: {
    fontSize: normalizeFont(11),
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginRight: scale(10),
    minWidth: scale(55),
  },
  filterChips: {
    flexDirection: 'row',
    gap: scale(6),
    paddingRight: scale(12),
  },
  filterChip: {
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(8),
    minWidth: scale(36),
    alignItems: 'center',
  },
});

export default FilterBar;
