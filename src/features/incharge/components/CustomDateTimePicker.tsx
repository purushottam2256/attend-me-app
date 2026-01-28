/**
 * CustomDateTimePicker - Pure JS Date/Time Picker
 * 
 * Replaces @react-native-community/datetimepicker to avoid native module issues.
 * Features:
 * - Date Picker (Calendar Grid)
 * - Time Picker (List Selection)
 * - Premium UI with Backdrop
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface CustomDateTimePickerProps {
  visible: boolean;
  mode: 'date' | 'time';
  value: Date;
  onClose: () => void;
  onChange: (date: Date) => void;
  isDark: boolean;
  minimumDate?: Date;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const CustomDateTimePicker: React.FC<CustomDateTimePickerProps> = ({
  visible,
  mode,
  value,
  onClose,
  onChange,
  isDark,
  minimumDate,
}) => {
  const insets = useSafeAreaInsets();
  const [tempDate, setTempDate] = useState(new Date(value));
  
  // Calendar State
  const [viewMonth, setViewMonth] = useState(value.getMonth());
  const [viewYear, setViewYear] = useState(value.getFullYear());

  useEffect(() => {
    if (visible) {
      setTempDate(new Date(value));
      setViewMonth(value.getMonth());
      setViewYear(value.getFullYear());
    }
  }, [visible, value]);

  // Colors
  const colors = {
    bg: isDark ? '#1E293B' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#0F172A',
    textSec: isDark ? '#94A3B8' : '#64748B',
    accent: '#3DDC97',
    border: isDark ? '#334155' : '#E2E8F0',
    headerBg: isDark ? '#0F172A' : '#F8FAFC',
    selectedBg: '#3DDC97',
    selectedText: '#064E3B',
    todayText: '#3DDC97',
  };

  const handleSave = () => {
    onChange(tempDate);
    onClose();
  };

  // --- Date Logic ---
  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay();
  };

  const changeMonth = (increment: number) => {
    let newMonth = viewMonth + increment;
    let newYear = viewYear;
    if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    } else if (newMonth < 0) {
      newMonth = 11;
      newYear--;
    }
    setViewMonth(newMonth);
    setViewYear(newYear);
  };

  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getDate() === d2.getDate() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getFullYear() === d2.getFullYear();
  };

  const isDateDisabled = (year: number, month: number, day: number) => {
    if (!minimumDate) return false;
    const dateToCheck = new Date(year, month, day);
    // Reset hours for comparison
    const min = new Date(minimumDate);
    min.setHours(0, 0, 0, 0);
    return dateToCheck < min;
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(viewMonth, viewYear);
    const firstDay = getFirstDayOfMonth(viewMonth, viewYear);
    const slots = [];

    // Empty slots
    for (let i = 0; i < firstDay; i++) {
        slots.push(<View key={`empty-${i}`} style={styles.dayCell} />);
    }

    // Days
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(viewYear, viewMonth, day);
        const isSelected = isSameDay(date, tempDate);
        const isToday = isSameDay(date, new Date());
        const disabled = isDateDisabled(viewYear, viewMonth, day);

        slots.push(
            <TouchableOpacity
                key={`day-${day}`}
                style={[
                    styles.dayCell,
                    isSelected && { backgroundColor: colors.selectedBg, borderRadius: 20 },
                ]}
                disabled={disabled}
                onPress={() => {
                    const newDate = new Date(tempDate);
                    newDate.setFullYear(viewYear);
                    newDate.setMonth(viewMonth);
                    newDate.setDate(day);
                    setTempDate(newDate);
                }}
            >
                <Text style={[
                    styles.dayText,
                    { color: colors.text },
                    disabled && { color: colors.border },
                    isSelected && { color: colors.selectedText, fontWeight: '700' },
                    (!isSelected && isToday) && { color: colors.todayText, fontWeight: '700' }
                ]}>
                    {day}
                </Text>
            </TouchableOpacity>
        );
    }

    return (
        <View style={styles.calendarGrid}>
            <View style={styles.daysHeader}>
                {DAYS.map(d => (
                    <Text key={d} style={[styles.dayHeaderLabel, { color: colors.textSec }]}>{d.charAt(0)}</Text>
                ))}
            </View>
            <View style={styles.daysGrid}>
                {slots}
            </View>
        </View>
    );
  };

  // --- Time Logic ---
  const renderTimePicker = () => {
    const hours = tempDate.getHours();
    const minutes = tempDate.getMinutes();
    const isPM = hours >= 12;
    const displayHours = hours % 12 || 12;
    
    const incrementHour = (delta: number) => {
        const newDate = new Date(tempDate);
        newDate.setHours(hours + delta);
        setTempDate(newDate);
    };

    const incrementMinute = (delta: number) => {
        const newDate = new Date(tempDate);
        newDate.setMinutes(minutes + delta);
        setTempDate(newDate);
    };

    return (
        <View style={styles.timeContainer}>
            {/* Hours */}
            <View style={styles.timeColumn}>
                <TouchableOpacity onPress={() => incrementHour(1)} style={styles.timeBtn}>
                    <Ionicons name="chevron-up" size={24} color={colors.textSec} />
                </TouchableOpacity>
                <Text style={[styles.timeText, { color: colors.text }]}>
                    {displayHours.toString().padStart(2, '0')}
                </Text>
                <TouchableOpacity onPress={() => incrementHour(-1)} style={styles.timeBtn}>
                    <Ionicons name="chevron-down" size={24} color={colors.textSec} />
                </TouchableOpacity>
            </View>

            <Text style={[styles.timeSeparator, { color: colors.text }]}>:</Text>

            {/* Minutes */}
            <View style={styles.timeColumn}>
                <TouchableOpacity onPress={() => incrementMinute(5)} style={styles.timeBtn}>
                    <Ionicons name="chevron-up" size={24} color={colors.textSec} />
                </TouchableOpacity>
                <Text style={[styles.timeText, { color: colors.text }]}>
                    {minutes.toString().padStart(2, '0')}
                </Text>
                <TouchableOpacity onPress={() => incrementMinute(-5)} style={styles.timeBtn}>
                    <Ionicons name="chevron-down" size={24} color={colors.textSec} />
                </TouchableOpacity>
            </View>

            {/* AM/PM */}
            <TouchableOpacity 
                style={[
                    styles.amPmContainer, 
                    { backgroundColor: colors.headerBg, borderColor: colors.border, borderWidth: 1 }
                ]}
                onPress={() => incrementHour(12)} // Toggle AM/PM by adding 12 hours
            >
                <Text style={[styles.amPmText, { color: colors.accent }]}>
                    {isPM ? 'PM' : 'AM'}
                </Text>
            </TouchableOpacity>
        </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.dialog, { backgroundColor: colors.bg }]}>
          {/* Header */}
          <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
            <Text style={[styles.headerTitle, { color: colors.textSec }]}>
                {mode === 'date' ? 'Select Date' : 'Select Time'}
            </Text>
            <View style={styles.headerDisplay}>
                {mode === 'date' ? (
                    <Text style={[styles.displayText, { color: colors.text }]}>
                        {DAYS[tempDate.getDay()]}, {MONTHS[tempDate.getMonth()].slice(0,3)} {tempDate.getDate()}
                    </Text>
                ) : (
                    <Text style={[styles.displayText, { color: colors.text }]}>
                        {tempDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                )}
            </View>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {mode === 'date' ? (
                <>
                    <View style={styles.monthSelector}>
                        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.navBtn}>
                            <Ionicons name="chevron-back" size={20} color={colors.text} />
                        </TouchableOpacity>
                        <Text style={[styles.monthText, { color: colors.text }]}>
                            {MONTHS[viewMonth]} {viewYear}
                        </Text>
                        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.navBtn}>
                            <Ionicons name="chevron-forward" size={20} color={colors.text} />
                        </TouchableOpacity>
                    </View>
                    {renderCalendar()}
                </>
            ) : (
                renderTimePicker()
            )}
          </View>

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity style={styles.footerBtn} onPress={onClose}>
                <Text style={[styles.footerBtnText, { color: colors.textSec }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.footerBtn} onPress={handleSave}>
                <Text style={[styles.footerBtnText, { color: colors.accent, fontWeight: '700' }]}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  headerDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  displayText: {
    fontSize: 28,
    fontWeight: '700',
  },
  content: {
    padding: 16,
  },
  // Calendar Styles
  monthSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  monthText: {
    fontSize: 16,
    fontWeight: '600',
  },
  navBtn: {
    padding: 8,
  },
  calendarGrid: {
    gap: 8,
  },
  daysHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  dayHeaderLabel: {
    width: 32,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    rowGap: 8,
  },
  dayCell: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 14,
  },
  // Time Styles
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    gap: 16,
  },
  timeColumn: {
    alignItems: 'center',
    gap: 8,
  },
  timeBtn: {
    padding: 8,
  },
  timeText: {
    fontSize: 32,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  timeSeparator: {
    fontSize: 32,
    fontWeight: '700',
    paddingBottom: 8,
  },
  amPmContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginLeft: 16,
  },
  amPmText: {
    fontSize: 18,
    fontWeight: '700',
  },
  // Footer
  footer: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  footerBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  footerBtnText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
