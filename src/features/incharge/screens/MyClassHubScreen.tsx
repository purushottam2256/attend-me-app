/**
 * MyClassHubScreen - Main hub for Class Incharge
 * 
 * Features:
 * - Traffic Light Zone (P1 & P4) (Zen Mode Styles)
 * - Weekly Trends (Zen Mode Colors)
 * - Permission Management
 * - Watchlist (Critical Students)
 * - Home Screen Background (Gradient + Orbs)
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  FlatList,
  TextInput,
  Platform,
  Image,
  Animated,
  Easing,

  Linking,
} from 'react-native';
import { safeRefresh } from '../../../utils/safeRefresh';
import { useDeferredLoad } from '../../../hooks/useDeferredLoad';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ZenToast } from '../../../components/ZenToast';
import { PulsingDots } from '../../../components/ui/LoadingAnimation';
import { safeHaptic } from '../../../utils/haptics';
import * as Haptics from 'expo-haptics';



import { TrafficLightZone, WatchlistCard, TrendsSection } from '../components';
import { BellIcon } from '../../../components/BellIcon';
import { useTheme } from '../../../contexts';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';
import { supabase } from '../../../config/supabase';
import { getClassStudents, getWatchlist, getKeyPeriodAttendance, getAllPeriodAttendance, getClassTrends, getAssignedClass, getCurrentSemester, type StudentAggregate, type PeriodAttendance } from '../services/inchargeService';
import { Colors } from '../../../constants';
import { cacheWatchlist, getCachedWatchlist, getCacheAge } from '../../../services/offlineService';
import { useConnectionStatus } from '../../../hooks';


interface ClassInfo {
  dept: string;
  year: number;
  section: string;
}

// Helper component for Watchlist Pagination
const WatchlistPager = ({ watchlist, colors, isDark, onMessage }: { watchlist: StudentAggregate[], colors: any, isDark: boolean, onMessage: (msg: string, type: 'success' | 'error' | 'warning') => void }) => {
    const [containerWidth, setContainerWidth] = useState(0);
    const [activeIndex, setActiveIndex] = useState(0);

    const chunks = useMemo(() => {
        const result = [];
        for (let i = 0; i < watchlist.length; i += 5) {
            result.push(watchlist.slice(i, i + 5));
        }
        return result;
    }, [watchlist]);

    if (chunks.length === 0) return null;

    return (
        <View onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}>
            <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={containerWidth}
                style={{ maxHeight: 350 }}
                onMomentumScrollEnd={(ev) => {
                    const x = ev.nativeEvent.contentOffset.x;
                    const index = Math.round(x / containerWidth);
                    setActiveIndex(index);
                }}
            >
                {chunks.map((chunk, pageIndex) => (
                    <View key={pageIndex} style={{ width: containerWidth }}>
                        <View style={{ paddingRight: 4 }}> 
                            {chunk.map((student: any) => (
                                <WatchlistCard
                                    key={student.student_id}
                                    studentName={student.full_name}
                                    rollNo={student.roll_no}
                                    percentage={student.attendance_percentage}
                                    studentMobile={student.student_mobile}
                                    parentMobile={student.parent_mobile}
                                    onStatusMessage={onMessage}
                                />
                            ))}
                        </View>
                    </View>
                ))}
            </ScrollView>

            {/* Pagination Dots */}
            {chunks.length > 1 && (
                <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 12, marginBottom: 4 }}>
                    {chunks.map((_, i) => (
                        <View
                            key={i}
                            style={{
                                width: 6, height: 6, borderRadius: 3, marginHorizontal: 4,
                                backgroundColor: i === activeIndex ? colors.accent : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)')
                            }}
                        />
                    ))}
                </View>
            )}
        </View>
    );
};

