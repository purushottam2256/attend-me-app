import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, TextInput, Platform, Modal, KeyboardAvoidingView, ScrollView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTheme } from '../../../contexts';
import { useConnectionStatus } from '../../../hooks';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';
import { Colors, Fonts } from '../../../constants';
import { PulsingDots } from '../../../components/ui/LoadingAnimation';
import { safeHaptic } from '../../../utils/haptics';

import { getCumulativeAttendance, type CumulativeAttendanceResult } from '../services/inchargeService';
import { supabase } from '../../../config/supabase';

type DatePreset = 'month' | 'custom';

// Generate last 6 months as {label, start, end}
const generateMonthOptions = () => {
  const months: { label: string; key: string; start: Date; end: Date }[] = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = i === 0 ? new Date() : new Date(d.getFullYear(), d.getMonth() + 1, 0);
    months.push({
      label: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
      key: `${d.getFullYear()}-${d.getMonth()}`,
      start: d,
      end,
    });
  }
  return months;
};

export const CumulativeAttendanceScreen: React.FC = () => {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { status: connectionStatus } = useConnectionStatus();

  const classInfo = route.params?.classInfo;

  // States
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CumulativeAttendanceResult | null>(null);
  const [isOfflineData, setIsOfflineData] = useState(false);
  
  // Month options
  const monthOptions = useMemo(() => generateMonthOptions(), []);

  // Date Filtering
  const [datePreset, setDatePreset] = useState<DatePreset>('month');
  const [selectedMonthKey, setSelectedMonthKey] = useState(monthOptions[0].key);
  const [startDate, setStartDate] = useState<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [endDate, setEndDate] = useState<Date>(new Date());
  
  // Custom Date Picker Modal States
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [tempStart, setTempStart] = useState<Date>(startDate);
  const [tempEnd, setTempEnd] = useState<Date>(endDate);
  const [activePicker, setActivePicker] = useState<'start' | 'end' | null>(null);

  // List Filtering & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'roll_asc' | 'perc_asc' | 'perc_desc'>('roll_asc');
  const [viewMode, setViewMode] = useState<'table' | 'student'>('table');
  
  // Per-date attendance data for table view
  const [sessionDates, setSessionDates] = useState<string[]>([]);
  const [studentDateMap, setStudentDateMap] = useState<Record<string, Record<string, string>>>({});

  // Colors
  const colors = {
    textPrimary: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#8E8E93' : '#86868B',
    surface: isDark ? '#082020' : '#FFFFFF',
    accent: '#34C759',
    border: isDark ? '#38383A' : '#E5E5EA',
  };

  // --- Date Logic ---
  const selectMonth = useCallback((key: string) => {
    safeHaptic(Haptics.ImpactFeedbackStyle.Light);
    setDatePreset('month');
    setSelectedMonthKey(key);
    const opt = monthOptions.find(m => m.key === key);
    if (opt) {
      setStartDate(opt.start);
      setEndDate(opt.end);
    }
  }, [monthOptions]);

  const openCustomRange = useCallback(() => {
    safeHaptic(Haptics.ImpactFeedbackStyle.Light);
    setDatePreset('custom');
    setTempStart(startDate);
    setTempEnd(endDate);
    setShowDatePickerModal(true);
  }, [startDate, endDate]);

  const confirmCustomDates = () => {
    safeHaptic(Haptics.ImpactFeedbackStyle.Medium);
    if (tempStart > tempEnd) {
      alert("Start date cannot be after end date");
      return;
    }
    setStartDate(tempStart);
    setEndDate(tempEnd);
    setShowDatePickerModal(false);
  };

  // --- Fetch Data ---
  const loadData = useCallback(async () => {
    if (!classInfo) return;
    setLoading(true);
    
    // Formatting YYYY-MM-DD local time
    const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2,'0')}-${String(startDate.getDate()).padStart(2,'0')}`;
    const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth()+1).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}`;
    const cacheKey = `@attend_me/cumulative_cache_${classInfo.dept}_${classInfo.year}_${classInfo.section}_${startStr}_${endStr}`;

    try {
      if (connectionStatus === 'offline') {
         const cached = await AsyncStorage.getItem(cacheKey);
         if (cached) {
            const parsed = JSON.parse(cached);
            setData(parsed.data);
            setSessionDates(parsed.sessionDates || []);
            setStudentDateMap(parsed.studentDateMap || {});
            setIsOfflineData(true);
         }
         return;
      }
      
      setIsOfflineData(false);
      const result = await getCumulativeAttendance(classInfo.dept, classInfo.year, classInfo.section, startStr, endStr);
      setData(result);
      
      // Fetch per-date attendance for table view
      let fetchedSessionDates: string[] = [];
      let fetchedStudentDateMap: Record<string, Record<string, string>> = {};
      try {
        const { data: sessions } = await supabase
          .from('attendance_sessions')
          .select('id, date')
          .eq('target_dept', classInfo.dept)
          .eq('target_year', classInfo.year)
          .eq('target_section', classInfo.section)
          .gte('date', startStr)
          .lte('date', endStr)
          .order('date');
        
        if (sessions && sessions.length > 0) {
          const uniqueDates = [...new Set(sessions.map(s => s.date))].sort();
          setSessionDates(uniqueDates);
          
          const sessionIds = sessions.map(s => s.id);
          const sessionDateMap: Record<string, string> = {};
          sessions.forEach(s => { sessionDateMap[s.id] = s.date; });
          
          const { data: logs } = await supabase
            .from('attendance_logs')
            .select('student_id, status, session_id')
            .in('session_id', sessionIds);
          
          if (logs) {
            const dateMap: Record<string, Record<string, string>> = {};
            logs.forEach((log: any) => {
              const date = sessionDateMap[log.session_id];
              if (!date) return;
              if (!dateMap[log.student_id]) dateMap[log.student_id] = {};
              // If multiple sessions on same date, show 'P' if any is present
              const existing = dateMap[log.student_id][date];
              if (!existing || log.status === 'present' || log.status === 'od') {
                dateMap[log.student_id][date] = log.status;
              }
            });
            fetchedStudentDateMap = dateMap;
            fetchedSessionDates = uniqueDates;
            setStudentDateMap(dateMap);
          }
        } else {
          setSessionDates([]);
          setStudentDateMap({});
        }

        // Cache the combined results
        await AsyncStorage.setItem(cacheKey, JSON.stringify({
            data: result,
            sessionDates: fetchedSessionDates,
            studentDateMap: fetchedStudentDateMap,
            timestamp: Date.now()
        }));
      } catch (e) {
        console.error('Error fetching per-date data:', e);
      }
    } catch (e) {
      console.error("Failed to load cumulative attendance", e);
      // Fallback to cache on error
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
         const parsed = JSON.parse(cached);
         setData(parsed.data);
         setSessionDates(parsed.sessionDates || []);
         setStudentDateMap(parsed.studentDateMap || {});
         setIsOfflineData(true);
      }
    } finally {
      setLoading(false);
    }
  }, [classInfo, startDate, endDate, connectionStatus]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- Memoized Sorting & Filtering ---
  const processedStudents = useMemo(() => {
    if (!data?.students) return [];
    
    let result = [...data.students];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s => s.full_name.toLowerCase().includes(q) || s.roll_no.toLowerCase().includes(q));
    }

    if (sortOrder === 'roll_asc') {
      result.sort((a, b) => a.roll_no.localeCompare(b.roll_no, undefined, { numeric: true }));
    } else if (sortOrder === 'perc_desc') {
      result.sort((a, b) => b.attendance_percentage - a.attendance_percentage);
    } else if (sortOrder === 'perc_asc') {
      result.sort((a, b) => a.attendance_percentage - b.attendance_percentage);
    }

    return result;
  }, [data, searchQuery, sortOrder]);


  // --- Export Logic ---
  const exportToCSV = async () => {
    if (!data || !classInfo) return;
    safeHaptic(Haptics.ImpactFeedbackStyle.Medium);

    const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2,'0')}-${String(startDate.getDate()).padStart(2,'0')}`;
    const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth()+1).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}`;

    // 1. Build CSV Content
    const headers = ['Roll No', 'Student Name', 'Present', 'Absent', 'OD', 'Leave', 'Total Context', 'Percentage (%)'];
    const rows = processedStudents.map(s => [
      s.roll_no,
      `"${s.full_name}"`, // Quote to handle commas in names
      s.present_sessions,
      s.absent_sessions,
      s.od_sessions,
      s.leave_sessions,
      (s.present_sessions + s.absent_sessions + s.od_sessions),
      s.attendance_percentage
    ]);

    const csvContent = [
      `Class: ${classInfo.dept}-${classInfo.year}${classInfo.section},,Date Range: ${startStr} to ${endStr}`,
      `Total Sessions: ${data.totalSessions},,Class Average: ${data.classAverage}%`,
      '',
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    // 2. Save File Locally
    const safeSection = classInfo.section.replace(/[^a-zA-Z0-9]/g, '-');
    const filename = `Attendance_${classInfo.dept}-${classInfo.year}${safeSection}_${startStr}_to_${endStr}.csv`;
    const uri = ((FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory) + filename;

    try {
      await (FileSystem as any).writeAsStringAsync(uri, csvContent, { encoding: 'utf8' });
      
      // 3. Share File
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export Attendance Report',
          UTI: 'public.comma-separated-values-text' // iOS
        });
      } else {
        alert("Sharing is not available on this device");
      }
    } catch (e) {
      console.error("Export failed:", e);
      alert("Failed to export report");
    }
  };


  // --- Sub-components ---
  const renderHeader = () => (
    <View style={{ paddingTop: insets.top, paddingBottom: 16 }}>
        {connectionStatus !== 'online' && (
           <View style={{ backgroundColor: '#F59E0B', padding: scale(8), alignItems: 'center' }}>
              <Text style={{ color: '#FFF', fontSize: normalizeFont(12), fontWeight: '600' }}>
                 Offline Mode. Showing cached data.
              </Text>
           </View>
        )}
        <LinearGradient
            colors={[
                isDark ? 'rgba(15,23,42,0.95)' : 'rgba(248,250,252,0.95)',
                isDark ? 'rgba(15,23,42,0.8)' : 'rgba(248,250,252,0.8)'
            ]}
            style={{ paddingHorizontal: 20, paddingBottom: 16, paddingTop: 10 }}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <TouchableOpacity 
                        style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => navigation.goBack()}
                >
                    <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <View>
                    <Text style={{ fontFamily: Fonts.family.bold, fontSize: 18, color: isDark ? '#FFF' : '#0F172A' }}>Cumulative</Text>
                    <Text style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B' }}>{classInfo ? `${classInfo.dept}-${classInfo.year}${classInfo.section}` : ''}</Text>
                </View>
            </View>
            
            <TouchableOpacity 
                onPress={exportToCSV}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${colors.accent}20`, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 100 }}
            >
                <Ionicons name="download" size={16} color={colors.accent} />
                <Text style={{ fontSize: 13, fontFamily: Fonts.family.semiBold, color: colors.accent }}>Export</Text>
            </TouchableOpacity>
            </View>
        </LinearGradient>

        {/* Month Scroller */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, marginTop: 16 }}>
            {monthOptions.map(opt => (
                <TouchableOpacity 
                    key={opt.key}
                    onPress={() => selectMonth(opt.key)}
                    style={{
                        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100,
                        backgroundColor: datePreset === 'month' && selectedMonthKey === opt.key ? colors.accent : (isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9'),
                        borderWidth: 1,
                        borderColor: datePreset === 'month' && selectedMonthKey === opt.key ? colors.accent : 'transparent',
                    }}
                >
                    <Text style={{ 
                        fontFamily: datePreset === 'month' && selectedMonthKey === opt.key ? Fonts.family.bold : Fonts.family.medium, 
                        color: datePreset === 'month' && selectedMonthKey === opt.key ? '#FFF' : colors.textSecondary,
                        fontSize: 13 
                    }}>{opt.label}</Text>
                </TouchableOpacity>
            ))}
            <TouchableOpacity 
                onPress={openCustomRange}
                style={{
                    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100,
                    backgroundColor: datePreset === 'custom' ? colors.accent : (isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9'),
                    borderWidth: 1,
                    borderColor: datePreset === 'custom' ? colors.accent : 'transparent',
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                }}
            >
                <Ionicons name="calendar-outline" size={14} color={datePreset === 'custom' ? '#FFF' : colors.textSecondary} />
                <Text style={{ 
                    fontFamily: datePreset === 'custom' ? Fonts.family.bold : Fonts.family.medium, 
                    color: datePreset === 'custom' ? '#FFF' : colors.textSecondary,
                    fontSize: 13 
                }}>Custom</Text>
            </TouchableOpacity>
        </ScrollView>

        {/* Session count & date range */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingHorizontal: 20 }}>
             <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                 {startDate.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})} — {endDate.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}
             </Text>
             <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                 {data?.totalSessions !== undefined ? `${data.totalSessions} Sessions` : ''}
             </Text>
        </View>
    </View>
  );

  const renderStats = () => {
    if (!data) return null;
    return (
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
            <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: Fonts.family.medium }}>Avg. Attendance</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 28, fontFamily: Fonts.family.bold, marginTop: 4 }}>
                    {data.classAverage}%
                </Text>
            </View>
            <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: Fonts.family.medium }}>Total Sessions</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 28, fontFamily: Fonts.family.bold, marginTop: 4 }}>
                    {data.totalSessions}
                </Text>
            </View>
        </View>
    );
  };

  const renderControls = () => (
    <>
      <View style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', borderRadius: 12, paddingHorizontal: 12, height: 44, borderWidth: 1, borderColor: colors.border }}>
              <Ionicons name="search" size={18} color={colors.textSecondary} />
              <TextInput 
                  style={{ flex: 1, marginLeft: 8, color: colors.textPrimary, fontSize: 15 }} 
                  placeholder="Ask by name/roll" 
                  placeholderTextColor={colors.textSecondary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
              />
          </View>
          <TouchableOpacity 
              style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
              onPress={() => {
                  safeHaptic(Haptics.ImpactFeedbackStyle.Light);
                  if (sortOrder === 'roll_asc') setSortOrder('perc_desc');
                  else if (sortOrder === 'perc_desc') setSortOrder('perc_asc');
                  else setSortOrder('roll_asc');
              }}
          >
              <Ionicons name={sortOrder === 'roll_asc' ? 'list' : (sortOrder === 'perc_asc' ? 'arrow-up' : 'arrow-down')} size={20} color={isDark ? '#F1F5F9' : '#0F172A'} />
          </TouchableOpacity>
      </View>
      
      {/* View Toggle */}
      <View style={{ marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity 
              onPress={() => setViewMode('table')}
              style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: viewMode === 'table' ? colors.accent : (isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9'), borderRadius: 8 }}
          >
              <Text style={{ fontSize: 13, fontFamily: Fonts.family.semiBold, color: viewMode === 'table' ? '#FFF' : (isDark ? '#94A3B8' : '#64748B') }}>Table View</Text>
          </TouchableOpacity>
          <TouchableOpacity 
              onPress={() => setViewMode('student')}
              style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: viewMode === 'student' ? colors.accent : (isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9'), borderRadius: 8 }}
          >
              <Text style={{ fontSize: 13, fontFamily: Fonts.family.semiBold, color: viewMode === 'student' ? '#FFF' : (isDark ? '#94A3B8' : '#64748B') }}>Student Wise</Text>
          </TouchableOpacity>
      </View>

  </>
  );

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
        {renderHeader()}
        
        {loading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <PulsingDots size="large" color={colors.accent} />
                <Text style={{ marginTop: 20, color: colors.textSecondary, fontFamily: Fonts.family.medium }}>Aggregating Data...</Text>
            </View>
        ) : (
            <FlatList
                data={processedStudents}
                keyExtractor={item => item.student_id}
                contentContainerStyle={{ paddingBottom: 60 }}
                removeClippedSubviews={true}
                maxToRenderPerBatch={10}
                windowSize={5}
                initialNumToRender={10}
                ListHeaderComponent={<>{renderStats()}{renderControls()}
                  {/* Scrollable Date Table */}
                  {viewMode === 'table' && sessionDates.length > 0 && (
                    <View style={{ marginHorizontal: 20, marginBottom: 16, backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' }}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={{ minWidth: '100%' }}>
                        <View>
                          {/* Header Row - Dates */}
                          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                            <View style={{ width: 140, padding: 12, borderRightWidth: 1, borderRightColor: isDark ? '#334155' : '#E2E8F0', justifyContent: 'center' }}>
                              <Text style={{ fontFamily: Fonts.family.bold, fontSize: 13, color: isDark ? '#F1F5F9' : '#0F172A' }}>Student</Text>
                            </View>
                            {sessionDates.map((date, di) => {
                              const d = new Date(date);
                              return (
                                <View key={di} style={{ width: 50, padding: 8, alignItems: 'center', borderRightWidth: 1, borderRightColor: isDark ? '#334155' : '#E2E8F0' }}>
                                  <Text style={{ fontSize: 9, color: isDark ? '#94A3B8' : '#64748B', fontFamily: Fonts.family.medium }}>{d.toLocaleString('default', { month: 'short' })}</Text>
                                  <Text style={{ fontSize: 12, color: isDark ? '#F1F5F9' : '#0F172A', fontFamily: Fonts.family.bold }}>{d.getDate()}</Text>
                                </View>
                              );
                            })}
                            <View style={{ width: 60, padding: 8, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 11, color: isDark ? '#F1F5F9' : '#0F172A', fontFamily: Fonts.family.bold }}>%</Text>
                            </View>
                          </View>
                          
                          {/* Student Rows */}
                          {processedStudents.map((student, si) => (
                            <View key={student.student_id} style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: si % 2 === 0 ? 'transparent' : (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)') }}>
                              <View style={{ width: 140, padding: 10, justifyContent: 'center', borderRightWidth: 1, borderRightColor: isDark ? '#334155' : '#E2E8F0' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Text numberOfLines={1} style={{ fontSize: 12, fontFamily: Fonts.family.semiBold, color: isDark ? '#F1F5F9' : '#0F172A', flex: 1 }}>{student.full_name}</Text>
                                  {student.is_le && <View style={{ backgroundColor: '#8B5CF6', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 8, color: '#FFF', fontWeight: 'bold' }}>LE</Text></View>}
                                </View>
                                <Text style={{ fontSize: 10, color: isDark ? '#94A3B8' : '#64748B', fontFamily: Fonts.family.medium, marginTop: 2 }}>{student.roll_no}</Text>
                              </View>
                              {(() => {
                                let streak = 0;
                                return sessionDates.map((date, di) => {
                                  const status = studentDateMap[student.student_id]?.[date];
                                  let cellColor = isDark ? '#475569' : '#CBD5E1'; // No data
                                  let cellText = '-';
                                  if (status === 'present' || status === 'od') {
                                    streak++;
                                    cellColor = '#10B981';
                                    cellText = status === 'od' ? 'OD' : `${streak}`;
                                  } else if (status === 'absent') {
                                    streak = 0;
                                    cellColor = '#EF4444';
                                    cellText = 'A';
                                  } else if (status === 'leave') {
                                    cellColor = '#F59E0B';
                                    cellText = 'L';
                                  }
                                  return (
                                    <View key={di} style={{ width: 50, padding: 6, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: isDark ? '#334155' : '#E2E8F0' }}>
                                      <Text style={{ fontSize: 11, fontFamily: Fonts.family.bold, color: cellColor }}>{cellText}</Text>
                                    </View>
                                  );
                                });
                              })()}
                              <View style={{ width: 60, padding: 6, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 12, fontFamily: Fonts.family.bold, color: student.attendance_percentage < 65 ? '#EF4444' : student.attendance_percentage < 75 ? '#F59E0B' : '#10B981' }}>{student.attendance_percentage}%</Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  )}
                </>}
                renderItem={({item}) => {
                     // Status Badge
                     let badgeColor = '#10B981'; // Green
                     if (item.attendance_percentage < 65) badgeColor = '#EF4444'; // Red
                     else if (item.attendance_percentage < 75) badgeColor = '#F59E0B'; // Amber

                     if (viewMode !== 'student') return null;

                     return (
                         <View style={{ 
                             marginHorizontal: 20, marginBottom: 12, padding: 16,
                             backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                             borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0',
                             borderRadius: 16,
                             flexDirection: 'row', alignItems: 'center'
                         }}>
                             <View style={{ flex: 1 }}>
                                 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                     <Text style={{ fontFamily: Fonts.family.bold, fontSize: 16, color: isDark ? '#F1F5F9' : '#0F172A', flexShrink: 1 }} numberOfLines={1}>
                                         {item.full_name}
                                     </Text>
                                     {item.is_le && <View style={{ backgroundColor: '#8B5CF6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 9, color: '#FFF', fontWeight: 'bold' }}>LE</Text></View>}
                                 </View>
                                 <Text style={{ fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: isDark ? '#94A3B8' : '#64748B' }}>
                                     {item.roll_no}
                                 </Text>
                                 
                                 {/* Detailed Session breakdown */}
                                 <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                                      <Text style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B' }}>P: <Text style={{ color: isDark ? '#FFFFFF' : '#0F172A', fontFamily: Fonts.family.semiBold }}>{item.present_sessions}</Text></Text>
                                      <Text style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B' }}>A: <Text style={{ color: isDark ? '#FFFFFF' : '#0F172A', fontFamily: Fonts.family.semiBold }}>{item.absent_sessions}</Text></Text>
                                      {item.od_sessions > 0 && <Text style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B' }}>OD: <Text style={{ color: '#3B82F6', fontFamily: Fonts.family.semiBold }}>{item.od_sessions}</Text></Text>}
                                      {item.leave_sessions > 0 && <Text style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B' }}>L: <Text style={{ color: '#F59E0B', fontFamily: Fonts.family.semiBold }}>{item.leave_sessions}</Text></Text>}
                                 </View>
                             </View>

                             <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                                 <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: `${badgeColor}20` }}>
                                     <Text style={{ fontSize: 14, fontFamily: Fonts.family.bold, color: badgeColor }}>
                                         {item.attendance_percentage}%
                                     </Text>
                                 </View>
                             </View>
                         </View>
                     );
                }}
            />
        )}

        {/* Custom Date Modal */}
        <Modal visible={showDatePickerModal} animationType="fade" transparent={true} onRequestClose={() => setShowDatePickerModal(false)}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
                <View style={{ backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <Text style={{ fontSize: 20, fontFamily: Fonts.family.bold, color: colors.textPrimary }}>Custom Range</Text>
                        <TouchableOpacity onPress={() => setShowDatePickerModal(false)}>
                            <Ionicons name="close-circle" size={28} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 16, marginBottom: 24 }}>
                        <TouchableOpacity 
                            style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F5F5', borderWidth: 1, borderColor: activePicker === 'start' ? colors.accent : 'transparent' }}
                            onPress={() => setActivePicker('start')}
                        >
                            <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 4 }}>Start Date</Text>
                            <Text style={{ color: colors.textPrimary, fontFamily: Fonts.family.semiBold, fontSize: 15 }}>{tempStart.toLocaleDateString()}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F5F5', borderWidth: 1, borderColor: activePicker === 'end' ? colors.accent : 'transparent' }}
                            onPress={() => setActivePicker('end')}
                        >
                            <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 4 }}>End Date</Text>
                            <Text style={{ color: colors.textPrimary, fontFamily: Fonts.family.semiBold, fontSize: 15 }}>{tempEnd.toLocaleDateString()}</Text>
                        </TouchableOpacity>
                    </View>

                    {activePicker && (
                        <View style={{ alignItems: 'center', marginBottom: 24 }}>
                            <DateTimePicker
                                mode="date"
                                display="spinner"
                                value={activePicker === 'start' ? tempStart : tempEnd}
                                maximumDate={new Date()}
                                onChange={(event, date) => {
                                    if (Platform.OS === 'android') {
                                        setActivePicker(null);
                                    }
                                    if (!date || event.type === 'dismissed') return;
                                    if (activePicker === 'start') setTempStart(date);
                                    else setTempEnd(date);
                                }}
                                textColor={colors.textPrimary}
                            />
                        </View>
                    )}

                    <TouchableOpacity 
                        style={{ backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
                        onPress={confirmCustomDates}
                    >
                        <Text style={{ color: '#FFF', fontFamily: Fonts.family.bold, fontSize: 16 }}>Apply Range</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>

    </KeyboardAvoidingView>
  );
};
