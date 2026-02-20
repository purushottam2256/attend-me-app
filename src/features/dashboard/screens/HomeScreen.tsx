import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTheme } from '../../../contexts';
import { Colors } from '../../../constants';
import { supabase } from '../../../config/supabase';
import { 
  getTodaySchedule, 
  TimetableSlot, 
  getSwapsAndSubstitutions, 
  getHolidayInfo,
  getLeaveInfo,
  SubstitutionInfo,
  HolidayInfo,
  LeaveInfo
} from '../../../services/dashboardService';
import { NotificationService } from '../../../services/NotificationService';
import { PulsingDots } from '../../../components/ui/LoadingAnimation';
import { 
  cacheTodaySchedule, 
  getCachedTodaySchedule, 
  cacheProfile,
  cacheAllRosters, // Import this
  getCacheAge,
  isCacheStale 
} from '../../../services/offlineService';
import { SlideToStart, BellIcon, ZenToast } from '../../../components';
import { CircularClockHero, CircularClockHeroRef } from '../../../components/CircularClockHero';
import { NoClassesHero } from '../../../components/NoClassesHero';
import { useConnectionStatus } from '../../../hooks';
import { useOfflineSync } from '../../../contexts/OfflineSyncContext';
import { OffHoursScanModal, type OffHoursReason } from '../components';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';

type HeroState = 'CLASS_NOW' | 'BREAK' | 'DONE' | 'LOADING' | 'NO_CLASSES' | 'HOLIDAY' | 'LEAVE';

interface ScheduleSlot extends TimetableSlot {
  status: 'live' | 'completed' | 'incomplete' | 'upcoming';
  isSwap?: boolean;
  isSubstitute?: boolean;
  originalFacultyId?: string | null; // For substitution tracking
  periodCount?: number;  // For merged consecutive classes
  originalSlotIds?: string[];  // Track original slots for merged classes
}

interface HomeScreenProps {
  userName: string;
}

const SCHEDULE_CACHE_KEY = '@attend_me/schedule_cache';

