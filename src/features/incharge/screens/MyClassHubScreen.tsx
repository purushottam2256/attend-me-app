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

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';

import { TrafficLightZone, WatchlistCard, TrendsSection } from '../components';
import { useTheme } from '../../../contexts';
import { supabase } from '../../../config/supabase';
import { getClassStudents, getWatchlist, getKeyPeriodAttendance, getClassTrends, getAssignedClass, type StudentAggregate, type PeriodAttendance } from '../services/inchargeService';
import { Colors } from '../../../constants';

interface ClassInfo {
  dept: string;
  year: number;
  section: string;
}

// Helper component for Watchlist Pagination
const WatchlistPager = ({ watchlist, colors, isDark }: { watchlist: StudentAggregate[], colors: any, isDark: boolean }) => {
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
                onMomentumScrollEnd={(ev) => {
                    const x = ev.nativeEvent.contentOffset.x;
                    const index = Math.round(x / containerWidth);
                    setActiveIndex(index);
                }}
            >
                {chunks.map((chunk, pageIndex) => (
                    <View key={pageIndex} style={{ width: containerWidth }}>
                        <View style={{ paddingRight: 4 }}> 
                            {chunk.map((student) => (
                                <WatchlistCard
                                    key={student.student_id}
                                    studentName={student.full_name}
                                    rollNo={student.roll_no}
                                    percentage={student.attendance_percentage}
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
  const [p1, setP1] = useState<PeriodAttendance | null>(null);
  const [p4, setP4] = useState<PeriodAttendance | null>(null);
  const [watchlist, setWatchlist] = useState<StudentAggregate[]>([]);
  const [trendData, setTrendData] = useState<{ day: string; percentage: number }[]>([]);
  const [trendRange, setTrendRange] = useState<'day' | 'week' | 'month'>('week');

  // Load Class Info
  const fetchClassInfo = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const assignment = await getAssignedClass(user.id);
    if (!assignment) console.log('[MyClassHub] No class assignment found.');
    return assignment;
  };

  // Load Data
  const loadData = useCallback(async () => {
    try {
      const info = await fetchClassInfo();
      if (!info) {
        setLoading(false);
        return;
      }
      setClassInfo(info);

      const [periods, students] = await Promise.all([
        getKeyPeriodAttendance(info.dept, info.year, info.section),
        getWatchlist(info.dept, info.year, info.section, 75),
      ]);

      setP1(periods.p1);
      setP4(periods.p4);
      setWatchlist(students.slice(0, 5));
    } catch (error) {
      console.error('[MyClassHub] Error loading data:', error);
    } finally {
      setLoading(false);
    }
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

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // View All Modal Logic
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [allStudents, setAllStudents] = useState<StudentAggregate[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredAllStudents = useMemo(() => {
    if (!searchQuery) return allStudents;
    const lower = searchQuery.toLowerCase();
    return allStudents.filter(s => 
      s.full_name.toLowerCase().includes(lower) || 
      s.roll_no.toLowerCase().includes(lower)
    );
  }, [allStudents, searchQuery]);

  const handleAddPermission = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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

  // Zen Mode Colors (Apple Style)
  const colors = {
    // bg: isDark ? ['#000000', '#1C1C1E'] : ['#FFFFFF', '#F5F5F7'], // We are using Home Gradient now
    textPrimary: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#8E8E93' : '#86868B',
    surface: isDark ? '#082020' : '#FFFFFF', // Deep Green for Dark Mode to match theme
    accent: '#34C759', // Apple Green
    border: isDark ? '#38383A' : '#E5E5EA',
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: isDark ? '#111' : '#F5F5F5' }]}>
        <ActivityIndicator size="large" color={colors.accent} />
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
          <View>
            <Text style={[styles.superTitle, { color: 'rgba(255,255,255,0.8)' }]}>
              {classInfo.dept}-{classInfo.year}{classInfo.section}
            </Text>
            <Text style={[styles.mainTitle, { color: '#FFFFFF' }]}>
              Class Hub
            </Text>
          </View>
          <TouchableOpacity 
            style={[styles.profileBtn, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
            onPress={() => navigation.navigate('Profile' as never)}
          >
             <Ionicons name="person" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* 1. Traffic Light Zone */}
        <TrafficLightZone p1={p1} p4={p4} />

        {/* 2. Trends Graph */}
        <View style={styles.sectionContainer}>
            <View style={[styles.glassCard, { backgroundColor: colors.surface }]}>
                <View style={styles.sectionHeaderRow}>
                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Weekly Trends</Text>
                    
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
                <Ionicons name="add" size={24} color="#34C759" />
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
                <Ionicons name="list" size={24} color="#007AFF" />
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
                  <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '500' }}>See All</Text>
                </TouchableOpacity>
              </View>

              {watchlist.length === 0 ? (
                <View style={[styles.emptyState, { backgroundColor: 'transparent' }]}>
                  <Ionicons name="checkmark-circle" size={48} color={colors.accent} />
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No critical students</Text>
                </View>
              ) : (
                <WatchlistPager watchlist={watchlist} colors={colors} isDark={isDark} />
              )}
          </View>
        </View>

      </ScrollView>

      {/* View All Modal */}
      <Modal visible={showAllStudents} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAllStudents(false)}>
        <View style={[styles.modalContainer, { backgroundColor: isDark ? '#000' : '#F2F2F7' }]}>
           <View style={[styles.modalHeader, { 
               backgroundColor: isDark ? '#1C1C1E' : '#FFF',
               paddingTop: Math.max(insets.top, 20) + 10 // Ensure clearance for notch
           }]}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Class Roster</Text>
                <TouchableOpacity onPress={() => setShowAllStudents(false)} style={styles.closeButton}>
                    <Ionicons name="close-circle" size={30} color={colors.textSecondary} />
                </TouchableOpacity>
           </View>
           
           <View style={[styles.searchContainer, { backgroundColor: isDark ? '#1C1C1E' : '#FFF' }]}>
                <View style={[styles.searchField, { backgroundColor: isDark ? '#2C2C2E' : '#E5E5EA' }]}>
                    <Ionicons name="search" size={20} color={colors.textSecondary} />
                    <TextInput 
                        style={[styles.input, { color: colors.textPrimary }]} 
                        placeholder="Search student" 
                        placeholderTextColor={colors.textSecondary}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
           </View>

           {loadingAll ? (
               <ActivityIndicator style={{marginTop: 50}} color={colors.accent}/>
           ) : (
               <FlatList
                    data={filteredAllStudents}
                    keyExtractor={item => item.student_id}
                    contentContainerStyle={{padding: 16}}
                    renderItem={({item}) => (
                        <View style={[styles.studentRow, { backgroundColor: isDark ? '#1C1C1E' : '#FFF' }]}>
                            <View>
                                <Text style={[styles.studentName, { color: colors.textPrimary }]}>{item.full_name}</Text>
                                <Text style={[styles.studentRoll, { color: colors.textSecondary }]}>{item.roll_no}</Text>
                            </View>
                            <View style={{alignItems: 'flex-end'}}>
                                <Text style={[styles.studentPercent, { color: colors.textPrimary }]}>{Math.round(item.attendance_percentage)}%</Text>
                            </View>
                        </View>
                    )}
               />
           )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 10, fontSize: 16, fontWeight: '500' },
  scrollView: { flex: 1 },

  // Background Orbs
  orb: {
    position: 'absolute',
    borderRadius: 200,
  },
  orb1: {
    width: 300,
    height: 300,
    backgroundColor: 'rgba(61, 220, 151, 0.15)',
    top: -100,
    right: -100,
  },
  orb2: {
    width: 250,
    height: 250,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    bottom: 200,
    left: -80,
  },
  orb3: {
    width: 180,
    height: 180,
    backgroundColor: 'rgba(61, 220, 151, 0.08)',
    bottom: 400,
    right: -40,
  },

  // Header
  header: { paddingHorizontal: 20, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  superTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  mainTitle: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  profileBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', shadowColor: "#000", shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 },

  // Sections
  sectionContainer: { marginTop: 24, paddingHorizontal: 20 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.5 },
  
  // Filters
  filterRow: { flexDirection: 'row', gap: 8 },
  filterPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  filterText: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },

  // Action Cards
  actionGrid: { flexDirection: 'row', gap: 12 },
  actionCard: { flex: 1, padding: 20, borderRadius: 20, shadowColor: "#000", shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2 },
  iconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  actionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  actionSubtitle: { fontSize: 13 },

  // Badge
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 12, fontWeight: '700' },

  // Empty State
  emptyState: { padding: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 16, fontWeight: '500' },

  // Modal
  modalContainer: { flex: 1 },
  modalHeader: { padding: 20, paddingTop: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 24, fontWeight: '700' },
  closeButton: { padding: 4 },
  searchContainer: { paddingHorizontal: 20, paddingBottom: 16 },
  searchField: { flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 12, paddingHorizontal: 12, gap: 10 },
  input: { flex: 1, fontSize: 16 },
  studentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, marginBottom: 8, borderRadius: 12, marginHorizontal: 20 },
  studentName: { fontSize: 16, fontWeight: '600' },
  studentRoll: { fontSize: 13, marginTop: 2 },
  studentPercent: { fontSize: 18, fontWeight: '700' },
  glassCard: {
    padding: 20,
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
    width: '100%'
  },
});

export default MyClassHubScreen;
