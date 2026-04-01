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
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as XLSX from 'xlsx';

import { useTheme } from '../../../contexts';
import { useConnectionStatus } from '../../../hooks';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';
import { Colors, Fonts } from '../../../constants';
import { PulsingDots } from '../../../components/ui/LoadingAnimation';
import { safeHaptic } from '../../../utils/haptics';

import { getCumulativeAttendance, type CumulativeAttendanceResult } from '../services/inchargeService';
import { supabase } from '../../../config/supabase';

type DatePreset = 'month' | 'custom';

const generateMonthOptions = () => {
  const months: { label: string; key: string; start: Date; end: Date }[] = [];
  const currentYear = new Date().getFullYear();
  for (let i = 0; i < 12; i++) {
    const d = new Date(currentYear, i, 1);
    const end = new Date(currentYear, i + 1, 0);
    months.push({
      label: d.toLocaleString('default', { month: 'long' }),
      key: `${currentYear}-${i}`,
      start: d,
      end,
    });
  }
  return months;
};

const TableRow = React.memo(({ student, si, isDark, allDatesInRange, specialDays, studentDateMap }: any) => {
  return (
    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: si % 2 === 0 ? 'transparent' : (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)') }}>
      <View style={{ width: 140, padding: 10, justifyContent: 'center', borderRightWidth: 1, borderRightColor: isDark ? '#334155' : '#E2E8F0' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text numberOfLines={1} style={{ fontSize: 12, fontFamily: Fonts.family.semiBold, color: isDark ? '#F1F5F9' : '#0F172A', flex: 1 }}>{student.full_name}</Text>
          {student.is_le && <View style={{ backgroundColor: '#8B5CF6', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 8, color: '#FFF', fontWeight: 'bold' }}>LE</Text></View>}
        </View>
        <Text style={{ fontSize: 10, color: isDark ? '#94A3B8' : '#64748B', fontFamily: Fonts.family.medium, marginTop: 2 }}>{student.roll_no}</Text>
      </View>
      {(() => {
        let streak = 0;
        return allDatesInRange.map((date: string, di: number) => {
          const special = specialDays[date];
          
          if (special) {
            streak = 0;
            let stripColor = '#F97316';
            if (special.type === 'holiday') stripColor = '#EAB308';
            else if (special.type === 'event') stripColor = '#A855F7';
            else if (special.type === 'exam') stripColor = '#22C55E';
            
            return (
              <View key={di} style={{ width: 50, overflow: 'visible', alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: stripColor }}>
                {si % 10 === 3 && (
                  <View style={{ position: 'absolute', width: 260, height: 50, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-90deg' }], zIndex: 10 }}>
                    <Text style={{ fontSize: 11, fontFamily: Fonts.family.bold, color: 'rgba(255,255,255,0.95)', textAlign: 'center', letterSpacing: 1 }} numberOfLines={1}>
                      {special.type.toLowerCase() === 'sunday' ? 'SUNDAY' : `${special.label.toUpperCase()} (${special.type.toUpperCase()})`}
                    </Text>
                  </View>
                )}
              </View>
            );
          }

          const status = studentDateMap[student.student_id]?.[date];
          let cellColor = isDark ? '#475569' : '#CBD5E1';
          let cellText = '-';
          if (status === 'od') {
            streak++;
            cellColor = '#3B82F6';
            cellText = `od:${streak}`;
          } else if (status === 'present') {
            streak++;
            cellColor = '#10B981';
            cellText = `${streak}`;
          } else if (status === 'absent') {
            streak = 0;
            cellColor = '#EF4444';
            cellText = 'A';
          } else if (status === 'leave') {
            cellColor = '#F59E0B';
            cellText = 'L';
          } else {
            streak = 0;
          }
          return (
            <View key={di} style={{ width: 50, padding: 6, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: isDark ? '#334155' : '#E2E8F0' }}>
              <Text style={{ fontSize: status === 'od' ? 10 : 11, fontFamily: Fonts.family.bold, color: cellColor }}>{cellText}</Text>
            </View>
          );
        });
      })()}
      
      <View style={{ width: 55, padding: 6, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: isDark ? '#334155' : '#E2E8F0' }}>
        <Text style={{ fontSize: 12, fontFamily: Fonts.family.bold, color: '#10B981' }}>{student.present_sessions + student.od_sessions}</Text>
      </View>
      <View style={{ width: 60, padding: 6, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 12, fontFamily: Fonts.family.bold, color: student.attendance_percentage < 65 ? '#EF4444' : student.attendance_percentage < 75 ? '#F59E0B' : '#10B981' }}>{student.attendance_percentage}%</Text>
      </View>
    </View>
  );
}, (prevProps, nextProps) => {
  return prevProps.student === nextProps.student 
    && prevProps.allDatesInRange === nextProps.allDatesInRange 
    && prevProps.specialDays === nextProps.specialDays
    && prevProps.studentDateMap === nextProps.studentDateMap;
});

const TableSkeletonRow = React.memo(({ isDark, allDatesInRange, index }: any) => (
  <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: index % 2 === 0 ? 'transparent' : (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)') }}>
    <View style={{ width: 140, padding: 10, justifyContent: 'center', borderRightWidth: 1, borderRightColor: isDark ? '#334155' : '#E2E8F0' }}>
      <View style={{ height: 12, backgroundColor: isDark ? '#334155' : '#E2E8F0', borderRadius: 4, width: '80%', marginBottom: 6, opacity: 0.5 }} />
      <View style={{ height: 10, backgroundColor: isDark ? '#334155' : '#E2E8F0', borderRadius: 4, width: '50%', opacity: 0.5 }} />
    </View>
    {allDatesInRange.map((_: any, di: number) => (
      <View key={di} style={{ width: 50, padding: 6, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: isDark ? '#334155' : '#E2E8F0' }}>
        <View style={{ height: 10, backgroundColor: isDark ? '#334155' : '#E2E8F0', borderRadius: 4, width: '40%', opacity: 0.5 }} />
      </View>
    ))}
    <View style={{ width: 55, padding: 6, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: isDark ? '#334155' : '#E2E8F0' }}>
      <View style={{ height: 12, backgroundColor: isDark ? '#334155' : '#E2E8F0', borderRadius: 4, width: '60%', opacity: 0.5 }} />
    </View>
    <View style={{ width: 60, padding: 6, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ height: 12, backgroundColor: isDark ? '#334155' : '#E2E8F0', borderRadius: 4, width: '60%', opacity: 0.5 }} />
    </View>
  </View>
));

export const CumulativeAttendanceScreen: React.FC = () => {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { status: connectionStatus } = useConnectionStatus();

  const classInfo = route.params?.classInfo;

  // States
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [data, setData] = useState<CumulativeAttendanceResult | null>(null);
  const [isOfflineData, setIsOfflineData] = useState(false);
  
  // Month options
  const monthOptions = useMemo(() => generateMonthOptions(), []);

  // Date Filtering
  const [datePreset, setDatePreset] = useState<DatePreset>('month');
  const [selectedMonthKey, setSelectedMonthKey] = useState(monthOptions[new Date().getMonth()].key);
  const [startDate, setStartDate] = useState<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [endDate, setEndDate] = useState<Date>(new Date());
  
  // Custom Date Picker Modal States
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [tempStart, setTempStart] = useState<Date>(startDate);
  const [tempEnd, setTempEnd] = useState<Date>(endDate);
  const [activePicker, setActivePicker] = useState<'start' | 'end' | null>(null);

  // List Filtering & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'student'>('table');
  
  // Per-date attendance data for table view
  const [sessionDates, setSessionDates] = useState<string[]>([]);
  const [allDatesInRange, setAllDatesInRange] = useState<string[]>([]);
  const [studentDateMap, setStudentDateMap] = useState<Record<string, Record<string, string>>>({});
  // Holiday/event/exam markers: date -> type
  const [specialDays, setSpecialDays] = useState<Record<string, { type: string; label: string }>>({});

  // Progressive Rendering count
  const [tableRenderCount, setTableRenderCount] = useState(15);


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

    // Generate all dates in range
    const generateAllDates = (start: string, end: string): string[] => {
      const dates: string[] = [];
      const d = new Date(start + 'T00:00:00');
      const endD = new Date(end + 'T00:00:00');
      while (d <= endD) {
        dates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
        d.setDate(d.getDate() + 1);
      }
      return dates;
    };

    try {
      if (connectionStatus === 'offline') {
         const cached = await AsyncStorage.getItem(cacheKey);
         if (cached) {
            const parsed = JSON.parse(cached);
            setData(parsed.data);
            setSessionDates(parsed.sessionDates || []);
            setAllDatesInRange(parsed.allDatesInRange || []);
            setStudentDateMap(parsed.studentDateMap || {});
            setSpecialDays(parsed.specialDays || {});
            setIsOfflineData(true);
         }
         return;
      }
      
      setIsOfflineData(false);
      const result = await getCumulativeAttendance(classInfo.dept, classInfo.year, classInfo.section, startStr, endStr);
      setData(result);

      // Generate complete date range
      const allDates = generateAllDates(startStr, endStr);
      setAllDatesInRange(allDates);

      // Fetch holidays/events/exams in range
      let specialDaysMap: Record<string, { type: string; label: string }> = {};
      try {
        const { data: holidays } = await supabase
          .from('holidays')
          .select('date, title, type')
          .gte('date', startStr)
          .lte('date', endStr);
        
        if (holidays) {
          holidays.forEach((h: any) => {
            specialDaysMap[h.date] = { type: h.type || 'holiday', label: h.title || 'Holiday' };
          });
        }
      } catch { /* ignore holiday fetch errors */ }

      // Mark Sundays
      allDates.forEach(dateStr => {
        const d = new Date(dateStr + 'T00:00:00');
        if (d.getDay() === 0 && !specialDaysMap[dateStr]) {
          specialDaysMap[dateStr] = { type: 'sunday', label: 'Sunday' };
        }
      });
      setSpecialDays(specialDaysMap);
      
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
            allDatesInRange: allDates,
            studentDateMap: fetchedStudentDateMap,
            specialDays: specialDaysMap,
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
         setAllDatesInRange(parsed.allDatesInRange || []);
         setStudentDateMap(parsed.studentDateMap || {});
         setSpecialDays(parsed.specialDays || {});
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
      result = result.filter(s => {
        return s.full_name?.toLowerCase().includes(q) || s.roll_no?.toLowerCase().includes(q);
      });
    }

    result.sort((a, b) => {
      return (a.roll_no || '').localeCompare(b.roll_no || '');
    });

    return result;
  }, [data, searchQuery]);

  // --- Export Logic (Excel) ---
  const exportToExcel = async () => {
    if (!data || !classInfo || isExporting) return;
    safeHaptic(Haptics.ImpactFeedbackStyle.Medium);

    setIsExporting(true);
    // Yield to let UI update loader
    await new Promise(resolve => setTimeout(resolve, 50));

    const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2,'0')}-${String(startDate.getDate()).padStart(2,'0')}`;
    const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth()+1).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}`;

    try {
      // Build worksheet data
      const wsData: any[][] = [
        [`Attendance Report — ${classInfo.dept}-${classInfo.year}${classInfo.section}`],
        [`Date Range: ${startStr} to ${endStr}`, '', `Total Sessions: ${data.totalSessions}`, '', `Class Average: ${data.classAverage}%`],
        [],
      ];

      // Headers with per-date columns
      const datesToUse = allDatesInRange.length > 0 ? allDatesInRange : sessionDates;
      const headers = ['Roll No', 'Student Name'];
      datesToUse.forEach(date => {
        const d = new Date(date + 'T00:00:00');
        const special = specialDays[date];
        if (special) {
          headers.push(`${d.getDate()}/${d.getMonth()+1} (${special.label})`);
        } else {
          headers.push(`${d.getDate()}/${d.getMonth()+1}`);
        }
      });
      headers.push('Present', 'Absent', 'OD', 'Leave', 'Total', 'P+OD', 'Percentage (%)');
      wsData.push(headers);

      // Student rows
      let currentStreak = 0;
      processedStudents.forEach(s => {
        const row: any[] = [s.roll_no, s.full_name];
        currentStreak = 0;
        datesToUse.forEach(date => {
          const special = specialDays[date];
          if (special) {
            currentStreak = 0;
            row.push(special.type === 'sunday' ? 'SUN' : special.type.toUpperCase().slice(0, 3));
          } else {
            const status = studentDateMap[s.student_id]?.[date];
            if (status === 'present') {
               currentStreak++;
               row.push('P');
            } else if (status === 'od') {
               currentStreak++;
               row.push('OD');
            } else if (status === 'absent') {
               currentStreak = 0;
               row.push('A');
            } else if (status === 'leave') {
               row.push('L');
            } else {
               currentStreak = 0;
               row.push('-');
            }
          }
        });
        row.push(
          s.present_sessions,
          s.absent_sessions,
          s.od_sessions,
          s.leave_sessions,
          s.present_sessions + s.absent_sessions + s.od_sessions + s.leave_sessions,
          s.present_sessions + s.od_sessions,
          s.attendance_percentage
        );
        wsData.push(row);
      });

      // Yield before creating workbook
      await new Promise(resolve => setTimeout(resolve, 50));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Set column widths
      ws['!cols'] = [
        { wch: 18 }, // Roll No
        { wch: 25 }, // Name
        ...datesToUse.map(() => ({ wch: 8 })),
        { wch: 8 }, { wch: 8 }, { wch: 6 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 12 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

      // Write to base64
      const wbOut = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      // Save file
      const safeSection = classInfo.section.replace(/[^a-zA-Z0-9]/g, '-');
      const filename = `Attendance_${classInfo.dept}-${classInfo.year}${safeSection}_${startStr}_to_${endStr}.xlsx`;
      
      const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      if (!dir) throw new Error("Could not access file system directory.");
      const uri = dir + filename;

      await FileSystem.writeAsStringAsync(uri, wbOut, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Share file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Export Attendance Report',
          UTI: 'org.openxmlformats.spreadsheetml.sheet',
        });
      } else {
        alert('Sharing is not available on this device');
      }
    } catch (e: any) {
      console.error('Export failed:', e);
      alert('Failed to export report: ' + (e.message || 'Unknown error'));
    } finally {
      setIsExporting(false);
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
                onPress={exportToExcel}
                disabled={isExporting}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: isExporting ? 0.7 : 1, backgroundColor: `${colors.accent}20`, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 100 }}
            >
                {isExporting ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="download" size={16} color={colors.accent} />}
                <Text style={{ fontSize: 13, fontFamily: Fonts.family.semiBold, color: colors.accent }}>
                    {isExporting ? 'Exporting...' : 'Excel'}
                </Text>
            </TouchableOpacity>
            </View>
        </LinearGradient>

        {/* Month Scroller */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, marginTop: 16 }}>
            <TouchableOpacity 
                onPress={openCustomRange}
                style={{
                    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100,
                    backgroundColor: datePreset === 'custom' ? colors.accent : (isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9'),
                    borderWidth: 1,
                    borderColor: datePreset === 'custom' ? colors.accent : 'transparent',
                }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="calendar-outline" size={14} color={datePreset === 'custom' ? '#FFF' : colors.textSecondary} />
                    <Text style={{ 
                        fontFamily: datePreset === 'custom' ? Fonts.family.bold : Fonts.family.medium, 
                        color: datePreset === 'custom' ? '#FFF' : colors.textSecondary,
                        fontSize: 13 
                    }}>Custom</Text>
                </View>
            </TouchableOpacity>
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
        
        {viewMode === 'table' ? (
            <View style={{ flex: 1 }}>
                {renderStats()}
                {renderControls()}
                {allDatesInRange.length > 0 && Object.keys(specialDays).length > 0 && (
                  <View style={{ marginHorizontal: 20, marginBottom: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#F97316' }} />
                      <Text style={{ fontSize: 10, color: isDark ? '#94A3B8' : '#64748B', fontFamily: Fonts.family.medium }}>Sunday</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#EAB308' }} />
                      <Text style={{ fontSize: 10, color: isDark ? '#94A3B8' : '#64748B', fontFamily: Fonts.family.medium }}>Holiday</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#A855F7' }} />
                      <Text style={{ fontSize: 10, color: isDark ? '#94A3B8' : '#64748B', fontFamily: Fonts.family.medium }}>Event</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#22C55E' }} />
                      <Text style={{ fontSize: 10, color: isDark ? '#94A3B8' : '#64748B', fontFamily: Fonts.family.medium }}>Exam</Text>
                    </View>
                  </View>
                )}
                {allDatesInRange.length > 0 && (
                  <View style={{ flex: 1, marginHorizontal: 20, marginBottom: 16, backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0', position: 'relative' }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={{ flexDirection: 'column' }}>
                       <FlatList
                          data={(loading ? Array.from({length: 15}).map((_, i) => ({ student_id: 'dummy_' + i, isDummy: true })) : processedStudents) as any[]}
                          keyExtractor={item => item.student_id}
                          ListHeaderComponent={
                              <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                                <View style={{ width: 140, padding: 12, borderRightWidth: 1, borderRightColor: isDark ? '#334155' : '#E2E8F0', justifyContent: 'center' }}>
                                  <Text style={{ fontFamily: Fonts.family.bold, fontSize: 13, color: isDark ? '#F1F5F9' : '#0F172A' }}>Student</Text>
                                </View>
                                {allDatesInRange.map((date, di) => {
                                  const d = new Date(date + 'T00:00:00');
                                  const special = specialDays[date];

                                  let headerBg = 'transparent';
                                  let headerTextColor = isDark ? '#F1F5F9' : '#0F172A';
                                  let subTextColor = isDark ? '#94A3B8' : '#64748B';

                                  if (special) {
                                    if (special.type === 'sunday') {
                                      headerBg = '#F97316'; headerTextColor = '#FFFFFF'; subTextColor = '#FFFFFF';
                                    } else if (special.type === 'holiday') {
                                      headerBg = '#EAB308'; headerTextColor = '#FFFFFF'; subTextColor = '#FFFFFF';
                                    } else if (special.type === 'event') {
                                      headerBg = '#A855F7'; headerTextColor = '#FFFFFF'; subTextColor = '#FFFFFF';
                                    } else if (special.type === 'exam') {
                                      headerBg = '#22C55E'; headerTextColor = '#FFFFFF'; subTextColor = '#FFFFFF';
                                    }
                                  }

                                  return (
                                    <View key={di} style={{ width: 50, padding: 6, alignItems: 'center', borderRightWidth: 1, borderRightColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: headerBg }}>
                                      <Text style={{ fontSize: 9, color: subTextColor, fontFamily: Fonts.family.medium }}>{d.toLocaleString('default', { month: 'short' })}</Text>
                                      <Text style={{ fontSize: 12, color: headerTextColor, fontFamily: Fonts.family.bold }}>{d.getDate()}</Text>
                                    </View>
                                  );
                                })}
                                
                                <View style={{ width: 55, padding: 8, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: isDark ? '#334155' : '#E2E8F0' }}>
                                  <Text style={{ fontSize: 11, color: isDark ? '#F1F5F9' : '#0F172A', fontFamily: Fonts.family.bold }}>P+OD</Text>
                                </View>
                                <View style={{ width: 60, padding: 8, alignItems: 'center', justifyContent: 'center' }}>
                                  <Text style={{ fontSize: 11, color: isDark ? '#F1F5F9' : '#0F172A', fontFamily: Fonts.family.bold }}>%</Text>
                                </View>
                              </View>
                          }
                          renderItem={({item, index}) => {
                              if ((item as any).isDummy) {
                                  return <TableSkeletonRow isDark={isDark} allDatesInRange={allDatesInRange} index={index} />;
                              }
                              return (
                                <TableRow 
                                  student={item}
                                  si={index}
                                  isDark={isDark}
                                  allDatesInRange={allDatesInRange}
                                  specialDays={specialDays}
                                  studentDateMap={studentDateMap}
                                />
                              )
                          }}
                          initialNumToRender={15}
                          maxToRenderPerBatch={10}
                          windowSize={5}
                          removeClippedSubviews={Platform.OS === 'android'}
                       />
                    </ScrollView>
                  </View>
                )}
            </View>
        ) : loading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <PulsingDots size="large" color={colors.accent} />
                <Text style={{ marginTop: 20, color: colors.textSecondary, fontFamily: Fonts.family.medium }}>Aggregating Data...</Text>
            </View>
        ) : (
            <FlatList
                data={processedStudents}
                keyExtractor={item => item.student_id}
                contentContainerStyle={{ paddingBottom: 60 }}
                removeClippedSubviews={false}
                maxToRenderPerBatch={10}
                windowSize={5}
                initialNumToRender={10}
                ListHeaderComponent={<>{renderStats()}{renderControls()}</>}
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
                                 <View style={{ flexDirection: 'row', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                                      <Text style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B' }}>P: <Text style={{ color: isDark ? '#FFFFFF' : '#0F172A', fontFamily: Fonts.family.semiBold }}>{item.present_sessions}</Text></Text>
                                      <Text style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B' }}>A: <Text style={{ color: isDark ? '#FFFFFF' : '#0F172A', fontFamily: Fonts.family.semiBold }}>{item.absent_sessions}</Text></Text>
                                      {item.od_sessions > 0 && <Text style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B' }}>OD: <Text style={{ color: '#3B82F6', fontFamily: Fonts.family.semiBold }}>{item.od_sessions}</Text></Text>}
                                      {item.leave_sessions > 0 && <Text style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B' }}>L: <Text style={{ color: '#F59E0B', fontFamily: Fonts.family.semiBold }}>{item.leave_sessions}</Text></Text>}
                                      <Text style={{ fontSize: 12, color: '#10B981' }}>P+OD: <Text style={{ fontFamily: Fonts.family.bold }}>{item.present_sessions + item.od_sessions}</Text></Text>
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
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
                <LinearGradient 
                    colors={isDark ? ['#1E293B', '#0F172A'] : ['#FFFFFF', '#F8FAFC']}
                    style={{ borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: insets.bottom + 24, borderTopWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 }}
                >
                    {/* Drawer Indicator */}
                    <View style={{ width: 40, height: 4, backgroundColor: isDark ? '#334155' : '#E2E8F0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
                    
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <Text style={{ fontSize: 22, fontFamily: Fonts.family.bold, color: isDark ? '#FFF' : '#0F172A' }}>Select Date Range</Text>
                        <TouchableOpacity onPress={() => setShowDatePickerModal(false)} style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', padding: 6, borderRadius: 20 }}>
                            <Ionicons name="close" size={20} color={isDark ? '#94A3B8' : '#64748B'} />
                        </TouchableOpacity>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 16, marginBottom: 24 }}>
                        <TouchableOpacity 
                            style={{ flex: 1, padding: 16, borderRadius: 16, backgroundColor: activePicker === 'start' ? `${colors.accent}15` : (isDark ? 'rgba(255,255,255,0.03)' : '#F1F5F9'), borderWidth: 1, borderColor: activePicker === 'start' ? colors.accent : (isDark ? '#334155' : '#E2E8F0') }}
                            onPress={() => setActivePicker('start')}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <Ionicons name="calendar-outline" size={16} color={activePicker === 'start' ? colors.accent : (isDark ? '#94A3B8' : '#64748B')} />
                                <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 13, fontFamily: Fonts.family.medium }}>Start Date</Text>
                            </View>
                            <Text style={{ color: isDark ? '#F1F5F9' : '#0F172A', fontFamily: Fonts.family.bold, fontSize: 16 }}>{tempStart.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            style={{ flex: 1, padding: 16, borderRadius: 16, backgroundColor: activePicker === 'end' ? `${colors.accent}15` : (isDark ? 'rgba(255,255,255,0.03)' : '#F1F5F9'), borderWidth: 1, borderColor: activePicker === 'end' ? colors.accent : (isDark ? '#334155' : '#E2E8F0') }}
                            onPress={() => setActivePicker('end')}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <Ionicons name="calendar-outline" size={16} color={activePicker === 'end' ? colors.accent : (isDark ? '#94A3B8' : '#64748B')} />
                                <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 13, fontFamily: Fonts.family.medium }}>End Date</Text>
                            </View>
                            <Text style={{ color: isDark ? '#F1F5F9' : '#0F172A', fontFamily: Fonts.family.bold, fontSize: 16 }}>{tempEnd.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                        </TouchableOpacity>
                    </View>

                    {activePicker && (
                        <View style={{ alignItems: 'center', marginBottom: 24, backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : '#FFF', borderRadius: 16, padding: 8, borderWidth: isDark ? 0 : 1, borderColor: '#F1F5F9' }}>
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
                        style={{ backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 16, alignItems: 'center', shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }}
                        onPress={confirmCustomDates}
                    >
                        <Text style={{ color: '#FFF', fontFamily: Fonts.family.bold, fontSize: 16, letterSpacing: 0.5 }}>Apply Range</Text>
                    </TouchableOpacity>
                </LinearGradient>
            </View>
        </Modal>

    </KeyboardAvoidingView>
  );
};