interface ToastState {
  visible: boolean;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ userName }) => {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { status: connectionStatus } = useConnectionStatus();
  const heroRef = useRef<CircularClockHeroRef>(null);
  
  const [heroState, setHeroState] = useState<HeroState>('LOADING');
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([]);
  const [currentClass, setCurrentClass] = useState<ScheduleSlot | null>(null);
  const [nextClass, setNextClass] = useState<ScheduleSlot | null>(null);
  const [progress, setProgress] = useState(0);
  const [minutesUntilNext, setMinutesUntilNext] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [sliderKey, setSliderKey] = useState(0); // Key to reset slider
  const [showOffHoursModal, setShowOffHoursModal] = useState(false);
  const [offHoursReason, setOffHoursReason] = useState<'break' | 'after_hours' | 'before_hours' | 'holiday' | 'suspended'>('break');
  const [previousClasses, setPreviousClasses] = useState<ScheduleSlot[]>([]);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [isOfflineData, setIsOfflineData] = useState(false);
  const [cacheAge, setCacheAge] = useState<string>('');
  const [holiday, setHoliday] = useState<HolidayInfo | null>(null);
  const [leave, setLeave] = useState<LeaveInfo | null>(null);
  
  // Toast State
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', type: 'success' });
  
  // Offline Sync
  const { isOnline, syncStatus, syncPending, lastSyncAge } = useOfflineSync();
  const [isSyncingManually, setIsSyncingManually] = useState(false);

  // Load Profile Image
  useEffect(() => {
    const loadProfileImage = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('profiles')
            .select('avatar_url')
            .eq('id', user.id)
            .single();
          if (data?.avatar_url) {
            setProfileImage(data.avatar_url);
          }
        }
      } catch (e) {
        console.log('Error loading profile image:', e);
      }
    };
    loadProfileImage();
  }, []);

  // Reset slider when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      setSliderKey(prev => prev + 1);
      // Reset the CircularClockHero slider
      heroRef.current?.reset();
    }, [])
  );

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const parseTime = (timeStr: string): Date => {
    const [hour, min] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hour, min, 0, 0);
    return date;
  };

  // Merge consecutive classes with same subject and section
  const mergeConsecutiveClasses = (slots: ScheduleSlot[]): ScheduleSlot[] => {
    if (slots.length === 0) return [];
    
    // Sort by start time first
    const sorted = [...slots].sort((a, b) => a.start_time.localeCompare(b.start_time));
    const merged: ScheduleSlot[] = [];
    
    let i = 0;
    while (i < sorted.length) {
      const current = { ...sorted[i] };
      let periodCount = 1;
      const originalSlotIds = [current.slot_id];
      
      // Look ahead for consecutive same classes
      while (i + 1 < sorted.length) {
        const next = sorted[i + 1];
        
        // Check if same subject + same target and times are consecutive
        const sameSubject = current.subject?.id === next.subject?.id;
        const sameTarget = current.target_dept === next.target_dept &&
                          current.target_year === next.target_year &&
                          current.target_section === next.target_section;
        const consecutive = current.end_time === next.start_time;
        
        if (sameSubject && sameTarget && consecutive) {
          periodCount++;
          current.end_time = next.end_time; // Extend end time
          originalSlotIds.push(next.slot_id);
          i++;
        } else {
          break;
        }
      }
      
      merged.push({
        ...current,
        periodCount: periodCount > 1 ? periodCount : undefined,
        originalSlotIds: originalSlotIds.length > 1 ? originalSlotIds : undefined,
      });
      i++;
    }
    
    return merged;
  };

  const determineHeroState = useCallback((slots: ScheduleSlot[]) => {
    const now = new Date();
    
    if (leave) {
      setHeroState('LEAVE');
      return;
    }
    
    if (holiday && holiday.type === 'holiday') {
      setHeroState('HOLIDAY');
      return;
    }

    if (slots.length === 0) {
      setHeroState('NO_CLASSES');
      return;
    }

    const current = slots.find(slot => {
      const start = parseTime(slot.start_time);
      const end = parseTime(slot.end_time);
      return now >= start && now <= end;
    });

    if (current) {
      setCurrentClass(current);
      setHeroState('CLASS_NOW');
      
      const start = parseTime(current.start_time);
      const end = parseTime(current.end_time);
      const total = end.getTime() - start.getTime();
      const elapsed = now.getTime() - start.getTime();
      setProgress(Math.min(100, Math.max(0, (elapsed / total) * 100)));
      return;
    }

    const upcoming = slots.filter(slot => {
      const start = parseTime(slot.start_time);
      return now < start;
    });

    if (upcoming.length === 0) {
      const hasCompletedClasses = slots.some(slot => {
        const end = parseTime(slot.end_time);
        return now > end;
      });
      
      setHeroState(hasCompletedClasses ? 'DONE' : 'NO_CLASSES');
      return;
    }

    const next = upcoming[0];
    setNextClass(next);
    const nextStart = parseTime(next.start_time);
    const mins = Math.ceil((nextStart.getTime() - now.getTime()) / 60000);
    setMinutesUntilNext(mins);
    setHeroState('BREAK');
  }, [holiday, leave]);

  const loadSchedule = useCallback(async (forceRefresh = false) => {
    try {
      if (!forceRefresh) {
        const cached = await AsyncStorage.getItem(SCHEDULE_CACHE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < 5 * 60 * 1000) {
            setSchedule(data);
            determineHeroState(data);
          }
        }
      }

      // OFFLINE FALLBACK: If offline, use cached data
      if (connectionStatus !== 'online') {

        const cachedSchedule = await getCachedTodaySchedule();
        if (cachedSchedule && cachedSchedule.length > 0) {
          const age = await getCacheAge('todaySchedule');
          setCacheAge(age);
          setIsOfflineData(true);
          setSchedule(cachedSchedule as ScheduleSlot[]);
          determineHeroState(cachedSchedule as ScheduleSlot[]);
          return;
        } else {
          setHeroState('NO_CLASSES');
          setIsOfflineData(true);
          return;
        }
      }
      
      setIsOfflineData(false);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const slots = await getTodaySchedule(user.id);
      
      // Fetch swaps and substitutions
      const { swaps, substitutions } = await getSwapsAndSubstitutions(user.id);
      
      // Fetch Holiday Info
      const holidayInfo = await getHolidayInfo();
      setHoliday(holidayInfo);
      
      // Fetch Leave Info
      const leaveInfo = await getLeaveInfo(user.id);
      setLeave(leaveInfo);
      
      // Create sets for quick lookup
      const swappedSlots = new Set(swaps.flatMap(s => [s.slot_a_id, s.slot_b_id]));
      const substituteSlots = substitutions.map(s => s.slot_id);

      // Fetch today's completed sessions from backend (Source of Truth)
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;

      const { data: completedSessions } = await supabase
        .from('attendance_sessions')
        .select('slot_id')
        .eq('faculty_id', user.id)
        .eq('date', todayStr);
      
      const completedSlotIds = new Set((completedSessions || []).map(s => s.slot_id));
      
      // Grace period in minutes after class ends (for scanning)
      const GRACE_MINUTES = 10;
      
      const processed: ScheduleSlot[] = await Promise.all(slots.map(async slot => {
        const now = new Date();
        const start = parseTime(slot.start_time);
        const end = parseTime(slot.end_time);
        const graceEnd = new Date(end.getTime() + GRACE_MINUTES * 60 * 1000);
        
        let status: 'live' | 'completed' | 'incomplete' | 'upcoming';
        
        if (now >= start && now <= end) {
          status = 'live';
        } else if (now > end && now <= graceEnd) {
          // Within grace period - still can scan
          status = 'live';
        } else if (now > graceEnd) {
          // Past grace period - check if attendance was taken
          status = completedSlotIds.has(slot.slot_id) ? 'completed' : 'incomplete';
        } else {
          status = 'upcoming';
        }
        
        return { 
          ...slot, 
          status,
          isSwap: swappedSlots.has(slot.slot_id),
          isSubstitute: false,
        };
      }));

      // Add substitute classes (classes you're covering for someone else)
      const subClasses: ScheduleSlot[] = substitutions.map(sub => {
        const now = new Date();
        const start = parseTime(sub.slot_id.split('_')[1] || '09:00'); // Extract time from slot_id or default
        
        return {
          id: sub.id,
          day: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
          slot_id: sub.slot_id,
          start_time: sub.slot_id.split('_')[1] || '09:00',
          end_time: sub.slot_id.split('_')[2] || '10:00',
          room: null,
          subject: sub.subject,
          target_dept: sub.target_dept,
          target_year: sub.target_year,
          target_section: sub.target_section,
          batch: null,
          status: now > parseTime(sub.slot_id.split('_')[2] || '10:00') ? 'incomplete' : 'upcoming' as const,
          isSwap: false,
          isSubstitute: true,
          originalFacultyId: sub.original_faculty_id, // Track who we're substituting for
        };
      });

      const allClasses = [...processed, ...subClasses];
      allClasses.sort((a, b) => a.start_time.localeCompare(b.start_time));
      
      // Merge consecutive same-subject classes
      const mergedClasses = mergeConsecutiveClasses(allClasses);
      
      setSchedule(mergedClasses);
      determineHeroState(mergedClasses);
      
      // Schedule Reminders (Professional Feature)
      try {
          const NOTIF_PREF_KEY = '@attend_me/notifications_enabled';
          let notificationsEnabled = false;

          // 1. Get preference (Online or Offline)
          if (connectionStatus === 'online') {
              const { data: profile } = await supabase
                .from('profiles')
                .select('notifications_enabled')
                .eq('id', user.id)
                .single();
              
              notificationsEnabled = profile?.notifications_enabled ?? false;
              // Cache it
              await AsyncStorage.setItem(NOTIF_PREF_KEY, JSON.stringify(notificationsEnabled));
          } else {
              // Load from cache
              const cachedPref = await AsyncStorage.getItem(NOTIF_PREF_KEY);
              notificationsEnabled = cachedPref ? JSON.parse(cachedPref) : false;
          }

          if (notificationsEnabled) {
             // 2. Cancel only CLASS reminders (preserve event reminders)
             await NotificationService.cancelClassReminders();
             
             // Skip scheduling if today is a holiday
             if (holidayInfo && holidayInfo.type === 'holiday') {

                return;
             }
             
             // 3. Get existing scheduled notifications for dedup
             const scheduled = await NotificationService.getAllScheduled();
             const scheduledSubjects = new Set(
                 scheduled
                    .filter(n => n.content.data?.type === 'CLASS_REMINDER')
                    .map(n => n.content.data?.subjectName)
             );
             
             for (const slot of mergedClasses) {
                 if (slot.status === 'upcoming' || slot.status === 'live') {
                     const classDate = parseTime(slot.start_time);
                     if (classDate.getTime() > Date.now()) { // Only future classes
                         const subjectName = slot.subject?.name || 'Class';
                         
                         // 4. Schedule if not duplicate
                         if (!scheduledSubjects.has(subjectName)) {
                             await NotificationService.scheduleClassReminder(
                                 subjectName,
                                 `${slot.target_year}-${slot.target_section} (${slot.room || 'N/A'})`,
                                 classDate
                             );
                         }
                     }
                 }
             }
          }
      } catch (err) {

      }
      
      // Cache for offline use
      // Map to ensure types (convert nulls to undefined if needed for cache)
      const cachedData = mergedClasses.map(s => ({
          ...s,
          room: s.room || undefined,
          originalFacultyId: s.originalFacultyId || undefined
      }));
      await cacheTodaySchedule(cachedData);
      await AsyncStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify({
        data: mergedClasses,
        timestamp: Date.now(),
      }));
      
    } catch (error) {
      console.error('Error loading schedule:', error);
      setHeroState('NO_CLASSES');
    }
  }, [determineHeroState]);

  useFocusEffect(
    useCallback(() => {
      loadSchedule(true);
    }, [loadSchedule])
  );

  useEffect(() => {
    const interval = setInterval(() => {
      determineHeroState(schedule);
    }, 60000);
    return () => clearInterval(interval);
  }, [schedule, determineHeroState]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSchedule(true);
    setRefreshing(false);
  }, [loadSchedule]);

  const handleStartClass = () => {
    if (!currentClass) return;
    navigation.navigate('Scan', { classData: currentClass, manual: false });
  };

  const handleManualEntry = () => {
    if (!currentClass) return;
    navigation.navigate('ManualEntry', { classData: currentClass });
  };

  // Handle schedule card click based on status
  const handleScheduleCardPress = (slot: ScheduleSlot) => {
    switch (slot.status) {
      case 'completed':
        // Go to History to view/edit
        // Pass today's date and subject name for highlighting
        navigation.navigate('History', { 
            date: new Date().toISOString(),
            subject: slot.subject?.name 
        });
        break;
      case 'live':
        // Go to Scan for live class
        setCurrentClass(slot);
        navigation.navigate('Scan', { classData: slot });
        break;
      case 'incomplete':
        // Past grace period - manual add only
        navigation.navigate('ManualEntry', { classData: slot });
        break;
      case 'upcoming':
        // Go to Swap for upcoming class
        navigation.navigate('Delegate', { classToSwap: slot });
        break;
    }
  };

  const formatTime = (time: string) => {
    const [hour, min] = time.split(':');
    const h = parseInt(hour);
    const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayHour}:${min}`;
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'offline': return { bg: 'rgba(245, 158, 11, 0.15)', text: '#F59E0B', icon: 'cloud-offline' };
      case 'syncing': return { bg: 'rgba(59, 130, 246, 0.15)', text: '#3B82F6', icon: 'sync' };
      default: return null;
    }
  };

  // Handle floating scan button press during non-class times
  const handleFloatingScanPress = () => {
    // Get incomplete classes for late attendance
    const incompleteClasses = schedule.filter(s => s.status === 'incomplete');
    setPreviousClasses(incompleteClasses);

    // Determine reason based on hero state
    if (heroState === 'BREAK') {
      setOffHoursReason('break');
      setShowOffHoursModal(true);
    } else if (heroState === 'DONE') {
      setOffHoursReason('after_hours');
      setShowOffHoursModal(true);
    } else if (heroState === 'NO_CLASSES' || heroState === 'HOLIDAY' || heroState === 'LEAVE') {
      // Could be holiday, leave, before hours, or no schedule
      const now = new Date();
      const firstClassTime = schedule.length > 0 ? parseTime(schedule[0].start_time) : null;
      if (firstClassTime && now < firstClassTime && heroState !== 'LEAVE' && heroState !== 'HOLIDAY') {
        setOffHoursReason('before_hours');
      } else {
        setOffHoursReason('after_hours');
      }
      setShowOffHoursModal(true);
    }
  };

  const handleOffHoursClassSelect = (selectedClass: ScheduleSlot) => {
    setShowOffHoursModal(false);
    navigation.navigate('ManualEntry', { classData: selectedClass });
  };

  const handleSyncPress = async () => {
    if (!isOnline) {
      setToast({ visible: true, message: `Offline — Rosters synced: ${lastSyncAge}`, type: 'warning' });
      return;
    }

    if (syncStatus.pendingCount === 0) {
      setToast({ visible: true, message: `All synced ✓ Rosters: ${lastSyncAge}`, type: 'success' });
      return;
    }

    setIsSyncingManually(true);
    setToast({ visible: true, message: 'Syncing pending items...', type: 'info' });
    
    // Slight delay for UX perception
    setTimeout(async () => {
        const result = await syncPending();
        setIsSyncingManually(false);
        if (result.failed === 0) {
          setToast({ visible: true, message: 'Sync Complete!', type: 'success' });
        } else {
          setToast({ visible: true, message: `Synced ${result.synced}, Failed ${result.failed}`, type: 'warning' });
        }
    }, 500);
  };

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <View style={styles.headerLeft}>
        <TouchableOpacity 
          style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' }]}
          onPress={() => navigation.navigate('Profile')}
          activeOpacity={0.8}
        >
          {profileImage ? (
            <Image 
              source={{ uri: profileImage }} 
              style={{ width: '100%', height: '100%' }} 
              resizeMode="cover"
            />
          ) : (
            <Text style={[styles.avatarText, { color: '#FFFFFF' }]}>
              {userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </Text>
          )}
        </TouchableOpacity>
        <View>
          <Text style={[styles.greeting, { color: 'rgba(255,255,255,0.7)' }]}>
            {getGreeting()}
          </Text>
          <Text style={[styles.userName, { color: '#FFFFFF' }]}>
            {userName}
          </Text>
        </View>
      </View>
      
      <View style={styles.headerRight}>
        {/* Sync Manager Icon */}
        <TouchableOpacity 
          style={[styles.iconButton, { backgroundColor: 'rgba(255,255,255,0.15)' }]}
          onPress={handleSyncPress}
          activeOpacity={0.7}
        >
          {isSyncingManually ? (
             <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
             <Ionicons 
               name={!isOnline ? 'cloud-offline' : 'cloud-done'} 
               size={20} 
               color={!isOnline ? 'rgba(255,255,255,0.5)' : '#FFFFFF'} 
             />
          )}
          
          {/* Pending Badge */}
          {syncStatus.pendingCount > 0 && (
            <View style={{
              position: 'absolute',
              top: -5,
              right: -5,
              backgroundColor: '#EF4444',
              borderRadius: 10,
              minWidth: 20,
              height: 20,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1.5,
              borderColor: '#0D4A4A'
            }}>
              <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>
                {syncStatus.pendingCount > 9 ? '9+' : syncStatus.pendingCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        
        <BellIcon 
          style={[styles.iconButton, { backgroundColor: 'rgba(255,255,255,0.15)' }]} 
          size={22} 
          color="#FFFFFF" 
        />
      </View>
    </View>
  );

  const renderHeroWidget = () => {
    switch (heroState) {
      case 'LOADING':
        return (
          <View style={[styles.heroCard, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
            <PulsingDots size="large" color="#0D9488" />
            <Text style={[styles.loadingText, { color: isDark ? '#94A3B8' : '#64748B' }]}>Loading schedule...</Text>
          </View>
        );

      case 'NO_CLASSES': {
        // Detect reason based on day of week
        const dayOfWeek = new Date().getDay();
        const reason = dayOfWeek === 0 ? 'sunday' : dayOfWeek === 6 ? 'saturday' : 'no_schedule';
        
        return (
          <NoClassesHero reason={reason} />
        );
      }

      case 'CLASS_NOW':
        return (
          <CircularClockHero
            ref={heroRef}
            subjectName={currentClass?.subject?.name || 'Loading...'}
            section={`${currentClass?.target_dept} • Year ${currentClass?.target_year} • Section ${currentClass?.target_section}${currentClass?.batch ? ` • Batch ${currentClass.batch}` : ''}`}
            startTime={currentClass?.start_time || '00:00'}
            endTime={currentClass?.end_time || '00:00'}
            progress={progress}
            onSlideComplete={handleStartClass}
            onManualEntry={handleManualEntry}
          />
        );

      case 'BREAK':
        return (
          <View style={[styles.heroCard, { backgroundColor: isDark ? '#082020' : '#FFFFFF' }]}>
            <View style={styles.breakHeader}>
              <View style={styles.breakBadge}>
                <Ionicons name="cafe-outline" size={16} color="#F59E0B" />
                <Text style={styles.breakBadgeText}>Break</Text>
              </View>
              <View style={styles.countdown}>
                <Text style={styles.countdownValue}>{minutesUntilNext}</Text>
                <Text style={styles.countdownUnit}>min</Text>
              </View>
            </View>
            
            <View style={styles.breakContent}>
              <Text style={[styles.breakLabel, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                Next Class
              </Text>
              <Text style={[styles.breakSubject, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                {nextClass?.subject?.name}
              </Text>
              <Text style={[styles.breakSection, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                {nextClass?.target_dept} • Year {nextClass?.target_year} • {nextClass?.target_section}{nextClass?.batch ? ` • B${nextClass.batch}` : ''}
              </Text>
            </View>
            
            {/* Scan Button for late attendance */}
            <TouchableOpacity 
              style={[styles.breakScanButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
              onPress={handleFloatingScanPress}
              activeOpacity={0.8}
            >
              <Ionicons name="scan-outline" size={20} color={isDark ? '#FFFFFF' : '#374151'} />
              <Text style={[styles.breakScanText, { color: isDark ? '#FFFFFF' : '#374151' }]}>Take Late Attendance</Text>
            </TouchableOpacity>
          </View>
        );

    case 'DONE':
        return (
          <View style={[styles.heroCard, { backgroundColor: isDark ? '#082020' : '#FFFFFF' }]}>
            <View style={[styles.doneInnerCard, { backgroundColor: 'transparent' }]}>
              <View style={styles.doneContent}>
                <Ionicons name="checkmark-circle" size={48} color={isDark ? '#3DDC97' : '#0D4A4A'} />
                <Text style={[styles.doneTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>All Classes Done</Text>
                <Text style={[styles.doneSubtitle, { color: isDark ? 'rgba(255,255,255,0.7)' : '#64748B' }]}>Great work today</Text>
              </View>
              
              {/* Button for late attendance if there are incomplete classes */}
              {schedule.some(s => s.status === 'incomplete') && (
                <TouchableOpacity 
                  style={[styles.doneScanButton, { backgroundColor: isDark ? '#2C2C2E' : '#F2F2F7' }]}
                  onPress={handleFloatingScanPress}
                  activeOpacity={0.8}
                >
                  <Ionicons name="scan-outline" size={18} color={isDark ? '#FFFFFF' : '#0D4A4A'} />
                  <Text style={[styles.doneScanText, { color: isDark ? '#FFFFFF' : '#0D4A4A' }]}>Take Late Attendance</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );

      case 'LEAVE':
        return (
          <View style={[styles.heroCard, { backgroundColor: isDark ? '#082020' : '#FFFFFF' }]}>
            <View style={[styles.doneInnerCard, { backgroundColor: 'transparent', paddingVertical: scale(10) }]}>
              <View style={styles.doneContent}>
                <View style={{ 
                  width: 80, height: 80, borderRadius: 40, 
                  backgroundColor: isDark ? 'rgba(56, 189, 248, 0.1)' : '#E0F2FE',
                  alignItems: 'center', justifyContent: 'center', marginBottom: 16
                }}>
                  <Ionicons name="airplane" size={40} color="#38BDF8" />
                </View>
                <Text style={[styles.doneTitle, { color: isDark ? '#FFFFFF' : '#0F172A', textAlign: 'center' }]}>
                  On Leave
                </Text>
                <Text style={[styles.doneSubtitle, { color: isDark ? 'rgba(255,255,255,0.7)' : '#64748B', textAlign: 'center', marginTop: 8, maxWidth: '80%' }]}>
                  Enjoy your time off! You are not required to take classes today.
                </Text>
              </View>
              
              {/* Take late attendance/extra classes explicitly requested by user when on leave */}
              <TouchableOpacity 
                style={[styles.doneScanButton, { backgroundColor: isDark ? '#2C2C2E' : '#F2F2F7', marginTop: 0 }]}
                onPress={handleFloatingScanPress}
                activeOpacity={0.8}
              >
                <Ionicons name="scan-outline" size={18} color={isDark ? '#FFFFFF' : '#0D4A4A'} />
                <Text style={[styles.doneScanText, { color: isDark ? '#FFFFFF' : '#0D4A4A' }]}>Take Late Classes</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'HOLIDAY':
        return (
          <View style={[styles.heroCard, { backgroundColor: isDark ? '#082020' : '#FFFFFF' }]}>
             <View style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <View style={{ 
                  width: 80, height: 80, borderRadius: 40, 
                  backgroundColor: isDark ? 'rgba(245, 158, 11, 0.1)' : '#FEF3C7',
                  alignItems: 'center', justifyContent: 'center', marginBottom: 16
                }}>
                  <Ionicons name="calendar" size={40} color="#F59E0B" />
                </View>
                <Text style={[styles.doneTitle, { color: isDark ? '#FFFFFF' : '#0F172A', textAlign: 'center' }]}>
                  {holiday?.title || 'Holiday'}
                </Text>
                <Text style={[styles.doneSubtitle, { color: isDark ? 'rgba(255,255,255,0.7)' : '#64748B', textAlign: 'center', marginTop: 8, maxWidth: '80%' }]}>
                  {holiday?.description || 'No classes scheduled for today.'}
                </Text>
             </View>
          </View>
        );
    }
  };

  const renderScheduleItem = (slot: ScheduleSlot, index: number) => {
    // Status colors
    const colors = {
      live: '#10B981',        // Emerald green - active
      completed: '#9CA3AF',   // Gray - done
      incomplete: '#F59E0B',  // Light orange - warning
      upcoming: '#3B82F6',    // Blue - future
      swapped: '#8B5CF6',     // Purple - swapped
      substitute: '#A78BFA',  // Light purple - substitute
    };

    const statusLabels = {
      live: 'Live',
      completed: 'Completed',
      incomplete: 'Incomplete',
      upcoming: 'Upcoming',
    };

    // Check if it's a lab class
    const isLab = slot.subject?.name?.toLowerCase().includes('lab');
    // Get batch info from slot (default to 'full' if not specified)
    const batchLabel = slot.batch === 1 ? 'Batch 1' : slot.batch === 2 ? 'Batch 2' : 'Full Class';

    return (
      <TouchableOpacity
        key={slot.id || index}
        style={[
          styles.scheduleCard,
          { backgroundColor: isDark ? '#082020' : '#FFFFFF' },
        ]}
        onPress={() => handleScheduleCardPress(slot)}
        activeOpacity={0.8}
      >
        {/* Left gradient accent */}
        <LinearGradient
          colors={[`${colors[slot.status]}40`, `${colors[slot.status]}00`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.cardGradient}
        />
        
        {/* Left colored bar */}
        <View style={[styles.cardAccent, { backgroundColor: colors[slot.status] }]} />

        <View style={styles.cardContent}>
          {/* Time Column */}
          <View style={styles.scheduleTime}>
            <Text style={[styles.timeStart, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
              {formatTime(slot.start_time)}
            </Text>
            <Text style={[styles.timeEnd, { color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B' }]}>
              {formatTime(slot.end_time)}
            </Text>
          </View>

          {/* Info Column */}
          <View style={styles.scheduleInfo}>
            <Text style={[styles.scheduleSubject, { color: isDark ? '#FFFFFF' : '#0F172A' }]} numberOfLines={1}>
              {slot.subject?.name || 'N/A'}
            </Text>
            
            <View style={styles.scheduleMetaRow}>
              <Text style={[styles.scheduleSectionText, { color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B' }]}>
                {slot.target_dept} • Year {slot.target_year} • {slot.target_section}{slot.batch ? ` • B${slot.batch}` : ''}
              </Text>
            </View>
            
            {/* Tags Row */}
            <View style={styles.tagsRow}>
              {/* Status Badge */}
              <View style={[styles.statusBadge, { backgroundColor: `${colors[slot.status]}20` }]}>
                {slot.status === 'live' && <View style={[styles.liveDotSmall, { backgroundColor: colors[slot.status] }]} />}
                <Text style={[styles.statusBadgeText, { color: colors[slot.status] }]}>
                  {statusLabels[slot.status]}
                </Text>
              </View>
              
              {/* Swap Badge */}
              {slot.isSwap && (
                <View style={[styles.swapBadge, { backgroundColor: 'rgba(139, 92, 246, 0.2)' }]}>
                  <Ionicons name="swap-horizontal" size={11} color="#8B5CF6" />
                  <Text style={styles.swapBadgeText}>SWAP</Text>
                </View>
              )}
              
              {/* Substitute Badge */}
              {slot.isSubstitute && (
                <View style={[styles.subBadge, { backgroundColor: 'rgba(167, 139, 250, 0.2)' }]}>
                  <Ionicons name="person-outline" size={11} color="#A78BFA" />
                  <Text style={styles.subBadgeText}>SUB</Text>
                </View>
              )}
              
              {/* Lab Batch Tag */}
              {isLab && (
                <View style={[styles.batchTag, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.15)' }]}>
                  <Ionicons name="people-outline" size={11} color="#8B5CF6" />
                  <Text style={styles.batchTagText}>{batchLabel}</Text>
                </View>
              )}
              
              {/* Period Count Badge for Merged Classes */}
              {slot.periodCount && slot.periodCount > 1 && (
                <View style={[styles.periodBadge, { backgroundColor: isDark ? 'rgba(13, 74, 74, 0.3)' : 'rgba(13, 74, 74, 0.15)' }]}>
                  <Ionicons name="copy-outline" size={11} color="#0D4A4A" />
                  <Text style={styles.periodBadgeText}>{slot.periodCount}x</Text>
                </View>
              )}
            </View>
          </View>

          {/* Action Icon */}
          <View style={styles.scheduleAction}>
            <Ionicons 
              name={slot.status === 'completed' ? 'checkmark-circle' : slot.status === 'live' ? 'chevron-forward' : 'time-outline'} 
              size={22} 
              color={colors[slot.status]} 
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Premium Gradient Background with Orbs */}
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={[Colors.premium.gradientStart, Colors.premium.gradientMid, Colors.premium.gradientEnd]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <View style={[styles.orb, styles.orb1]} />
        <View style={[styles.orb, styles.orb2]} />
        <View style={[styles.orb, styles.orb3]} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0D4A4A" />
        }
      >
        {renderHeader()}
        
        <View style={[styles.heroContainer, heroState === 'NO_CLASSES' && { flex: 1 }]}>
          {renderHeroWidget()}
        </View>

        {/* Schedule Section - hidden when no classes */}
        {heroState !== 'NO_CLASSES' && (
          <View style={styles.scheduleSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Today's Schedule
              </Text>
              <Text style={styles.scheduleCount}>
                {schedule.length} classes
              </Text>
            </View>

            {/* Schedule Container - Transparent */}
            <View style={[styles.scheduleContainer, { 
              marginTop: 8 
            }]}>
              {schedule.map((slot, index) => renderScheduleItem(slot, index))}
            </View>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>


      <OffHoursScanModal
        visible={showOffHoursModal}
        onClose={() => setShowOffHoursModal(false)}
        reason={offHoursReason}
        previousClasses={previousClasses.map(c => ({
          id: c.id || c.slot_id,
          slot_id: c.slot_id,
          subject: c.subject || { name: 'Unknown', code: '' },
          start_time: c.start_time,
          end_time: c.end_time,
          target_dept: c.target_dept,
          target_year: c.target_year,
          target_section: c.target_section,
        }))}
        nextClass={nextClass ? {
          subject: nextClass.subject || { name: 'Unknown' },
          start_time: nextClass.start_time,
          slot_id: nextClass.slot_id,
        } : null}
        onSelectClass={(item) => handleOffHoursClassSelect(schedule.find(s => s.slot_id === item.slot_id)!)}
      />
      <ZenToast 
        visible={toast.visible} 
        message={toast.message} 
        type={toast.type}
        onHide={() => setToast(prev => ({ ...prev, visible: false }))} 
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  orb: {
    position: 'absolute',
    borderRadius: moderateScale(200),
  },
  orb1: {
    width: scale(300),
    height: scale(300),
    backgroundColor: 'rgba(61, 220, 151, 0.15)',
    top: verticalScale(-100),
    right: scale(-100),
  },
  orb2: {
    width: scale(250),
    height: scale(250),
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    bottom: verticalScale(200),
    left: scale(-80),
  },
  orb3: {
    width: scale(180),
    height: scale(180),
    backgroundColor: 'rgba(61, 220, 151, 0.08)',
    bottom: verticalScale(400),
    right: scale(-40),
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: scale(20),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(24),
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
  },
  avatar: {
    width: scale(48),
    height: scale(48),
    borderRadius: moderateScale(16),
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: normalizeFont(17),
    fontWeight: '700',
  },
  greeting: {
    fontSize: normalizeFont(13),
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  userName: {
    fontSize: normalizeFont(22),
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(12),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    gap: scale(5),
  },
  statusText: {
    fontSize: normalizeFont(12),
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  iconButton: {
    width: scale(44),
    height: scale(44),
    borderRadius: moderateScale(14),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroContainer: {
    marginBottom: verticalScale(24),
  },
  heroCard: {
    borderRadius: moderateScale(20),
    padding: scale(24),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(4) },
    shadowOpacity: 0.08,
    shadowRadius: moderateScale(12),
    elevation: 4,
  },
  heroEmpty: {
    alignItems: 'center',
    paddingVertical: verticalScale(36),
  },
  emptyIcon: {
    width: scale(72),
    height: scale(72),
    borderRadius: moderateScale(20),
    backgroundColor: 'rgba(13, 74, 74, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(16),
  },
  emptyTitle: {
    fontSize: normalizeFont(20),
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: normalizeFont(14),
    marginTop: verticalScale(4),
  },
  loadingText: {
    fontSize: normalizeFont(14),
    marginTop: verticalScale(16),
  },
  heroCardLive: {
    borderRadius: moderateScale(24),
    overflow: 'hidden',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: verticalScale(8) },
    shadowOpacity: 0.25,
    shadowRadius: moderateScale(20),
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  heroGlassy: {
    padding: scale(24),
    borderRadius: moderateScale(24),
  },
  heroGradient: {
    padding: scale(20),
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    alignSelf: 'flex-start',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(20),
    gap: scale(6),
    marginBottom: verticalScale(16),
  },
  liveDot: {
    width: scale(8),
    height: scale(8),
    borderRadius: moderateScale(4),
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: moderateScale(4),
  },
  liveText: {
    color: '#10B981',
    fontSize: normalizeFont(12),
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  heroContent: {
    marginBottom: verticalScale(20),
  },
  heroSubject: {
    fontSize: normalizeFont(24),
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginBottom: verticalScale(4),
  },
  heroSection: {
    fontSize: normalizeFont(14),
    color: 'rgba(255,255,255,0.7)',
    marginBottom: verticalScale(16),
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  timeText: {
    fontSize: normalizeFont(12),
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  progressBar: {
    flex: 1,
    height: verticalScale(4),
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: moderateScale(2),
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4ADE80',
    borderRadius: moderateScale(2),
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  slideWrapper: {
    flex: 1,
  },
  manualButton: {
    width: scale(56),
    height: scale(56),
    borderRadius: moderateScale(16),
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.1,
    shadowRadius: moderateScale(4),
    elevation: 2,
  },
  manualHint: {
    fontSize: normalizeFont(11),
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: verticalScale(8),
  },
  breakHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: verticalScale(16),
  },
  breakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(8),
    gap: scale(5),
  },
  breakBadgeText: {
    fontSize: normalizeFont(13),
    fontWeight: '600',
    color: '#F59E0B',
  },
  countdown: {
    alignItems: 'center',
    backgroundColor: '#0D4A4A',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(12),
  },
  countdownValue: {
    fontSize: normalizeFont(24),
    fontWeight: '700',
    color: '#FFFFFF',
  },
  countdownUnit: {
    fontSize: normalizeFont(11),
    color: 'rgba(255,255,255,0.7)',
    marginTop: verticalScale(-2),
  },
  breakContent: {},
  breakLabel: {
    fontSize: normalizeFont(12),
    fontWeight: '500',
    marginBottom: verticalScale(4),
  },
  breakSubject: {
    fontSize: normalizeFont(22),
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: verticalScale(2),
  },
  breakSection: {
    fontSize: normalizeFont(14),
  },
  breakScanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(12),
    marginTop: verticalScale(16),
    gap: scale(8),
  },
  breakScanText: {
    fontSize: normalizeFont(14),
    fontWeight: '600',
  },
  liveInnerCard: {
    borderRadius: moderateScale(16),
    padding: scale(20),
  },
  heroCardDone: {
    borderRadius: moderateScale(20),
    overflow: 'hidden',
  },
  doneInnerCard: {
    borderRadius: moderateScale(16),
    padding: scale(24),
    alignItems: 'center',
  },
  doneContent: {
    alignItems: 'center',
    paddingVertical: verticalScale(32),
  },
  doneTitle: {
    fontSize: normalizeFont(22),
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: verticalScale(12),
  },
  doneSubtitle: {
    fontSize: normalizeFont(14),
    color: 'rgba(255,255,255,0.8)',
    marginTop: verticalScale(2),
  },
  doneScanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(20),
    borderRadius: moderateScale(12),
    marginTop: verticalScale(16),
    gap: scale(8),
  },
  doneScanText: {
    fontSize: normalizeFont(14),
    fontWeight: '600',
    color: '#FFFFFF',
  },
  scheduleSection: {
    marginTop: verticalScale(8),
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(16),
  },
  sectionTitle: {
    fontSize: normalizeFont(20),
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  scheduleCount: {
    fontSize: normalizeFont(14),
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  scheduleContainer: {
    gap: 0,
  },
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
    fontWeight: '700',
  },
  timeEnd: {
    fontSize: normalizeFont(12),
    fontWeight: '500',
    marginTop: verticalScale(2),
  },
  scheduleInfo: {
    flex: 1,
    marginLeft: scale(14),
  },
  scheduleSubject: {
    fontSize: normalizeFont(16),
    fontWeight: '700',
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
    fontWeight: '600',
  },
  scheduleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(6),
  },
  scheduleSectionText: {
    fontSize: normalizeFont(13),
    fontWeight: '500',
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
    fontWeight: '700',
    color: '#8B5CF6',
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
    fontWeight: '700',
    color: '#A78BFA',
    letterSpacing: 0.5,
  },
  batchTagText: {
    fontSize: normalizeFont(11),
    fontWeight: '600',
    color: '#8B5CF6',
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
    fontWeight: '700',
    color: '#0D4A4A',
    letterSpacing: 0.3,
  },
  scheduleAction: {
    paddingLeft: scale(12),
  },
  actionHint: {
    fontSize: normalizeFont(10),
    fontWeight: '600',
  },
});

export default HomeScreen;
