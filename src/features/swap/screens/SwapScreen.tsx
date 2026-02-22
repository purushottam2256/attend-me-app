/**
 * SwapScreen - Substitute & Swap Management
 * Premium Zen UI for class handoffs and time exchanges
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Animated,
  Modal,
  StyleSheet,
  Dimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../../contexts';
import { NotificationService } from '../../../services/NotificationService';
import { supabase } from '../../../config/supabase';
import { getTodaySchedule, getTomorrowSchedule, TimetableSlot } from '../../../services/dashboardService';
import { useConnectionStatus } from '../../../hooks/useConnectionStatus'; // Added import
import { swapStyles as styles } from '../styles/SwapScreen.styles';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';

type SwapScreenRouteProp = RouteProp<{
    Swap: { classToSwap?: TimetableSlot };
}, 'Swap'>;

type Mode = 'substitute' | 'swap';

interface Faculty {
  id: string;
  full_name: string;
  dept: string;
  email: string;
  push_token?: string;
}

export const SwapScreen: React.FC = () => {
  const { isDark } = useTheme();
  const { status: connectionStatus } = useConnectionStatus(); // Corrected property name
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<SwapScreenRouteProp>();
  
  const [mode, setMode] = useState<Mode>('substitute');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<{ 
    visible: boolean; 
    message: string; 
    type: 'success' | 'error' | 'warning';
    subMessage?: string;
  }>({
      visible: false,
      message: '',
      type: 'success'
  });
  
  // User Info
  const [userId, setUserId] = useState<string | null>(null);
  const [userDept, setUserDept] = useState<string | null>(null);
  const [isShowingTomorrow, setIsShowingTomorrow] = useState(false);
  
  // Substitute Mode State
  const [myClasses, setMyClasses] = useState<TimetableSlot[]>([]);
  const [selectedClass, setSelectedClass] = useState<TimetableSlot | null>(null);
  const [facultyList, setFacultyList] = useState<Faculty[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFaculty, setSelectedFaculty] = useState<Faculty | null>(null);
  const [substituteNote, setSubstituteNote] = useState('');
  
  // Swap Mode State
  const [swapMyClass, setSwapMyClass] = useState<TimetableSlot | null>(null);
  const [swapTargetFaculty, setSwapTargetFaculty] = useState<Faculty | null>(null);
  const [swapTargetSlot, setSwapTargetSlot] = useState<string | null>(null);
  const [targetFacultySchedule, setTargetFacultySchedule] = useState<TimetableSlot[]>([]);
  const [loadingTarget, setLoadingTarget] = useState(false);
  const [swapSearchQuery, setSwapSearchQuery] = useState('');
  const [sameClassFaculties, setSameClassFaculties] = useState<Faculty[]>([]);
  const [swapNote, setSwapNote] = useState('');
  
  // Success Animation State
  // Success Animation State
  const fadeAnim = useState(new Animated.Value(0))[0];
  const scaleAnim = useState(new Animated.Value(0.5))[0];

  useEffect(() => {
    if (feedback.visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 6,
          useNativeDriver: true,
        }),
      ]).start();
      
      // Auto hide logic
      if (feedback.type !== 'success') {
          const timer = setTimeout(() => {
              setFeedback(prev => ({ ...prev, visible: false }));
          }, 2500);
          return () => clearTimeout(timer);
      }
    } else {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.5);
    }
  }, [feedback.visible]);

  const showFeedback = (type: 'success' | 'error' | 'warning', message: string, subMessage?: string) => {
      setFeedback({ visible: true, type, message, subMessage });
  };
  const colors = {
    // Backgrounds
    background: isDark ? '#0A0A0A' : '#F8FAFC',
    surface: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
    cardBg: isDark ? 'rgba(13, 74, 74, 0.4)' : '#FFFFFF',
    cardBorder: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
    
    // Text
    textPrimary: isDark ? '#FFFFFF' : '#0F172A',
    textSecondary: isDark ? 'rgba(255,255,255,0.7)' : '#64748B',
    textMuted: isDark ? 'rgba(255,255,255,0.5)' : '#94A3B8',
    
    // Inputs
    inputBg: isDark ? 'rgba(255,255,255,0.08)' : '#F8FAFC',
    inputBorder: isDark ? 'rgba(255,255,255,0.15)' : '#E2E8F0',
    
    // Brand
    accent: '#0D9488', 
    teal: '#0D4A4A',
    tealLight: '#1A6B6B',
    tealDark: '#0F3D3D',
    
    // Status
    success: '#22C55E',
    danger: '#EF4444',
    warning: '#F59E0B',
  };

  // Load user and data
  useEffect(() => {
    loadData();
  }, []);

  // Pre-selection Effect (runs when screen is focused)
  useFocusEffect(
    useCallback(() => {
      if (route.params?.classToSwap) {
          const classToSwap = route.params.classToSwap;
          // Pre-select for Substitute Mode
          setSelectedClass(classToSwap);
          
          // Pre-select for Swap Mode
          setSwapMyClass(classToSwap);
          
          // Clear params to prevent re-selection on subsequent focus if user changed intent
          navigation.setParams({ classToSwap: undefined });
      }
    }, [route.params, navigation])
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      
      // Get user's department
      const { data: profile } = await supabase
        .from('profiles')
        .select('dept')
        .eq('id', user.id)
        .single();
      setUserDept(profile?.dept || null);
      setUserDept(profile?.dept || null);
      
      // Load today's schedule
      const schedule = await getTodaySchedule(user.id);
      // Filter out completed classes
      const now = new Date();
      const remaining = schedule.filter(slot => {
        const [hour, min] = slot.end_time.split(':').map(Number);
        const endTime = new Date();
        endTime.setHours(hour, min, 0, 0);
        return endTime > now;
      });
      
      // If today's classes are done, show tomorrow's schedule
      if (remaining.length === 0) {
        const tomorrow = await getTomorrowSchedule(user.id);
        setMyClasses(tomorrow);
        setIsShowingTomorrow(true);
      } else {
        setMyClasses(remaining);
        setIsShowingTomorrow(false);
      }
      
      // Load ALL faculty in same dept for substitute
      if (profile?.dept) {
        const { data: faculties, error: fetchError } = await supabase
          .from('profiles')
          .select('id, full_name, dept, email, push_token')
          .eq('dept', profile.dept)
          .neq('id', user.id)
          .order('full_name');
        
        if (fetchError) {
          console.error('[SwapScreen] Fetch Error:', fetchError);
        }
        
        // Removed debug log
        setFacultyList(faculties || []);
      } else {
        // Removed debug log
      }
      
    } catch (error) {
      console.error('[SwapScreen] Load error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load faculties who teach the same class (for swap mode)
  // Enhanced Faculty Type for Swap
  interface SwapCandidate extends Faculty {
    target_slot?: TimetableSlot;
  }
  
  // Load faculties who teach the same class (for swap mode)
  const loadSameClassFaculties = async (slot: TimetableSlot) => {
    if (!userId) return;
    
    try {
      // Find other faculties & their specific slot for this class
      const { data: timetables } = await supabase
        .from('master_timetables')
        .select(`
          id, day, room, batch, is_active,
          faculty_id,
          slot_id, start_time, end_time,
          subject:subjects(id, name, code),
          target_dept, target_year, target_section
        `)
        .eq('target_dept', slot.target_dept)
        .eq('target_year', slot.target_year)
        .eq('target_section', slot.target_section)
        .neq('faculty_id', userId);
      
      if (timetables && timetables.length > 0) {
        // Get unique faculty IDs
        const facultyIds = [...new Set(timetables.map(t => t.faculty_id))];
        
        // Fetch Profiles
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, dept, email, push_token')
          .in('id', facultyIds);
          
        if (profiles) {
           // Merge Profile + Slot Info
           const candidates: SwapCandidate[] = profiles.map(profile => {
               // Find the matching timetable entry (first match)
               const match = timetables.find(t => t.faculty_id === profile.id);
               
               // Handle subject being array or object
               let cleanSlot: TimetableSlot | undefined;
               
               if (match) {
                   const subjectAny = match.subject as any;
                   const subjectObj = Array.isArray(subjectAny) ? subjectAny[0] : subjectAny;
                   
                   cleanSlot = {
                       ...match,
                       subject: subjectObj
                   } as TimetableSlot;
               }

               return {
                   ...profile,
                   target_slot: cleanSlot
               };
           });
           setSameClassFaculties(candidates);
        }
      } else {
        setSameClassFaculties([]);
      }
    } catch (error) {
      console.error('[SwapScreen] Load same class faculties error:', error);
    }
  };

  // Load target faculty schedule
  const loadTargetSchedule = async (facultyId: string) => {
    setLoadingTarget(true);
    try {
      let schedule: TimetableSlot[] = [];
      if (isShowingTomorrow) {
          schedule = await getTomorrowSchedule(facultyId);
      } else {
          schedule = await getTodaySchedule(facultyId);
      }

      const now = new Date();
      const remaining = schedule.filter(slot => {
        // If showing tomorrow, allow all slots (no time filtering needed)
        if (isShowingTomorrow) return slot.slot_id !== swapMyClass?.slot_id;

        const [hour, min] = slot.end_time.split(':').map(Number);
        const endTime = new Date();
        endTime.setHours(hour, min, 0, 0);
        return endTime > now && slot.slot_id !== swapMyClass?.slot_id;
      });
      setTargetFacultySchedule(remaining);
    } catch (error) {
      console.error('[SwapScreen] Load target schedule error:', error);
    } finally {
      setLoadingTarget(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  // Filter faculty by search
  const filteredFaculty = facultyList.filter(f =>
    f.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.dept?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSwapFaculty = sameClassFaculties.filter(f =>
    f.full_name.toLowerCase().includes(swapSearchQuery.toLowerCase()) ||
    f.dept?.toLowerCase().includes(swapSearchQuery.toLowerCase())
  );

  // Send substitute request
  const sendSubstituteRequest = async () => {
    if (!selectedClass || !selectedFaculty || !userId) {
      showFeedback('warning', 'Missing Selection', 'Please select a class and faculty');
      return;
    }

    if (connectionStatus === 'offline') {
        showFeedback('warning', 'Offline Mode', 'Cannot send requests while offline');
        return;
    }
    
    try {
      const today = new Date();
      const targetDate = isShowingTomorrow 
          ? new Date(today.setDate(today.getDate() + 1)).toISOString().split('T')[0]
          : today.toISOString().split('T')[0];
      
      const { error } = await supabase
        .from('substitutions')
        .insert({
          date: targetDate, // Use calculated date
          slot_id: selectedClass.slot_id,
          original_faculty_id: userId,
          substitute_faculty_id: selectedFaculty.id,
          subject_id: (selectedClass as any).subject?.id || (selectedClass as any).subject_id,
          target_dept: selectedClass.target_dept,
          target_year: selectedClass.target_year,
          target_section: selectedClass.target_section,
          status: 'pending',
          created_by: userId,
          notes: substituteNote || null,
        });
      
      if (error) {

          throw error;
      }
      
      // Create notification
      // Notification created via Realtime trigger or NotificationScreen fetches 'substitutions' directly
      // Removed redundant manual notification insert to prevent duplicates

      // Send Real Push (Formal)
      if (selectedFaculty.push_token) {
          const { data: { user } } = await supabase.auth.getUser();
          const senderName = user?.user_metadata?.full_name || 'A Faculty Member';
          
          // Hosted Splash Logo
          const logoUrl = 'https://xxemwolzhhwkiwvjyniv.supabase.co/storage/v1/object/public/avatars/5cb62ec2-fc11-4b6d-abe1-cf76a21f9570/app-images/splash-logo.jpg';

          NotificationService.sendPushNotification(
              selectedFaculty.push_token,
              'Formal Substitution Request',
              `Dear ${selectedFaculty.full_name},\n\nProf. ${senderName} requests you to substitute for their ${selectedClass.target_dept}-${selectedClass.target_year}-${selectedClass.target_section} class (${selectedClass.start_time}).\n\nPlease verify your availability and respond.`,
              { type: 'SUB_REQUEST', requestId: selectedClass.slot_id },
              'SUB_REQUEST', // Category ID
              logoUrl // Add Logo
          );
      }
      
      showFeedback('success', 'Request Sent!', `Request sent to ${selectedFaculty.full_name}`);
      
      setTimeout(() => {
         setFeedback(prev => ({ ...prev, visible: false }));
         navigation.navigate('Home');
      }, 1500);
      
    } catch (error: any) {
      showFeedback('error', 'Failed', error.message || 'Failed to send request');
    }
  };

  // Send swap request
  const sendSwapRequest = async () => {
    if (!swapMyClass || !swapTargetFaculty || !swapTargetSlot || !userId) {
      showFeedback('warning', 'Missing Selection', 'Please select your class, faculty, and their slot');
      return;
    }

    if (connectionStatus === 'offline') {
        showFeedback('warning', 'Offline Mode', 'Cannot send requests while offline');
        return;
    }
    
    try {
      const today = new Date();
      const targetDate = isShowingTomorrow 
          ? new Date(today.setDate(today.getDate() + 1)).toISOString().split('T')[0]
          : today.toISOString().split('T')[0];
      
      const { error } = await supabase
        .from('class_swaps')
        .insert({
          date: targetDate,
          faculty_a_id: userId,
          faculty_b_id: swapTargetFaculty.id,
          slot_a_id: swapMyClass.slot_id,
          slot_b_id: swapTargetSlot,
          status: 'pending',
          notes: swapNote || null,
        });
      
      if (error) throw error;
      
      // Notification handled by Database Trigger (notification_triggers.sql)
      // await supabase.from('notifications').insert({...});

      // Send Real Push
      if (swapTargetFaculty.push_token) {
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          const senderName = currentUser?.user_metadata?.full_name || 'A Faculty Member';
          
          // Hosted Splash Logo
          const logoUrl = 'https://xxemwolzhhwkiwvjyniv.supabase.co/storage/v1/object/public/avatars/5cb62ec2-fc11-4b6d-abe1-cf76a21f9570/app-images/splash-logo.jpg';

          NotificationService.sendPushNotification(
              swapTargetFaculty.push_token,
              'Class Swap Proposal',
              `Dear ${swapTargetFaculty.full_name},\n\nProf. ${senderName} proposes a class swap.\n\nYou give: ${swapTargetSlot}\nThey give: ${swapMyClass.target_dept}-${swapMyClass.target_year}-${swapMyClass.target_section} (${swapMyClass.slot_id})\n\nKindly respond at your earliest convenience.`,
              { type: 'SWAP_REQUEST' },
              'SWAP_REQUEST', // Category ID
              logoUrl // Add Logo
          );
      }
      
      // Success Animation & Redirect
      showFeedback('success', 'Request Sent!', 'Redirecting home...');
      setTimeout(() => {
          setFeedback(prev => ({ ...prev, visible: false }));
          navigation.navigate('Home');
      }, 2000);
      
    } catch (error: any) {
      showFeedback('error', 'Swap Failed', error.message || 'Failed to send swap request');
    }
  };

  // Handle swap class selection
  const handleSwapClassSelect = (slot: TimetableSlot) => {
    if (swapMyClass?.id === slot.id) {
      setSwapMyClass(null);
      setSameClassFaculties([]);
      setSwapTargetFaculty(null);
      setSwapTargetSlot(null);
    } else {
      setSwapMyClass(slot);
      setSwapTargetFaculty(null);
      setSwapTargetSlot(null);
      loadSameClassFaculties(slot);
    }
  };

  // Handle swap faculty selection
  const handleSwapFacultySelect = (faculty: any) => { // Type as any or SwapCandidate
    if (swapTargetFaculty?.id === faculty.id) {
      setSwapTargetFaculty(null);
      setSwapTargetSlot(null);
    } else {
      setSwapTargetFaculty(faculty);
      // Auto-select their slot since we know it matches
      if (faculty.target_slot?.slot_id) {
          setSwapTargetSlot(faculty.target_slot.slot_id);
      }
    }
  };

  // Render mode tabs
  const renderTabs = () => (
    <View style={styles.tabContainer}>
      <TouchableOpacity 
        style={[styles.tab, mode === 'substitute' && styles.activeTab]}
        onPress={() => setMode('substitute')}
      >
        <Text style={[styles.tabText, mode === 'substitute' && styles.activeTabText]}>
          Substitute
        </Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.tab, mode === 'swap' && styles.activeTab]}
        onPress={() => setMode('swap')}
      >
        <Text style={[styles.tabText, mode === 'swap' && styles.activeTabText]}>
          Swap
        </Text>
      </TouchableOpacity>
    </View>
  );

  // Render feedback modal
  const renderFeedbackModal = () => (
    <Modal visible={feedback.visible} transparent animationType="none">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={{ 
                opacity: fadeAnim, 
                transform: [{ scale: scaleAnim }],
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                width: scale(250), padding: scale(24), borderRadius: moderateScale(24),
                alignItems: 'center', justifyContent: 'center',
                shadowColor: "#000", shadowOffset: { width: 0, height: verticalScale(10) }, shadowOpacity: 0.3, shadowRadius: moderateScale(20), elevation: 10
            }}>
                <View style={{ 
                    width: scale(64), height: scale(64), borderRadius: moderateScale(32), 
                    backgroundColor: feedback.type === 'success' ? '#22C55E' : feedback.type === 'error' ? '#EF4444' : '#F59E0B', 
                    alignItems: 'center', justifyContent: 'center', marginBottom: verticalScale(16) 
                }}>
                    <Ionicons 
                        name={feedback.type === 'success' ? "checkmark" : feedback.type === 'error' ? "alert" : "warning"} 
                        size={normalizeFont(32)} color="#FFF" 
                    />
                </View>
                <Text style={{ fontSize: normalizeFont(18), fontWeight: '600', color: isDark ? '#FFF' : '#000', marginBottom: verticalScale(8), textAlign: 'center' }}>
                    {feedback.message}
                </Text>
                {feedback.subMessage && (
                    <Text style={{ fontSize: normalizeFont(14), color: isDark ? '#94A3B8' : '#64748B', textAlign: 'center' }}>
                        {feedback.subMessage}
                    </Text>
                )}
            </Animated.View>
        </View>
    </Modal>
  );

  // Render class card - Premium Zen styling
  const renderClassCard = (slot: TimetableSlot, isSelected: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={slot.id}
      style={[styles.classCard, { 
        backgroundColor: isSelected ? 'rgba(61, 220, 151, 0.15)' : colors.surface,
        borderColor: isSelected ? colors.accent : colors.cardBorder,
        borderWidth: isSelected ? 1.5 : 1,
        shadowColor: isSelected ? colors.accent : '#000',
        shadowOffset: { width: 0, height: verticalScale(4) },
        shadowOpacity: isSelected ? 0.3 : 0.2,
        shadowRadius: moderateScale(8),
        elevation: isSelected ? 8 : 4,
      }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={isSelected ? [colors.accent, colors.tealLight] : [colors.teal, colors.tealDark]}
        style={styles.classStrip}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      <View style={styles.classContent}>
        <View style={styles.classHeader}>
          <View style={styles.classInfo}>
            <Text style={[styles.className, { color: colors.textPrimary }]} numberOfLines={1}>
              {slot.subject?.name || 'Unknown Subject'}
            </Text>
            <Text style={[styles.classMeta, { color: colors.textSecondary }]}>
              {slot.target_dept}-{slot.target_year}-{slot.target_section}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.classTime, { color: isSelected ? colors.accent : colors.textMuted }]}>
              {slot.slot_id?.toUpperCase()}
            </Text>
            <Text style={{ fontSize: normalizeFont(11), color: colors.textMuted }}>
              {slot.start_time}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  // Render faculty item - Premium Zen styling
  const renderFacultyItem = (faculty: Faculty, isSelected: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={faculty.id}
      style={[styles.facultyItem, { 
        backgroundColor: isSelected ? 'rgba(61, 220, 151, 0.15)' : colors.surface,
        borderColor: isSelected ? colors.accent : colors.cardBorder,
        borderWidth: isSelected ? 1.5 : 1,
        shadowColor: isSelected ? colors.accent : '#000',
        shadowOffset: { width: 0, height: verticalScale(3) },
        shadowOpacity: isSelected ? 0.25 : 0.15,
        shadowRadius: moderateScale(6),
        elevation: isSelected ? 6 : 3,
      }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={isSelected ? [colors.accent, colors.tealLight] : [colors.tealLight, colors.teal]}
        style={styles.facultyAvatar}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.facultyInitial}>
          {faculty.full_name?.charAt(0)?.toUpperCase() || '?'}
        </Text>
      </LinearGradient>
      <View style={styles.facultyInfo}>
        <Text style={[styles.facultyName, { color: colors.textPrimary }]}>
          {faculty.full_name}
        </Text>
        <Text style={[styles.facultyDept, { color: colors.textSecondary }]}>
          {faculty.dept || 'Faculty'}
        </Text>
        {/* Swap Slot Info */}
        {(faculty as any).target_slot && (
           <View style={{ marginTop: verticalScale(6), flexDirection: 'row', gap: scale(8), alignItems: 'center' }}>
              <View style={{ backgroundColor: isSelected ? '#FFF' : colors.accent + '20', paddingHorizontal: scale(8), paddingVertical: verticalScale(2), borderRadius: moderateScale(6) }}>
                  <Text style={{ color: isSelected ? colors.accent : colors.accent, fontSize: normalizeFont(11), fontWeight: '700' }}>
                      {(faculty as any).target_slot.slot_id?.toUpperCase()}
                  </Text>
              </View>
              <Text style={{ color: isSelected ? 'rgba(255,255,255,0.9)' : colors.textMuted, fontSize: normalizeFont(11), fontWeight: '500' }}>
                 {(faculty as any).target_slot.target_dept}-{(faculty as any).target_slot.target_year}-{(faculty as any).target_slot.target_section} • {(faculty as any).target_slot.start_time?.slice(0, 5)}
              </Text>
           </View>
        )}
      </View>
      {isSelected && (
        <Ionicons name="checkmark-circle" size={normalizeFont(22)} color={colors.accent} />
      )}
    </TouchableOpacity>
  );

  // Render substitute mode
  const renderSubstituteMode = () => (
    <>
      {/* Select Class */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          {isShowingTomorrow ? "Tomorrow's Classes" : "Select Your Class"}
        </Text>
        {isShowingTomorrow && (
          <View style={{ 
            backgroundColor: colors.accent + '20', 
            padding: scale(8), 
            borderRadius: moderateScale(8), 
            marginBottom: verticalScale(12) 
          }}>
            <Text style={{ color: colors.accent, fontSize: normalizeFont(12), textAlign: 'center' }}>
              Today's classes are done • Showing tomorrow's schedule
            </Text>
          </View>
        )}
        {myClasses.length > 0 ? (
          myClasses.map(slot => renderClassCard(
            slot, 
            selectedClass?.id === slot.id,
            () => setSelectedClass(selectedClass?.id === slot.id ? null : slot)
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>📚</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Classes</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {isShowingTomorrow ? 'No classes scheduled for tomorrow' : 'All your classes for today are completed'}
            </Text>
          </View>
        )}
      </View>
      
      {/* Select Faculty (show all dept faculties + search) */}
      {selectedClass && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            Select Substitute Faculty ({userDept})
          </Text>
          
          {/* Search */}
          <View style={styles.searchContainer}>
            <View style={[styles.searchBox, { 
              backgroundColor: colors.inputBg,
              borderColor: colors.inputBorder,
            }]}>
              <Ionicons name="search" size={20} color={colors.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: colors.textPrimary }]}
                placeholder="Search faculty..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>
          
          {/* Faculty List - show all, filtered by search */}
          {filteredFaculty.map(f => renderFacultyItem(
            f,
            selectedFaculty?.id === f.id,
            () => setSelectedFaculty(selectedFaculty?.id === f.id ? null : f)
          ))}
          
          {filteredFaculty.length === 0 && (
            <Text style={[styles.emptySubtitle, { color: colors.textMuted, textAlign: 'center', marginTop: 20 }]}>
              No faculty found in {userDept}
            </Text>
          )}
          
          {/* Notes & Send Button */}
          {selectedFaculty && (
            <View style={{ marginTop: verticalScale(16) }}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginBottom: verticalScale(8) }]}>
                Add Note (Optional)
              </Text>
              
              {/* Quick suggestion chips */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: verticalScale(10), gap: scale(8) }}>
                {['Personal Leave', 'Medical Appointment', 'Official Meeting'].map((suggestion) => (
                  <TouchableOpacity
                    key={suggestion}
                    style={{
                      paddingHorizontal: scale(12),
                      paddingVertical: verticalScale(6),
                      borderRadius: moderateScale(16),
                      backgroundColor: substituteNote === suggestion ? colors.accent : colors.inputBg,
                      borderWidth: 1,
                      borderColor: substituteNote === suggestion ? colors.accent : colors.inputBorder,
                    }}
                    onPress={() => setSubstituteNote(substituteNote === suggestion ? '' : suggestion)}
                  >
                    <Text style={{ 
                      fontSize: normalizeFont(12), 
                      color: substituteNote === suggestion ? '#FFF' : colors.textSecondary 
                    }}>
                      {suggestion}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <TextInput
                style={[styles.searchBox, { 
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                  borderWidth: 1,
                  color: colors.textPrimary,
                  padding: scale(12),
                  borderRadius: moderateScale(12),
                  minHeight: verticalScale(60),
                  textAlignVertical: 'top',
                }]}
                placeholder="Or type a custom reason..."
                placeholderTextColor={colors.textMuted}
                value={substituteNote}
                onChangeText={setSubstituteNote}
                multiline
                numberOfLines={2}
              />
              
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.accent, marginTop: verticalScale(16) }]}
                onPress={sendSubstituteRequest}
              >
                <Ionicons name="send" size={normalizeFont(20)} color="#FFF" />
                <Text style={styles.actionBtnText}>Send Substitute Request</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </>
  );

  // Render swap mode
  const renderSwapMode = () => (
    <>
      {/* Step 1: Select My Class */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          {isShowingTomorrow ? "1. Tomorrow's Classes" : "1. Select Your Class"}
        </Text>
        {isShowingTomorrow && (
          <View style={{ 
            backgroundColor: colors.accent + '20', 
            padding: scale(8), 
            borderRadius: moderateScale(8), 
            marginBottom: verticalScale(12) 
          }}>
            <Text style={{ color: colors.accent, fontSize: normalizeFont(12), textAlign: 'center' }}>
              Today's classes are done • Planning for tomorrow
            </Text>
          </View>
        )}
        {myClasses.length > 0 ? (
          myClasses.map(slot => renderClassCard(
            slot,
            swapMyClass?.id === slot.id,
            () => handleSwapClassSelect(slot)
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>📚</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Classes</Text>
          </View>
        )}
      </View>
      
      {/* Step 2: Select Faculty (only those teaching same class) */}
      {swapMyClass && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            2. Select Faculty (Same Class)
          </Text>
          
          {/* Search */}
          <View style={styles.searchContainer}>
            <View style={[styles.searchBox, { 
              backgroundColor: colors.inputBg,
              borderColor: colors.inputBorder,
            }]}>
              <Ionicons name="search" size={20} color={colors.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: colors.textPrimary }]}
                placeholder="Search faculty..."
                placeholderTextColor={colors.textMuted}
                value={swapSearchQuery}
                onChangeText={setSwapSearchQuery}
              />
            </View>
          </View>
          
          {filteredSwapFaculty.map(f => renderFacultyItem(
            f,
            swapTargetFaculty?.id === f.id,
            () => handleSwapFacultySelect(f)
          ))}
          
          {sameClassFaculties.length === 0 && (
            <Text style={[styles.emptySubtitle, { color: colors.textMuted, textAlign: 'center', marginTop: verticalScale(20) }]}>
              No other faculty teaches this class
            </Text>
          )}

          {/* Notes & Send Button (Shown immediately after selecting faculty) */}
          {swapTargetFaculty && swapTargetSlot && (
            <View style={{ marginTop: verticalScale(24), borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingTop: verticalScale(16) }}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginBottom: verticalScale(8) }]}>
                Add Note (Optional)
              </Text>
              
              {/* Quick suggestion chips */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: verticalScale(10), gap: scale(8) }}>
                {['Schedule Conflict', 'Personal Commitment', 'Travel Requirement'].map((suggestion) => (
                  <TouchableOpacity
                    key={suggestion}
                    style={{
                      paddingHorizontal: scale(12),
                      paddingVertical: verticalScale(6),
                      borderRadius: moderateScale(16),
                      backgroundColor: swapNote === suggestion ? colors.accent : colors.inputBg,
                      borderWidth: 1,
                      borderColor: swapNote === suggestion ? colors.accent : colors.inputBorder,
                    }}
                    onPress={() => setSwapNote(swapNote === suggestion ? '' : suggestion)}
                  >
                    <Text style={{ 
                      fontSize: normalizeFont(12), 
                      color: swapNote === suggestion ? '#FFF' : colors.textSecondary 
                    }}>
                      {suggestion}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <TextInput
                style={[styles.searchBox, { 
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                  borderWidth: 1,
                  color: colors.textPrimary,
                  padding: scale(12),
                  borderRadius: moderateScale(12),
                  minHeight: verticalScale(60),
                  textAlignVertical: 'top',
                }]}
                placeholder="Or type a custom reason..."
                placeholderTextColor={colors.textMuted}
                value={swapNote}
                onChangeText={setSwapNote}
                multiline
                numberOfLines={2}
              />
              
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.accent, marginTop: verticalScale(16) }]}
                onPress={sendSwapRequest}
              >
                <Ionicons name="swap-horizontal" size={normalizeFont(20)} color="#FFF" />
                <Text style={styles.actionBtnText}>Send Swap Request</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

    </>
  );

  // Check if can send request
  const canSendSubstitute = selectedClass && selectedFaculty;
  const canSendSwap = swapMyClass && swapTargetFaculty && swapTargetSlot;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={['#0D4A4A', '#1A6B6B', '#0F3D3D']}
        style={[styles.headerGradient, { paddingTop: insets.top }]}
      >
        <View style={styles.titleRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={normalizeFont(24)} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: scale(12) }}>
            <Text style={styles.pageTitle}>Swap & Sub</Text>
            <Text style={styles.subtitle}>Manage class handoffs</Text>
          </View>
          
          {/* History Icon Button */}
          <TouchableOpacity
            style={{
                width: scale(40),
                height: scale(40),
                borderRadius: moderateScale(20),
                backgroundColor: 'rgba(255,255,255,0.1)',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: scale(8)
            }}
            onPress={() => navigation.navigate('SwapHistory')}
          >
            <Ionicons name="time-outline" size={normalizeFont(24)} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        
        {renderTabs()}
      </LinearGradient>
      
      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.teal} />
        }
      >
        {renderFeedbackModal()}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Loading...
            </Text>
          </View>
        ) : mode === 'substitute' ? (
          renderSubstituteMode()
        ) : (
          renderSwapMode()
        )}
        
        {/* Extra padding for dock */}
        <View style={{ height: verticalScale(80) }} />
      </ScrollView>
    </View>
  );
};

export default SwapScreen;
