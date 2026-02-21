/**
 * HistoryScreen - The Digital Ledger
 * Fast access to past attendance records with export tools
 * Premium design with date strip, accordion cards, and floating dock
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Share,
  Modal,
  TouchableWithoutFeedback,
  Animated,
  Dimensions,
  Easing,
  Image,
} from 'react-native';
import { safeRefresh } from '../../../utils/safeRefresh';
import { useDeferredLoad, deferLoad } from '../../../hooks/useDeferredLoad';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../../contexts';
import { supabase } from '../../../config/supabase';
import { getAttendanceHistory, AttendanceSession } from '../../../services/dashboardService';
import { cacheHistory, getCachedHistory, getCacheAge,  getPendingSubmissions,
  removePendingSubmission,
  syncPendingSubmissions
} from '../../../services/offlineService';
import { useConnectionStatus } from '../../../hooks';
import { EditAttendanceModal, FilterBar } from '../components';
import { historyStyles as styles, DATE_TILE_WIDTH } from '../styles';
import { scale, verticalScale, normalizeFont, moderateScale } from '../../../utils/responsive'; // Import responsive utils locally if needed for inline use or keep consistent with styles
import { ZenToast } from '../../../components/ZenToast';
import { PulsingDots } from '../../../components/ui/LoadingAnimation';

// Months for picker
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const HistoryScreen: React.FC = () => {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth());
  const [showEditModal, setShowEditModal] = useState(false);
  const [editSession, setEditSession] = useState<AttendanceSession | null>(null);
  const [editStudents, setEditStudents] = useState<any[]>([]);

  // Filter state for year, section, and period
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterSection, setFilterSection] = useState<string>('all');
  const [filterPeriod, setFilterPeriod] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [isOfflineData, setIsOfflineData] = useState(false);

  const { status: connectionStatus } = useConnectionStatus();
  const connectionStatusRef = useRef(connectionStatus);
  connectionStatusRef.current = connectionStatus;

  // Toast State
  const [toast, setToast] = useState<{ visible: boolean, type: 'success' | 'error', message: string }>({ visible: false, type: 'success', message: '' });

  // Delete Confirmation Modal State
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ visible: true, type, message });
  }, []);

  // Colors
  const colors = {
    background: isDark ? '#0A0A0A' : '#F8FAFC',
    textPrimary: isDark ? '#FFFFFF' : '#0F172A',
    textSecondary: isDark ? 'rgba(255,255,255,0.6)' : '#64748B',
    textMuted: isDark ? 'rgba(255,255,255,0.4)' : '#94A3B8',
    cardBg: isDark ? 'rgba(30, 41, 59, 0.6)' : '#FFFFFF',
    cardBorder: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    statBg: isDark ? 'rgba(255,255,255,0.08)' : '#F8FAFC',
    buttonBg: isDark ? 'rgba(255,255,255,0.1)' : '#F1F5F9',
    activeBg: isDark ? '#FFFFFF' : '#0F172A',
    activeText: isDark ? '#0F172A' : '#FFFFFF',
    inactiveBg: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
    dockBg: isDark ? 'rgba(30,30,30,0.9)' : 'rgba(255,255,255,0.95)',
    dockBorder: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
    indicator: '#3DDC97',
    success: '#22C55E',
    danger: '#EF4444',
    warning: '#F59E0B',
    noClass: '#FF8C42', // Orange for no-class days
  };

  // Generate dates for date strip (based on selectedDate's month)
  const generateDates = useCallback(() => {
    const dates: Date[] = [];
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Generate all dates of the selected month
    for (let day = 1; day <= daysInMonth; day++) {
      dates.push(new Date(year, month, day));
    }
    return dates;
  }, [selectedDate]);

  const dates = generateDates();

  // Check if same day
  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getDate() === d2.getDate() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getFullYear() === d2.getFullYear();
  };

  // Get no-class reason for a date
  const getNoClassReason = (date: Date): { isNoClass: boolean; reason: string; emoji: string } => {
    const day = date.getDay();

    // Sunday only (Saturday is working day)
    if (day === 0) {
      return { isNoClass: true, reason: 'Sunday', emoji: '☀️' };
    }

    // Check for holidays (example - could be from API)
    const dateStr = date.toISOString().split('T')[0];
    const holidays: Record<string, string> = {
      '2026-01-26': 'Republic Day',
      '2026-08-15': 'Independence Day',
      '2026-10-02': 'Gandhi Jayanti',
      // Add more holidays as needed
    };

    if (holidays[dateStr]) {
      return { isNoClass: true, reason: holidays[dateStr], emoji: '🎊' };
    }

    return { isNoClass: false, reason: '', emoji: '' };
  };

  // Load history
  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Get Pending Submissions (Offline Queue)
      const pendingSubmissions = await getPendingSubmissions();
      const pendingSessions = pendingSubmissions
        .filter(p => isSameDay(new Date(p.submittedAt), selectedDate))
        .map(p => {
          const odCount = p.attendance.filter(a => a.status === 'od').length;
          return {
            id: `pending-${p.id}`,
            date: p.submittedAt,
            slot_id: p.classData.slotId,
            subject: { name: p.classData.subjectName, code: '' },
            target_dept: p.classData.dept || '???',
            target_section: p.classData.section || p.classData.sectionLetter || '???',
            target_year: p.classData.year || 0,
            present_count: p.attendance.filter(a => a.status === 'present').length,
            absent_count: p.attendance.filter(a => a.status === 'absent').length,
            od_count: odCount,
            total_students: p.attendance.length,
            isOfflinePending: true,
            syncStatus: p.syncStatus,
          } as any;
        });

      let historySessions: AttendanceSession[] = [];

      // OFFLINE FALLBACK: Use cached data if offline
      if (connectionStatusRef.current !== 'online') {
        console.log('[HistoryScreen] Offline mode - loading from cache');
        const cached = await getCachedHistory();
        if (cached && cached.length > 0) {
          // Convert cached format to AttendanceSession format
          const converted: AttendanceSession[] = cached.map(c => ({
            id: c.id,
            date: c.date,
            slot_id: c.slot_id,
            subject: { name: c.subject_name, code: '' },
            target_dept: '',
            target_section: c.section,
            target_year: 0,
            present_count: c.present_count,
            absent_count: c.absent_count,
            total_students: c.total_students,
          }));
          // Filter by selected date
          historySessions = converted.filter(session => {
            const sessionDate = new Date(session.date);
            return isSameDay(sessionDate, selectedDate);
          });
          setIsOfflineData(true);
        }
      } else {
        // ONLINE: Fetch from Supabase
        setIsOfflineData(false);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
           // Pass selected date for server-side filtering (YYYY-MM-DD)
           const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
           const data = await getAttendanceHistory(user.id, 'All', 30, dateStr);

           // Cache for offline use
           const cacheData = data.map(s => ({
             id: s.id,
             date: s.date,
             slot_id: s.slot_id || '',
             subject_name: s.subject?.name || '',
             section: s.target_section || '',
             present_count: s.present_count,
             absent_count: s.absent_count,
             total_students: s.total_students,
             created_at: new Date().toISOString(),
           }));
           await cacheHistory(cacheData);

           // Data is already filtered by date on server
           historySessions = data;
        }
      }

      // DEDUP MERGE: Pending submissions override matching synced sessions (same slot + date)
      // This ensures only the latest attendance shows, not both old and new
      const pendingSlotIds = new Set(pendingSessions.map((p: any) => String(p.slot_id)));
      const filteredHistory = historySessions.filter(session => {
        const sessionDate = new Date(session.date);
        if (isSameDay(sessionDate, selectedDate) && pendingSlotIds.has(String(session.slot_id))) {
          return false; // Pending version replaces this synced version
        }
        return true;
      });
      setSessions([...pendingSessions, ...filteredHistory]);

    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useDeferredLoad(() => { loadHistory(); }, [loadHistory]);

  // Handle date selection
  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setExpandedId(null);
  };

  // Handle month selection
  const handleMonthSelect = () => {
    const newDate = new Date(pickerYear, pickerMonth, 1);
    setSelectedDate(newDate);
    setShowMonthPicker(false);
  };

  // Pull to refresh
  const onRefresh = useCallback(() => {
    safeRefresh(setRefreshing, () => loadHistory());
  }, [loadHistory]);

  const handleShareSession = async (session: AttendanceSession) => {
    try {
      const message = `Attendance Report\nDate: ${new Date(session.date).toLocaleDateString()}\nClass: ${session.target_dept}-${session.target_year}${session.target_section}\nPresent: ${session.present_count}\nAbsent: ${session.absent_count}`;
      await Share.share({ message });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleDeletePending = (sessionId: string) => {
    const submissionId = sessionId.replace('pending-', '');
    setDeleteTargetId(submissionId);
    setDeleteModalVisible(true);
  };

  const confirmDeletePending = async () => {
    if (deleteTargetId) {
      await removePendingSubmission(deleteTargetId);
      loadHistory();
    }
    setDeleteModalVisible(false);
    setDeleteTargetId(null);
  };

  const handleRetrySync = useCallback(() => {
    safeRefresh(setRefreshing, async () => {
      await syncPendingSubmissions();
      await loadHistory();
    });
  }, [loadHistory]);

  // Generate WhatsApp report
  const generateWhatsAppReport = (session: AttendanceSession) => {
    const dateStr = new Date(session.date).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short'
    });

    const report = `${dateStr} | ${session.subject?.name || 'Class'}\n` +
      `${session.target_dept}-${session.target_year}-${session.target_section}\n` +
      `✅ Present: ${session.present_count}/${session.total_students}\n` +
      `❌ Absent: ${session.absent_count}`;

    Share.share({
      message: report,
      title: `Attendance Report`,
    });
  };

  // Get health color
  const getHealthColor = (present: number, total: number) => {
    const percent = total > 0 ? (present / total) * 100 : 0;
    if (percent >= 75) return colors.success;
    if (percent >= 50) return colors.warning;
    return colors.danger;
  };

  // Check if editable (within 24 hours)
  const isEditable = (dateStr: string) => {
    const sessionDate = new Date(dateStr);
    const now = new Date();
    const hoursDiff = (now.getTime() - sessionDate.getTime()) / (1000 * 60 * 60);
    return hoursDiff < 24;
  };

  // Handle edit session - fetch real student data from Supabase
  const handleEditSession = async (session: AttendanceSession) => {
    try {
      // Fetch actual attendance logs for this session
      const { data: logs, error } = await supabase
        .from('attendance_logs')
        .select(`
          id,
          student_id,
          status,
          students:student_id (
            id,
            roll_no,
            full_name
          )
        `)
        .eq('session_id', session.id);
      
      if (error) {
        console.error('[HistoryScreen] Error fetching attendance logs:', error);
        showToast('error', 'Failed to fetch data: ' + error.message);
        return; // Don't open modal if fetch fails
      } else if (logs && logs.length > 0) {
        // Map real data to expected format
        const students = logs.map((log: any) => ({
          id: log.student_id, // Use real student UUID
          rollNumber: log.students?.roll_no?.slice(-2) || '??',
          fullRollNumber: log.students?.roll_no || 'Unknown',
          name: log.students?.full_name || 'Unknown Student',
          status: log.status as 'present' | 'absent' | 'od' | 'leave',
        }));
        setEditStudents(students);
      } else {
        // No logs found - show empty
        console.log('[HistoryScreen] No attendance logs found for session:', session.id);
        showToast('error', 'No attendance records found');
        return;
      }
      
      setEditSession(session);
      setShowEditModal(true);
    } catch (err) {
      console.error('[HistoryScreen] Error in handleEditSession:', err);
      setEditStudents([]);
      setEditSession(session);
      setShowEditModal(true);
    }
  };

  // Handle save edited attendance
  const handleSaveAttendance = (updatedStudents: any[]) => {
    // In production, call API to save
    const present = updatedStudents.filter(s => s.status === 'present').length;
    const absent = updatedStudents.filter(s => s.status === 'absent').length;
    console.log(`Saved: ${present} present, ${absent} absent`);
    setShowEditModal(false);
    showToast('success', 'Attendance updated successfully');
    loadHistory(); // Refresh
  };

  // Handle export session - directly open share sheet with WhatsApp text
  const handleExportSession = async (session: AttendanceSession) => {
    try {
      // Fetch actual attendance logs for this session
      const { data: logs, error } = await supabase
        .from('attendance_logs')
        .select(`
          id,
          student_id,
          status,
          students:student_id (
            id,
            roll_number,
            full_name
          )
        `)
        .eq('session_id', session.id);
      
      // Format section name
      const section = `${session.target_year}-${session.target_dept}-${session.target_section}`;
      const subject = session.subject?.name || 'Class';
      const date = new Date(session.date).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const time = session.slot_id || '10:00 AM';

      // Helper to get short roll number
      const getShortRoll = (fullRoll: string): string => {
        if (fullRoll?.startsWith('LE') || fullRoll?.startsWith('le')) {
          return fullRoll.toUpperCase();
        }
        return fullRoll?.slice(-2) || '??';
      };

      // Process students
      let presentStudents: string[] = [];
      let absentStudents: string[] = [];
      let odStudents: string[] = [];

      if (logs && logs.length > 0) {
        logs.forEach((log: any) => {
          const shortRoll = getShortRoll(log.students?.roll_number);
          if (log.status === 'present') {
            presentStudents.push(shortRoll);
          } else if (log.status === 'absent') {
            absentStudents.push(shortRoll);
          } else if (log.status === 'od' || log.status === 'leave') {
            odStudents.push(shortRoll);
          }
        });
      } else {
        // Fallback to session counts if no logs
        for (let i = 1; i <= session.present_count; i++) {
          presentStudents.push(String(i).padStart(2, '0'));
        }
        for (let i = session.present_count + 1; i <= session.total_students; i++) {
          absentStudents.push(String(i).padStart(2, '0'));
        }
      }

      // Generate WhatsApp text
      let text = `📚 ${section} Attendance\n`;
      text += `${date}\n`;
      text += `${time}\n`;
      text += `${subject}\n\n`;
      text += `✅ Present (${presentStudents.length}):\n${presentStudents.join(', ') || 'None'}\n\n`;
      text += `❌ Absent (${absentStudents.length}):\n${absentStudents.join(', ') || 'None'}`;
      
      if (odStudents.length > 0) {
        text += `\n\n🔶 OD/Leave (${odStudents.length}):\n${odStudents.join(', ')}`;
      }

      // Open share sheet directly
      await Share.share({
        message: text,
        title: `Attendance - ${section}`,
      });
    } catch (err) {
      console.error('[HistoryScreen] Export error:', err);
    }
  };

  // Format display date
  const formatDisplayDate = () => {
    const today = new Date();
    if (isSameDay(selectedDate, today)) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (isSameDay(selectedDate, yesterday)) return 'Yesterday';
    return selectedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  };

  // Render date strip
  const renderDateStrip = () => (
    <View style={styles.dateStripContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dateStripContent}
      >
        {dates.map((date, index) => {
          const isActive = isSameDay(date, selectedDate);
          const isToday = isSameDay(date, new Date());
          const noClassInfo = getNoClassReason(date);
          
          // Determine tile color
          let tileBg = colors.inactiveBg;
          let textColor = colors.textPrimary;
          let dayColor = colors.textSecondary;
          
          if (isActive) {
            tileBg = colors.activeBg;
            textColor = colors.activeText;
            dayColor = colors.activeText;
          } else if (noClassInfo.isNoClass) {
            tileBg = isDark ? 'rgba(255, 140, 66, 0.15)' : 'rgba(255, 140, 66, 0.1)';
            textColor = colors.noClass;
            dayColor = colors.noClass;
          }
          
          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.dateTile,
                {
                  backgroundColor: tileBg,
                  borderColor: noClassInfo.isNoClass && !isActive ? colors.noClass + '30' : colors.cardBorder,
                },
              ]}
              onPress={() => handleDateSelect(date)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.dayText,
                { color: dayColor }
              ]}>
                {date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3)}
              </Text>
              <Text style={[
                styles.dateText,
                { color: textColor }
              ]}>
                {date.getDate()}
              </Text>
              {isActive && <View style={[styles.indicator, { backgroundColor: noClassInfo.isNoClass ? colors.noClass : colors.indicator }]} />}
              {isToday && !isActive && (
                <View style={[styles.todayDot, { backgroundColor: colors.indicator }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  // Handle focus and params
  useFocusEffect(
    useCallback(() => {
      // Reset filters on every visit
      setFilterYear('all');
      setFilterSection('all');
      setFilterPeriod('all');

      // Check for params
      if (route.params?.date) {
        const paramDate = new Date(route.params.date);
        setSelectedDate(paramDate);
        // Clear params to avoid loop
        navigation.setParams({ date: undefined });
      } else {
        // If no date param, force update to today/now to trigger useEffect refresh
        // We use a new Date object to ensure reference change triggers useEffect
        setSelectedDate(new Date());
      }
      
      // Removed loadHistory() call here to avoid infinite loop (useEffect handles it)
    }, [route.params?.date])
  );

  // Render session card
  const renderSessionCard = (session: AttendanceSession, index: number) => {
    const isExpanded = expandedId === (session.id || String(index));
    const effectivePresent = session.present_count + (session.od_count || 0);
    const healthColor = getHealthColor(effectivePresent, session.total_students);
    const canEdit = isEditable(session.date);
    const percentage = session.total_students > 0 
      ? Math.round((effectivePresent / session.total_students) * 100) 
      : 0;
    
    // Substitution info - cast to any to access new fields
    const sessionAny = session as any;
    const isUserOriginal = sessionAny.isUserOriginal;
    const isUserSubstitute = sessionAny.isUserSubstitute;
    const substituteFacultyName = sessionAny.substituteFacultyName;
    const originalFacultyName = sessionAny.originalFacultyName;
    const isOfflinePending = sessionAny.isOfflinePending;
    const syncStatus = sessionAny.syncStatus;

    return (
      <TouchableOpacity
        key={session.id || index}
        style={[styles.sessionCard, { 
          backgroundColor: colors.cardBg,
          borderColor: colors.cardBorder,
        }]}
        onPress={() => setExpandedId(isExpanded ? null : (session.id || String(index)))}
        activeOpacity={0.9}
      >
        {/* Health Strip */}
        <View style={[styles.healthStrip, { backgroundColor: healthColor }]} />

        <View style={styles.cardContent}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={styles.subjectInfo}>
              <View style={styles.subjectRow}>
                  <Text style={[styles.subject, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
                    {session.subject?.name || 'Unknown Subject'}
                  </Text>
                  
                  {/* Percentage in Main Card */}
                  <View style={[styles.percentageBadge, { 
                      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', 
                  }]}>
                      <Text style={[styles.percentageText, { color: healthColor }]}>
                          {percentage}%
                      </Text>
                  </View>
              </View>

              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                {session.target_dept}-{session.target_year}-{session.target_section} • {String(session.slot_id).toUpperCase()}
                {session.batch ? ` • Batch ${session.batch}` : ''}
              </Text>
              
              {/* Substitution Labels */}
              {isUserOriginal && substituteFacultyName && (
                <View style={styles.substitutionRow}>
                  <Ionicons name="swap-horizontal" size={normalizeFont(12)} color={colors.warning} />
                  <Text style={[styles.substitutionText, { color: colors.warning }]}>
                    Substituted by: {substituteFacultyName}
                  </Text>
                </View>
              )}
              {isUserSubstitute && originalFacultyName && (
                <View style={styles.substitutionRow}>
                  <Ionicons name="person-add" size={normalizeFont(12)} color={colors.indicator} />
                  <Text style={[styles.substitutionText, { color: colors.indicator }]}>
                    Substituted for: {originalFacultyName}
                  </Text>
                </View>
              )}
              
              
               {/* Batch Badge for Lab Clarity */}
              {session.batch && (
                <View style={styles.labBadge}>
                  <Ionicons name="flask" size={normalizeFont(12)} color="#8B5CF6" />
                  <Text style={[styles.labText, { color: '#8B5CF6' }]}>
                    Lab Session - Batch {session.batch}
                  </Text>
                </View>
              )}
            </View>
            
            {isOfflinePending ? (
               <View style={styles.pendingBadge}>
                 <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="cloud-upload" size={normalizeFont(14)} color={colors.warning} />
                    <Text style={[styles.pendingText, { color: colors.warning }]}>PENDING</Text>
                 </View>
                 {/* Quick Actions for Pending */}
                 <TouchableOpacity onPress={() => handleDeletePending(session.id.replace('pending-', ''))} style={styles.deletePendingBtn}>
                    <Ionicons name="trash-outline" size={normalizeFont(16)} color={colors.danger} />
                 </TouchableOpacity>
               </View>
            ) : null}
          </View>

          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={[styles.statBox, { backgroundColor: colors.statBg }]}>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{session.total_students}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: colors.statBg }]}>
              <Text style={[styles.statValue, { color: colors.success }]}>{effectivePresent}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Present</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: colors.statBg }]}>
              <Text style={[styles.statValue, { color: colors.danger }]}>{session.absent_count}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Absent</Text>
            </View>
          </View>

          {/* Expanded Panel */}
          {isExpanded && (
            <View style={styles.expandPanel}>
              
              {/* Action Buttons */}
              <View style={styles.actionRow}>
                <TouchableOpacity 
                  style={[styles.actionBtn, { backgroundColor: colors.indicator, flex: 1 }]}
                  onPress={() => handleExportSession(session)}
                >
                  <Ionicons name="share-outline" size={16} color="#000" />
                  <Text style={[styles.actionBtnText, { color: '#000' }]}>Export / Share</Text>
                </TouchableOpacity>

                {canEdit ? (
                  <TouchableOpacity 
                    style={[styles.actionBtn, { backgroundColor: colors.buttonBg }]}
                    onPress={() => handleEditSession(session)}
                  >
                    <Ionicons name="pencil-outline" size={16} color={colors.textPrimary} />
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.actionBtn, { backgroundColor: colors.buttonBg, opacity: 0.5 }]}>
                    <Ionicons name={isOfflinePending ? "cloud-upload-outline" : "lock-closed-outline"} size={14} color={colors.textMuted} />
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Expand Indicator */}
          <View style={styles.expandIndicator}>
            <Ionicons 
              name={isExpanded ? 'chevron-up' : 'chevron-down'} 
              size={16} 
              color={colors.textMuted} 
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Render month picker modal
  const renderMonthPicker = () => (
    <Modal visible={showMonthPicker} transparent animationType="fade" onRequestClose={() => setShowMonthPicker(false)}>
      <TouchableWithoutFeedback onPress={() => setShowMonthPicker(false)}>
        <View style={styles.modalOverlay}>
          <BlurView intensity={40} style={StyleSheet.absoluteFill} tint="dark" />
          <TouchableWithoutFeedback>
            <View style={[styles.modal, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Select Month</Text>
                <TouchableOpacity onPress={() => setShowMonthPicker(false)}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.yearRow}>
                <TouchableOpacity onPress={() => setPickerYear(y => y - 1)}>
                  <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
                <Text style={[styles.yearText, { color: colors.textPrimary }]}>{pickerYear}</Text>
                <TouchableOpacity onPress={() => setPickerYear(y => y + 1)}>
                  <Ionicons name="chevron-forward" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.monthGrid}>
                {MONTHS.map((m, index) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.monthTile,
                      { backgroundColor: pickerMonth === index ? colors.indicator : colors.buttonBg }
                    ]}
                    onPress={() => setPickerMonth(index)}
                  >
                    <Text style={[
                      styles.monthText,
                      { color: pickerMonth === index ? '#000' : colors.textPrimary }
                    ]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: colors.indicator }]}
                onPress={handleMonthSelect}
              >
                <Text style={styles.confirmText}>Go to {MONTHS[pickerMonth]} {pickerYear}</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header Gradient */}
      <LinearGradient
        colors={['#0D4A4A', '#1A6B6B', '#0F3D3D']}
        style={[styles.headerGradient, { paddingTop: insets.top }]}
      >
        <View style={styles.titleRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity 
              style={styles.headerBackButton}
              onPress={() => navigation.navigate('Home')}
            >
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.pageTitle}>History</Text>
              <Text style={styles.subtitle}>{formatDisplayDate()}</Text>
            </View>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.calendarBtn}
              onPress={() => setShowFilters(!showFilters)}
            >
              <Ionicons name={showFilters ? 'close' : 'filter'} size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.calendarBtn}
              onPress={() => setShowMonthPicker(true)}
            >
              <Ionicons name="calendar-outline" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {renderDateStrip()}
      </LinearGradient>

      {/* Filter Bar Component - Collapsible */}
      {showFilters && (
        <FilterBar
          filterYear={filterYear}
          filterSection={filterSection}
          filterPeriod={filterPeriod}
          onYearChange={setFilterYear}
          onSectionChange={setFilterSection}
          onPeriodChange={setFilterPeriod}
        />
      )}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: verticalScale(120) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0D4A4A" />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <PulsingDots size="large" color="#0D9488" />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Fetching records...
            </Text>
          </View>
        ) : sessions.length > 0 ? (
          sessions
            .filter(session => {
              // Convert target_year to string for comparison
              const yearMatch = filterYear === 'all' || String(session.target_year) === filterYear;
              const sectionMatch = filterSection === 'all' || session.target_section === filterSection;
              // Match period like P1, P2 etc (slot_id format: p1, p2...)
              const periodMatch = filterPeriod === 'all' || session.slot_id?.toUpperCase() === filterPeriod;
              return yearMatch && sectionMatch && periodMatch;
            })
            .map((session, index) => renderSessionCard(session, index))
        ) : (
          (() => {
            const noClassInfo = getNoClassReason(selectedDate);
            return (
              <View style={[styles.emptyContainer, { 
                backgroundColor: noClassInfo.isNoClass ? (isDark ? 'rgba(255, 140, 66, 0.08)' : 'rgba(255, 140, 66, 0.05)') : 'transparent',
                borderRadius: moderateScale(20),
                marginHorizontal: scale(16),
                paddingVertical: verticalScale(40),
              }]}>
                <Text style={styles.emptyEmoji}>
                  {noClassInfo.isNoClass ? noClassInfo.emoji : '📅'}
                </Text>
                <Text style={[styles.emptyTitle, { 
                  color: noClassInfo.isNoClass ? colors.noClass : colors.textPrimary 
                }]}>
                  {noClassInfo.isNoClass ? noClassInfo.reason : 'No Records'}
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  {noClassInfo.isNoClass 
                    ? `No classes scheduled for ${noClassInfo.reason.toLowerCase()}`
                    : 'No attendance sessions found for this date'}
                </Text>
                {noClassInfo.isNoClass && (
                  <View style={[styles.noClassBadge, { backgroundColor: colors.noClass + '20' }]}>
                    <Text style={[styles.noClassBadgeText, { color: colors.noClass }]}>
                      Non-working day
                    </Text>
                  </View>
                )}
              </View>
            );
          })()
        )}
      </ScrollView>



      {renderMonthPicker()}

      <EditAttendanceModal
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        session={editSession ? {
          id: editSession.id || '',
          subject: editSession.subject?.name || 'Unknown',
          subjectCode: editSession.subject?.code || 'N/A',
          section: `${editSession.target_year}-${editSession.target_dept}-${editSession.target_section}`,
          date: new Date(editSession.date),
          time: editSession.slot_id || '10:00',
          total: editSession.total_students,
        } : null}
        students={editStudents}
        onSave={handleSaveAttendance}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setDeleteModalVisible(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: scale(24) }}>
            <TouchableWithoutFeedback>
              <View style={{
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                borderRadius: moderateScale(20),
                padding: scale(24),
                width: '100%',
                maxWidth: scale(340),
                alignItems: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.15,
                shadowRadius: 24,
                elevation: 10,
              }}>
                {/* Warning Icon */}
                <View style={{
                  width: scale(56),
                  height: scale(56),
                  borderRadius: scale(28),
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: verticalScale(16),
                }}>
                  <Ionicons name="trash-outline" size={normalizeFont(26)} color="#EF4444" />
                </View>

                <Text style={{
                  fontSize: normalizeFont(17),
                  fontWeight: '700',
                  color: isDark ? '#F1F5F9' : '#0F172A',
                  marginBottom: verticalScale(8),
                  textAlign: 'center',
                }}>
                  Discard Offline Record?
                </Text>

                <Text style={{
                  fontSize: normalizeFont(13),
                  color: isDark ? '#94A3B8' : '#64748B',
                  textAlign: 'center',
                  lineHeight: normalizeFont(19),
                  marginBottom: verticalScale(24),
                  paddingHorizontal: scale(8),
                }}>
                  This will permanently delete this unsynced attendance record. This action cannot be undone.
                </Text>

                <View style={{ flexDirection: 'row', gap: scale(12), width: '100%' }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      paddingVertical: verticalScale(12),
                      borderRadius: moderateScale(12),
                      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
                      alignItems: 'center',
                    }}
                    onPress={() => setDeleteModalVisible(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={{
                      fontSize: normalizeFont(14),
                      fontWeight: '600',
                      color: isDark ? '#CBD5E1' : '#475569',
                    }}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      flex: 1,
                      paddingVertical: verticalScale(12),
                      borderRadius: moderateScale(12),
                      backgroundColor: '#EF4444',
                      alignItems: 'center',
                    }}
                    onPress={confirmDeletePending}
                    activeOpacity={0.7}
                  >
                    <Text style={{
                      fontSize: normalizeFont(14),
                      fontWeight: '700',
                      color: '#FFFFFF',
                    }}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Toast Notification */}
      <ZenToast
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onHide={() => setToast(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
};

export default HistoryScreen;