export const MyClassHubScreen: React.FC = () => {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [p1, setP1] = useState<PeriodAttendance | null>(null);
  const [p4, setP4] = useState<PeriodAttendance | null>(null);
  const [watchlist, setWatchlist] = useState<StudentAggregate[]>([]);
  const [trendData, setTrendData] = useState<{ day: string; percentage: number }[]>([]);
  const [trendRange, setTrendRange] = useState<'day' | 'week' | 'month'>('week');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  
  // Toast
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'warning' }>({
      visible: false,
      message: '',
      type: 'success'
  });
  const [isOfflineData, setIsOfflineData] = useState(false);
  
  // Period Stats Modal
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [periodData, setPeriodData] = useState<PeriodAttendance[]>([]);
  const [loadingPeriodStats, setLoadingPeriodStats] = useState(false);

  // View All Students Modal
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Percentage Range Filter State
  const [filterMin, setFilterMin] = useState('');
  const [filterMax, setFilterMax] = useState('');
  const [semester, setSemester] = useState<string | null>(null);

  const [allStudents, setAllStudents] = useState<StudentAggregate[]>([]);


  const filteredAllStudents = useMemo(() => {
      let result = allStudents.length > 0 ? allStudents : watchlist; // Default to watchlist if no "all students" fetch exists yet

      // Search Filter
      if (searchQuery) {
          const query = searchQuery.toLowerCase();
          result = result.filter(s => 
              s.full_name.toLowerCase().includes(query) || 
              s.roll_no.toLowerCase().includes(query)
          );
      }

      // Percentage Range Filter
      if (filterMin) {
          const min = parseFloat(filterMin);
          if (!isNaN(min)) {
              result = result.filter(s => s.attendance_percentage >= min);
          }
      }
      if (filterMax) {
          const max = parseFloat(filterMax);
          if (!isNaN(max)) {
              result = result.filter(s => s.attendance_percentage <= max);
          }
      }

      return result;
  }, [watchlist, searchQuery, filterMin, filterMax]);
  
  const { status: connectionStatus } = useConnectionStatus();
  const connectionStatusRef = useRef(connectionStatus);
  connectionStatusRef.current = connectionStatus;

  // Load Class Info
  const fetchClassInfo = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { assignment: null, user: null };
    const assignment = await getAssignedClass(user.id);
    if (!assignment) console.log('[MyClassHub] No class assignment found.');
    return { assignment, user };
  }, []);

  // Load Data
  const loadData = useCallback(async () => {
    try {
      // OFFLINE FALLBACK: Use cached data if offline
      if (connectionStatusRef.current !== 'online') {
        console.log('[MyClassHub] Offline mode - loading from cache');
        const cachedWatchlistData = await getCachedWatchlist();
        if (cachedWatchlistData && cachedWatchlistData.length > 0) {
          setWatchlist(cachedWatchlistData as StudentAggregate[]);
          setIsOfflineData(true);
        }
        setLoading(false);
        return;
      }
      
      setIsOfflineData(false);
      const result = await fetchClassInfo();
      if (!result?.assignment) {
        setLoading(false);
        return;
      }
      const info = result.assignment;
      const currentUser = result.user;
      setClassInfo(info);
      setError(null);

      // Fetch everything in parallel — profile image + data queries
      const [profileData, periods, students, currentSem] = await Promise.all([
        currentUser ? supabase.from('profiles').select('avatar_url').eq('id', currentUser.id).single() : null,
        getKeyPeriodAttendance(info.dept, info.year, info.section),
        getWatchlist(info.dept, info.year, info.section, 60),
        getCurrentSemester()
      ]);

      if (profileData?.data?.avatar_url) {
        setProfileImage(profileData.data.avatar_url);
      }

      setP1(periods.p1);
      setP4(periods.p4);
      setWatchlist(students);
      if (currentSem) setSemester(currentSem);
      
      // Cache watchlist for offline use (only if we have data)
      if (students.length > 0) {
        const cacheData = students.map(s => ({
          student_id: s.student_id,
          full_name: s.full_name,
          roll_no: s.roll_no,
          attendance_percentage: s.attendance_percentage,
          cachedAt: new Date().toISOString(),
        }));
        await cacheWatchlist(cacheData);
      }
    } catch (error) {
      console.error('[MyClassHub] Error loading data:', error);
      setToast({ visible: true, message: 'Failed to refresh data', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchClassInfo]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning') => {
      setToast({ visible: true, message, type });
  }, []);

  // Fetch trends
  useEffect(() => {
     if (!classInfo) return;
     const fetchTrends = async () => {
         try {
             const data = await getClassTrends(classInfo.dept, classInfo.year, classInfo.section, trendRange);
             setTrendData(data.map(d => ({ day: d.label, percentage: d.value })));
         } catch (e) {
             console.error("Error fetching trends", e);
         }
     };
     fetchTrends();
  }, [classInfo, trendRange]);

  useDeferredLoad(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(() => {
    safeHaptic(Haptics.ImpactFeedbackStyle.Light);
    safeRefresh(setRefreshing, () => loadData());
  }, [loadData]);



  const handleAddPermission = () => {
    safeHaptic(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('Permission' as never);
  };

  const handleViewAll = async () => {
    if (!classInfo) return;
    setShowAllStudents(true);
    if (allStudents.length > 0) return;

    setLoadingAll(true);
    try {
        const students = await getWatchlist(classInfo.dept, classInfo.year, classInfo.section, 101);
        setAllStudents(students);
    } catch (err) {
        console.error("Failed to load all students", err);
    } finally {
        setLoadingAll(false);
    }
  };

  const handleContactSupport = () => {
    safeHaptic(Haptics.ImpactFeedbackStyle.Medium);
    const phoneNumber = "7416994672";
    const message = "Hello, I am a faculty member using the AttendMe app and I need assistance with my class data. My Faculty ID is: " + (classInfo ? `${classInfo?.dept}-${classInfo?.year}${classInfo?.section}` : "Unknown");
    const url = `whatsapp://send?phone=+91${phoneNumber}&text=${encodeURIComponent(message)}`;
    
    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        return Linking.openURL(url);
      } else {
        setToast({ visible: true, message: 'WhatsApp is not installed', type: 'error' });
      }
    }).catch(err => console.error('An error occurred', err));
  };

  const handleViewPeriodStats = async () => {
    if (!classInfo) return;
    setShowPeriodModal(true);
    setLoadingPeriodStats(true);
    try {
        const data = await getAllPeriodAttendance(classInfo.dept, classInfo.year, classInfo.section);
        setPeriodData(data);
    } catch (err) {
        console.error("Failed to load period stats", err);
        setToast({ visible: true, message: 'Failed to load stats', type: 'error' });
    } finally {
        setLoadingPeriodStats(false);
    }
  };

  // Zen Mode Colors (Apple Style)
  const colors = {
    // bg: isDark ? ['#000000', '#1C1C1E'] : ['#FFFFFF', '#F5F5F7'], // We are using Home Gradient now
    textPrimary: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#8E8E93' : '#86868B',
    surface: isDark ? '#082020' : '#FFFFFF', // Deep Green for Dark Mode to match theme
    accent: '#34C759', // Apple Green
    border: isDark ? '#38383A' : '#E5E5EA',
  };

  // Premium Loading Animation
  const spinValue = React.useRef(new Animated.Value(0)).current;
  const pulseValue = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (loading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseValue, { toValue: 1.2, duration: 1000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(pulseValue, { toValue: 1, duration: 1000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) })
        ])
      ).start();
      
      Animated.loop(
        Animated.timing(spinValue, { toValue: 1, duration: 3000, useNativeDriver: true, easing: Easing.linear })
      ).start();
    }
  }, [loading]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: isDark ? '#000' : '#F2F2F7', justifyContent: 'center', alignItems: 'center' }}>
          <PulsingDots size="large" color={colors.accent} />
          <Text style={{ marginTop: verticalScale(20), color: colors.textSecondary, fontSize: normalizeFont(16), fontWeight: '500' }}>Loading Class Data...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: isDark ? '#111' : '#F5F5F5', gap: 12 }]}>
        <Ionicons name="alert-circle" size={normalizeFont(48)} color={colors.textSecondary} />
        <Text style={[styles.loadingText, { color: colors.textPrimary }]}>{error}</Text>
        <TouchableOpacity 
          style={{ paddingHorizontal: scale(20), paddingVertical: verticalScale(10), backgroundColor: colors.accent, borderRadius: moderateScale(8) }}
          onPress={() => {
            setLoading(true);
            setError(null);
            loadData();
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }


  if (!classInfo) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: isDark ? '#111' : '#F5F5F5' }]}>
        <Text style={[styles.loadingText, { color: colors.textPrimary }]}>No Class Assigned</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Premium Gradient Background with Orbs (Home Page Style) */}
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
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Apple Style Large Header */}
        <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(12) }}>
            <TouchableOpacity 
              style={{
                width: scale(44),
                height: scale(44),
                borderRadius: moderateScale(14),
                backgroundColor: 'rgba(255,255,255,0.15)',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onPress={() => navigation.navigate('Home' as never)}
            >
               <Ionicons name="chevron-back" size={normalizeFont(24)} color="#FFFFFF" />
            </TouchableOpacity>
            <View>
              <Text style={[styles.superTitle, { color: 'rgba(255,255,255,0.8)' }]}>
                {classInfo.dept}-{classInfo.year}{classInfo.section}
              </Text>
              <Text style={[styles.mainTitle, { color: '#FFFFFF' }]}>
                Class Hub
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(12) }}>
            <BellIcon />
            <TouchableOpacity 
              style={[
                styles.profileBtn, 
                { 
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  overflow: 'hidden',
                  padding: 0, // Remove padding to let image fill
                  borderWidth: 2,
                  borderColor: isDark ? colors.surface : '#FFFFFF',
                }
              ]}
              onPress={() => navigation.navigate('Profile' as never)}
            >
               {profileImage ? (
                 <Image 
                   source={{ uri: profileImage }} 
                   style={{ width: '100%', height: '100%' }} 
                   resizeMode="cover"
                 />
               ) : (
                 <Ionicons name="person" size={normalizeFont(20)} color="#FFFFFF" style={{ alignSelf: 'center', marginTop: verticalScale(8) }} />
               )}
            </TouchableOpacity>
          </View>
        </View>

        {/* 1. Traffic Light Zone */}
        <View style={{ marginBottom: verticalScale(12) }}>
            <TrafficLightZone p1={p1} p4={p4} />
            <TouchableOpacity 
                style={{ 
                    marginTop: verticalScale(8), 
                    marginHorizontal: scale(20), 
                    paddingVertical: verticalScale(12), 
                    backgroundColor: isDark ? colors.surface : '#FFFFFF',
                    borderRadius: moderateScale(16),
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: scale(6),
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: verticalScale(2) },
                    shadowOpacity: isDark ? 0 : 0.05,
                    shadowRadius: moderateScale(3),
                    elevation: isDark ? 0 : 2
                }}
                onPress={handleViewPeriodStats}
            >
                <Ionicons name="stats-chart" size={normalizeFont(16)} color={colors.accent} />
                <Text style={{ fontSize: normalizeFont(13), fontWeight: '600', color: colors.textPrimary }}>View All Periods Attendance</Text>
            </TouchableOpacity>
        </View>

        {/* 2. Trends Graph */}
        <View style={styles.sectionContainer}>
            <View style={[styles.glassCard, { backgroundColor: colors.surface }]}>
                <View style={styles.sectionHeaderRow}>
                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                        {trendRange.charAt(0).toUpperCase() + trendRange.slice(1)} Trends
                    </Text>
                    
                    {/* Filter Pills */}
                    <View style={styles.filterRow}>
                        {['day', 'week', 'month'].map((range) => (
                            <TouchableOpacity
                                key={range}
                                onPress={() => {
                                    Haptics.selectionAsync();
                                    setTrendRange(range as any);
                                }}
                                style={[
                                    styles.filterPill,
                                    { backgroundColor: trendRange === range ? colors.accent : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') }
                                ]}
                            >
                                <Text style={[
                                    styles.filterText, 
                                    { color: trendRange === range ? '#FFF' : colors.textPrimary }
                                ]}>
                                    {range}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
                {/* Pass a glass style derived props if needed, but for now relying on TrendsSection styling */}
                <TrendsSection data={trendData} />
            </View>
        </View>

        {/* 3. Permissions (Moved Up) */}
        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 12, marginLeft: 4 }]}>
            Quick Actions
          </Text>
          <View style={styles.actionGrid}>
            <TouchableOpacity 
              style={[styles.actionCard, { backgroundColor: colors.surface }]}
              activeOpacity={0.7}
              onPress={handleAddPermission}
            >
              <View style={[styles.iconCircle, { backgroundColor: 'rgba(52, 199, 89, 0.1)' }]}>
                <Ionicons name="add" size={normalizeFont(24)} color="#34C759" />
              </View>
              <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>Grant Leave</Text>
              <Text style={[styles.actionSubtitle, { color: colors.textSecondary }]}>Approve OD/Leave</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionCard, { backgroundColor: colors.surface }]}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('ManagePermissions' as never)}
            >
              <View style={[styles.iconCircle, { backgroundColor: 'rgba(0, 122, 255, 0.1)' }]}>
                <Ionicons name="list" size={normalizeFont(24)} color="#007AFF" />
              </View>
              <Text style={[styles.actionTitle, { color: colors.textPrimary }]}> manage</Text>
              <Text style={[styles.actionSubtitle, { color: colors.textSecondary }]}>View History</Text>
            </TouchableOpacity>


          </View>
        </View>

        {/* 4. Watchlist (At Bottom) */}
        <View style={styles.sectionContainer}>
          <View style={[styles.glassCard, { backgroundColor: colors.surface }]}>
              <View style={styles.sectionHeaderRow}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Watchlist</Text>
                    <View style={[styles.badge, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                        <Text style={[styles.badgeText, { color: colors.textPrimary }]}>{watchlist.length}</Text>
                    </View>
                </View>
                <TouchableOpacity onPress={handleViewAll}>
                  <Text style={{ color: colors.accent, fontSize: normalizeFont(15), fontWeight: '500' }}>See All</Text>
                </TouchableOpacity>
              </View>

              {watchlist.length === 0 ? (
                <View style={[styles.emptyState, { backgroundColor: 'transparent' }]}>
                  <Ionicons name="checkmark-circle" size={normalizeFont(48)} color={colors.accent} />
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No critical students</Text>
                </View>
              ) : (
                <WatchlistPager watchlist={watchlist} colors={colors} isDark={isDark} onMessage={showToast} />
              )}
          </View>
        </View>

      </ScrollView>

      {/* View All Modal - Zen Theme */}
      <Modal visible={showAllStudents} animationType="fade" presentationStyle="overFullScreen" transparent={true} onRequestClose={() => setShowAllStudents(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)' }}>
            <View style={[styles.modalContainer, { 
                marginTop: 60, 
                borderTopLeftRadius: 30, 
                borderTopRightRadius: 30, 
                backgroundColor: isDark ? colors.surface : '#F8FAFC',
                overflow: 'hidden'
            }]}>
               {/* Header */}
               <View style={{ 
                   flexDirection: 'row', 
                   justifyContent: 'space-between', 
                   alignItems: 'center', 
                   padding: 20, 
                   paddingBottom: 10,
                   borderBottomWidth: 1, 
                   borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' 
               }}>
                    <View>
                        <Text style={{ fontSize: 22, fontWeight: '700', color: colors.textPrimary }}>Class Attendance</Text>
                        <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                            {semester ? `Semester ${semester}` : 'Current Semester'} • {filteredAllStudents.length} Students
                        </Text>
                    </View>
                    <TouchableOpacity onPress={() => setShowAllStudents(false)}>
                        <Ionicons name="close-circle" size={32} color={colors.textSecondary} />
                    </TouchableOpacity>
               </View>
               
               {/* Controls: Search + Range Filter */}
               <View style={{ padding: 16, gap: 12 }}>
                    {/* Search */}
                    <View style={{ 
                        flexDirection: 'row', 
                        alignItems: 'center', 
                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', 
                        borderRadius: 12, 
                        paddingHorizontal: 12,
                        height: 48
                    }}>
                        <Ionicons name="search" size={20} color={colors.textSecondary} />
                        <TextInput 
                            style={{ flex: 1, marginLeft: 10, color: colors.textPrimary, fontSize: 16 }} 
                            placeholder="Search student..." 
                            placeholderTextColor={colors.textSecondary}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                    </View>

                    {/* Percentage Range Filter */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(12) }}>
                         <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 13 }}>ATTENDANCE %</Text>
                         <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
                             <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderRadius: 8, paddingHorizontal: 10, height: 40 }}>
                                 <Text style={{ color: colors.textSecondary, marginRight: 4 }}>Min</Text>
                                 <TextInput 
                                     style={{ flex: 1, color: colors.textPrimary, fontWeight: '600' }}
                                     placeholder="0"
                                     placeholderTextColor={colors.textSecondary}
                                     keyboardType="numeric"
                                     maxLength={3}
                                     value={filterMin}
                                     onChangeText={setFilterMin}
                                 />
                             </View>
                             <Text style={{ alignSelf: 'center', color: colors.textSecondary }}>-</Text>
                             <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderRadius: 8, paddingHorizontal: 10, height: 40 }}>
                                 <Text style={{ color: colors.textSecondary, marginRight: 4 }}>Max</Text>
                                 <TextInput 
                                     style={{ flex: 1, color: colors.textPrimary, fontWeight: '600' }}
                                     placeholder="100"
                                     placeholderTextColor={colors.textSecondary}
                                     keyboardType="numeric"
                                     maxLength={3}
                                     value={filterMax}
                                     onChangeText={setFilterMax}
                                 />
                             </View>
                         </View>
                    </View>
               </View>

               {loadingAll ? (
                   <PulsingDots size="medium" color={colors.accent} style={{marginTop: 50}} />
               ) : (
                   <FlatList
                        data={filteredAllStudents}
                        keyExtractor={item => item.student_id}
                        contentContainerStyle={{padding: 16, paddingBottom: 60}}
                        renderItem={({item}) => {
                            // Avatar Initials
                            const initials = item.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                            const avatarColors = ['#FCA5A5', '#FDBA74', '#FCD34D', '#86EFAC', '#6EE7B7', '#93C5FD', '#A5B4FC', '#C4B5FD', '#F9A8D4'];
                            const avatarBg = avatarColors[item.full_name.length % avatarColors.length];
                            
                            // Status Badge
                            let badgeColor = '#10B981'; // Green
                            let badgeText = 'Good';
                            if (item.attendance_percentage < 65) {
                                badgeColor = '#EF4444'; // Red
                                badgeText = 'Critical';
                            } else if (item.attendance_percentage < 75) {
                                 badgeColor = '#F59E0B'; // Amber
                                 badgeText = 'Warning';
                            }

                            return (
                                <View style={{ 
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
                                    borderRadius: moderateScale(16),
                                    marginBottom: 10,
                                    padding: 14,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    shadowColor: "#000",
                                    shadowOffset: {width: 0, height: 1},
                                    shadowOpacity: 0.05,
                                    shadowRadius: 2,
                                    elevation: 1,
                                    borderWidth: 1,
                                    borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
                                }}>
                                    {/* Avatar */}
                                    <View style={{ 
                                        width: 44, height: 44, borderRadius: 22, 
                                        backgroundColor: avatarBg, 
                                        alignItems: 'center', justifyContent: 'center', marginRight: 14 
                                    }}>
                                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>{initials}</Text>
                                    </View>

                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontWeight: '700', fontSize: 16, color: colors.textPrimary, marginBottom: 2 }}>
                                            {item.full_name}
                                        </Text>
                                        <Text style={{ fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: colors.textSecondary }}>
                                            {item.roll_no}
                                        </Text>
                                    </View>

                                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                                         <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: `${badgeColor}20` }}>
                                             <Text style={{ fontSize: 11, fontWeight: '700', color: badgeColor }}>
                                                 {Math.round(item.attendance_percentage)}%
                                             </Text>
                                         </View>
                                         <View style={{ flexDirection: 'row', gap: 10 }}>
                                             {item.student_mobile && (
                                                <TouchableOpacity onPress={() => Linking.openURL(`whatsapp://send?phone=${item.student_mobile}`)}>
                                                    <Ionicons name="logo-whatsapp" size={18} color="#22C55E" />
                                                </TouchableOpacity>
                                             )}
                                             {item.parent_mobile && (
                                                <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.parent_mobile}`)}>
                                                    <Ionicons name="call" size={18} color="#3B82F6" />
                                                </TouchableOpacity>
                                             )}
                                         </View>
                                    </View>
                                </View>
                            );
                        }}
                   />
               )}
            </View>
        </View>
      </Modal>

      {/* Period Stats Modal - Zen Theme */}
      <Modal visible={showPeriodModal} animationType="fade" transparent={true} onRequestClose={() => setShowPeriodModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 }}>
            {/* Glass Container */}
            <View style={{ borderRadius: 24, overflow: 'hidden', backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }}>
                <LinearGradient
                    colors={isDark ? [Colors.premium.gradientStart, Colors.premium.gradientEnd] : ['#FFFFFF', '#F0F0F0']}
                    style={{ padding: 0 }}
                >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}>
                        <Text style={{ fontSize: 18, fontWeight: '700', color: isDark ? '#FFF' : '#000' }}>Period Attendance</Text>
                        <TouchableOpacity onPress={() => setShowPeriodModal(false)}>
                            <Ionicons name="close-circle" size={28} color={isDark ? 'rgba(255,255,255,0.7)' : '#666'} />
                        </TouchableOpacity>
                    </View>

                    {loadingPeriodStats ? (
                        <View style={{ padding: 40, alignItems: 'center' }}>
                            <PulsingDots size="medium" color={Colors.premium.accent} />
                        </View>
                    ) : (
                        <FlatList
                            data={periodData}
                            keyExtractor={item => item.slot_id}
                            contentContainerStyle={{ padding: 16 }}
                            renderItem={({ item }) => (
                                <View style={{ 
                                    flexDirection: 'row', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center', 
                                    paddingVertical: 12,
                                    borderBottomWidth: 1,
                                    borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
                                }}>
                                    <View style={{ width: 60 }}>
                                        <View style={{ 
                                            backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', 
                                            paddingVertical: 6, 
                                            borderRadius: 8,
                                            alignItems: 'center'
                                        }}>
                                            <Text style={{ fontWeight: '700', color: isDark ? '#FFF' : '#333', fontSize: 13 }}>
                                                {item.slot_id.replace(/^p/i, 'P')}
                                            </Text>
                                        </View>
                                    </View>
                                    
                                    <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
                                        <View style={{ alignItems: 'center' }}>
                                            <Text style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.5)' : '#666', marginBottom: 2 }}>Present</Text>
                                            <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.premium.accent }}>{item.present_count}</Text>
                                        </View>
                                        <View style={{ width: 1, height: 24, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} />
                                        <View style={{ alignItems: 'center' }}>
                                            <Text style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.5)' : '#666', marginBottom: 2 }}>Total</Text>
                                            <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? '#FFF' : '#333' }}>{item.total_count}</Text>
                                        </View>
                                    </View>

                                    <View style={{ width: 60, alignItems: 'flex-end' }}>
                                        <Text style={{ fontSize: 16, fontWeight: '700', color: item.percentage < 75 ? Colors.premium.danger : Colors.premium.accent }}>
                                            {item.percentage}%
                                        </Text>
                                    </View>
                                </View>
                            )}
                            ListEmptyComponent={
                                <View style={{ padding: 20, alignItems: 'center' }}>
                                    <Text style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#666' }}>No attendance recorded yet today.</Text>
                                </View>
                            }
                        />
                    )}
                </LinearGradient>
            </View>
        </View>
      </Modal>

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
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: verticalScale(10), fontSize: normalizeFont(16), fontWeight: '500' },
  studentItem: {
      shadowColor: "#000", 
      shadowOffset: { width: 0, height: verticalScale(2) }, 
      shadowOpacity: 0.05, 
      shadowRadius: moderateScale(4), 
      elevation: 2 
  },
  scrollView: { flex: 1 },

  // Background Orbs
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

  // Header
  header: { paddingHorizontal: scale(20), marginBottom: verticalScale(10), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  superTitle: { fontSize: normalizeFont(13), fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: verticalScale(4) },
  mainTitle: { fontSize: normalizeFont(34), fontWeight: '800', letterSpacing: -0.5 },
  profileBtn: { width: scale(40), height: scale(40), borderRadius: moderateScale(20), alignItems: 'center', justifyContent: 'center', shadowColor: "#000", shadowOffset: {width: 0, height: verticalScale(2)}, shadowOpacity: 0.1, shadowRadius: moderateScale(8), elevation: 2 },

  // Sections
  sectionContainer: { marginTop: verticalScale(24), paddingHorizontal: scale(20) },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: verticalScale(16) },
  sectionTitle: { fontSize: normalizeFont(20), fontWeight: '700', letterSpacing: -0.5 },
  
  // Filters
  filterRow: { flexDirection: 'row', gap: scale(8) },
  filterPill: { paddingHorizontal: scale(12), paddingVertical: verticalScale(6), borderRadius: moderateScale(20) },
  filterText: { fontSize: normalizeFont(13), fontWeight: '600', textTransform: 'capitalize' },

  // Action Cards
  actionGrid: { flexDirection: 'row', gap: scale(12) },
  actionCard: { flex: 1, padding: scale(20), borderRadius: moderateScale(20), shadowColor: "#000", shadowOffset: {width: 0, height: verticalScale(4)}, shadowOpacity: 0.05, shadowRadius: moderateScale(12), elevation: 2 },
  iconCircle: { width: scale(44), height: scale(44), borderRadius: moderateScale(22), alignItems: 'center', justifyContent: 'center', marginBottom: verticalScale(12) },
  actionTitle: { fontSize: normalizeFont(16), fontWeight: '600', marginBottom: verticalScale(2) },
  actionSubtitle: { fontSize: normalizeFont(13) },

  // Badge
  badge: { paddingHorizontal: scale(8), paddingVertical: verticalScale(2), borderRadius: moderateScale(8) },
  badgeText: { fontSize: normalizeFont(12), fontWeight: '700' },

  // Empty State
  emptyState: { padding: scale(40), borderRadius: moderateScale(20), alignItems: 'center', justifyContent: 'center', gap: scale(12) },
  emptyText: { fontSize: normalizeFont(16), fontWeight: '500' },

  // Modal
  modalContainer: { flex: 1 },
  modalHeader: { padding: scale(20), paddingTop: verticalScale(20), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: normalizeFont(24), fontWeight: '700' },
  closeButton: { padding: scale(4) },
  searchContainer: { paddingHorizontal: scale(20), paddingBottom: verticalScale(16) },
  searchField: { flexDirection: 'row', alignItems: 'center', height: verticalScale(44), borderRadius: moderateScale(12), paddingHorizontal: scale(12), gap: scale(10) },
  input: { flex: 1, fontSize: normalizeFont(16) },
  studentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: scale(16), marginBottom: verticalScale(8), borderRadius: moderateScale(12), marginHorizontal: scale(20) },
  studentName: { fontSize: normalizeFont(16), fontWeight: '600' },
  studentRoll: { fontSize: normalizeFont(13), marginTop: verticalScale(2) },
  studentPercent: { fontSize: normalizeFont(18), fontWeight: '700' },
  glassCard: {
    padding: scale(20),
    borderRadius: moderateScale(24),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: verticalScale(4) },
    shadowOpacity: 0.05,
    shadowRadius: moderateScale(12),
    elevation: 2,
    width: '100%'
  },
});

export default MyClassHubScreen;
