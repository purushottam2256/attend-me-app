/**
 * SwapHistoryScreen - View sent requests
 * Premium Zen UI with Date Grouping
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet
} from 'react-native';
import { safeRefresh } from '../../../utils/safeRefresh';
import { useDeferredLoad } from '../../../hooks/useDeferredLoad';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../../contexts';
import { supabase } from '../../../config/supabase';
import { swapStyles as styles } from '../styles/SwapScreen.styles';
import { format, isToday, isYesterday, isThisWeek, isThisMonth } from 'date-fns';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';

type Tab = 'substitute' | 'swap';

interface HistoryItem {
  id: string;
  date: string;
  type: 'sub' | 'swap';
  data: any;
}


export const SwapHistoryScreen: React.FC = () => {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  
  const [activeTab, setActiveTab] = useState<Tab>('substitute');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [subRequests, setSubRequests] = useState<any[]>([]);
  const [swapRequests, setSwapRequests] = useState<any[]>([]);

  const colors = {
    background: isDark ? '#0A0A0A' : '#F8FAFC',
    surface: isDark ? '#1E293B' : '#FFFFFF',
    textPrimary: isDark ? '#FFFFFF' : '#0F172A',
    textSecondary: isDark ? '#94A3B8' : '#64748B',
    border: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0',
    accent: '#0D9488', 
    teal: '#0D4A4A',
    tealLight: '#1A6B6B',
    success: '#22C55E',
    danger: '#EF4444',
    warning: '#F59E0B',
    sectionBg: isDark ? '#0F1515' : '#F1F5F9',
  };

  const loadHistory = async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // 1. Fetch Substitute Requests (latest 30)
        const { data: subs, error: subError } = await supabase
            .from('substitutions')
            .select(`
                *,
                substitute_faculty:substitute_faculty_id(full_name),
                subject:subject_id(name, code)
            `)
            .eq('original_faculty_id', user.id)
            .order('date', { ascending: false })
            .limit(30);

        if (subError) throw subError;

        // Batch-fetch time slots for all subs (instead of N+1)
        const subSlotIds = [...new Set((subs || []).map((s: any) => s.slot_id).filter(Boolean))];
        let subTimeMap: Record<string, { start_time: string; end_time: string }> = {};
        if (subSlotIds.length > 0) {
          const { data: slotData } = await supabase
            .from('master_timetables')
            .select('slot_id, start_time, end_time')
            .eq('faculty_id', user.id)
            .in('slot_id', subSlotIds);
          if (slotData) {
            for (const slot of slotData) {
              subTimeMap[slot.slot_id] = { start_time: slot.start_time, end_time: slot.end_time };
            }
          }
        }

        const enrichedSubs = (subs || []).map((item: any) => {
          const slot = subTimeMap[item.slot_id];
          return {
            ...item,
            time_range: slot ? `${slot.start_time.slice(0,5)} - ${slot.end_time.slice(0,5)}` : 'N/A'
          };
        });
        setSubRequests(enrichedSubs);

        // 2. Fetch Swap Requests (latest 30)
        const { data: swaps, error: swapError } = await supabase
            .from('class_swaps')
            .select(`
                *,
                faculty_b:faculty_b_id(full_name)
            `)
            .eq('faculty_a_id', user.id)
            .order('date', { ascending: false })
            .limit(30);

        if (swapError) throw swapError;

        // Batch-fetch class details for all swaps
        const allSlotIds = new Set<string>();
        const allFacultyIds = new Set<string>();
        allFacultyIds.add(user.id);
        (swaps || []).forEach((item: any) => {
          if (item.slot_a_id) allSlotIds.add(item.slot_a_id);
          if (item.slot_b_id) allSlotIds.add(item.slot_b_id);
          if (item.faculty_b_id) allFacultyIds.add(item.faculty_b_id);
        });

        let timetableMap: Record<string, any> = {};
        if (allSlotIds.size > 0 && allFacultyIds.size > 0) {
          const { data: ttData } = await supabase
            .from('master_timetables')
            .select(`
              faculty_id, slot_id,
              target_dept, target_year, target_section,
              start_time, end_time,
              subjects:subject_id(name, code)
            `)
            .in('faculty_id', [...allFacultyIds])
            .in('slot_id', [...allSlotIds]);
          if (ttData) {
            for (const row of ttData) {
              timetableMap[`${row.faculty_id}:${row.slot_id}`] = row;
            }
          }
        }

        const enrichedSwaps = (swaps || []).map((item: any) => ({
          ...item,
          my_class: timetableMap[`${user.id}:${item.slot_a_id}`] || null,
          their_class: timetableMap[`${item.faculty_b_id}:${item.slot_b_id}`] || null,
        }));
        
        setSwapRequests(enrichedSwaps);

    } catch (error) {
        console.error('Error loading history:', error);
    } finally {
        setLoading(false);
    }
  };

  useDeferredLoad(() => { loadHistory(); }, []);

  const onRefresh = useCallback(() => {
    safeRefresh(setRefreshing, () => loadHistory());
  }, []);

  // Group items by date
  const groupedData = useMemo(() => {
    const data = activeTab === 'substitute' ? subRequests : swapRequests;
    const groups: { [key: string]: any[] } = {};

    data.forEach(item => {
      const date = new Date(item.date);
      const key = format(date, 'EEE, MMMM d, yyyy');
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    return Object.keys(groups).map(key => ({
        title: key,
        data: groups[key]
    }));
  }, [subRequests, swapRequests, activeTab]);

  const getStatusColor = (status: string) => {
    switch (status) {
        case 'accepted': return colors.success;
        case 'declined': return colors.danger;
        case 'pending':
        default: return colors.warning;
    }
  };

  const renderStatusBadge = (status: string) => (
    <View style={[styles.requestBadge, { backgroundColor: getStatusColor(status) + '15', borderWidth: 1, borderColor: getStatusColor(status) + '30' }]}>
    <Text style={[styles.requestBadgeText, { color: getStatusColor(status), fontSize: normalizeFont(10), fontWeight: '700' }]}>
            {status?.toUpperCase()}
        </Text>
    </View>
  );



  const renderSubItem = ({ item }: { item: any }) => (
    <View style={[styles.requestCard, { backgroundColor: colors.surface, borderColor: colors.border, marginHorizontal: scale(16), marginBottom: verticalScale(12), padding: 0, overflow: 'hidden' }]}>
        {/* Header */}
        <View style={{ padding: scale(12), borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.accent + '10' }}>
            <View>
                <Text style={{ fontSize: normalizeFont(12), color: colors.accent, fontWeight: '700' }}>SUBSTITUTION REQUEST</Text>
                <Text style={{ fontSize: normalizeFont(10), color: colors.textSecondary }}>{format(new Date(item.date), 'MMMM d, yyyy')}</Text>
            </View>
            {renderStatusBadge(item.status)}
        </View>

        <View style={{ padding: scale(12) }}>
            {/* My Class Info */}
            <View style={{ marginBottom: verticalScale(12) }}>
                <Text style={{ fontSize: normalizeFont(11), color: colors.textSecondary, marginBottom: verticalScale(6), fontWeight: '600' }}>MY CLASS DETAILS</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) }}>
                     <View style={{ backgroundColor: colors.background, padding: scale(6), borderRadius: moderateScale(6), borderWidth: 1, borderColor: colors.border }}>
                         <Text style={{ color: colors.textPrimary, fontSize: normalizeFont(12), fontWeight: '700' }}>
                             {item.target_dept}-{item.target_year}-{item.target_section}
                         </Text>
                     </View>
                     <View style={{ backgroundColor: colors.background, padding: scale(6), borderRadius: moderateScale(6), borderWidth: 1, borderColor: colors.border }}>
                         <Text style={{ color: colors.textPrimary, fontSize: normalizeFont(12) }}>
                             {item.slot_id}
                         </Text>
                     </View>
                     <View style={{ backgroundColor: colors.background, padding: scale(6), borderRadius: moderateScale(6), borderWidth: 1, borderColor: colors.border }}>
                         <Text style={{ color: colors.textPrimary, fontSize: normalizeFont(12) }}>
                             {item.time_range}
                         </Text>
                     </View>
                </View>
                <Text style={{ marginTop: verticalScale(6), color: colors.textPrimary, fontWeight: '500' }}>
                    {item.subject?.name} ({item.subject?.code})
                </Text>
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: colors.border, marginBottom: verticalScale(12), borderStyle: 'dashed', borderWidth: 1, borderColor: colors.border }} />

            {/* To Faculty */}
            <View>
                 <Text style={{ fontSize: normalizeFont(11), color: colors.textSecondary, marginBottom: verticalScale(6), fontWeight: '600' }}>SUBSTITUTE FACULTY</Text>
                 <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                     {/* Avatar Removed */}
                     <Text style={{ fontSize: normalizeFont(14), color: colors.textPrimary, fontWeight: '600' }}>
                         {item.substitute_faculty?.full_name || 'Unknown Faculty'}
                     </Text>
                 </View>
                 {item.notes && (
                     <View style={{ marginTop: verticalScale(8), padding: scale(8), backgroundColor: colors.background, borderRadius: moderateScale(6) }}>
                         <Text style={{ fontSize: normalizeFont(11), color: colors.textSecondary, fontStyle: 'italic' }}>
                             "{item.notes}"
                         </Text>
                     </View>
                 )}
            </View>
        </View>
    </View>
  );

  const renderSwapItem = ({ item }: { item: any }) => (
    <View style={[styles.requestCard, { backgroundColor: colors.surface, borderColor: colors.border, marginHorizontal: scale(16), marginBottom: verticalScale(12), padding: 0, overflow: 'hidden' }]}>
        {/* Header */}
        <View style={{ padding: scale(12), borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.tealLight + '20' }}>
            <View>
                <Text style={{ fontSize: normalizeFont(12), color: colors.tealLight, fontWeight: '700' }}>SWAP REQUEST</Text>
                <Text style={{ fontSize: normalizeFont(10), color: colors.textSecondary }}>{format(new Date(item.date), 'MMMM d, yyyy')}</Text>
            </View>
            {renderStatusBadge(item.status)}
        </View>

        <View style={{ padding: scale(12) }}>
            {/* My Class */}
            <View style={{ flexDirection: 'row' }}>
                <View style={{ width: scale(24), alignItems: 'center', marginRight: scale(8) }}>
                    <View style={{ width: 2, height: '100%', backgroundColor: colors.border, position: 'absolute' }} />
                    <View style={{ width: scale(10), height: scale(10), borderRadius: moderateScale(5), backgroundColor: colors.accent, marginTop: verticalScale(4) }} />
                </View>
                <View style={{ flex: 1, paddingBottom: verticalScale(16) }}>
                    <Text style={{ fontSize: normalizeFont(11), color: colors.textSecondary, fontWeight: '700', marginBottom: verticalScale(4) }}>MY CLASS (YOU)</Text>
                    {item.my_class ? (
                        <>
                             <View style={{ flexDirection: 'row', gap: scale(6), marginBottom: verticalScale(2) }}>
                                 <Text style={{ fontSize: normalizeFont(13), fontWeight: '700', color: colors.textPrimary }}>
                                     {item.my_class.target_dept}-{item.my_class.target_year}-{item.my_class.target_section}
                                 </Text>
                                 <Text style={{ fontSize: normalizeFont(13), color: colors.textSecondary }}>•</Text>
                                 <Text style={{ fontSize: normalizeFont(13), color: colors.textPrimary }}>{item.slot_a_id}</Text>
                             </View>
                             <Text style={{ fontSize: normalizeFont(12), color: colors.textSecondary }}>
                                 {item.my_class.start_time?.slice(0,5)} - {item.my_class.end_time?.slice(0,5)}
                             </Text>
                             <Text style={{ fontSize: normalizeFont(12), color: colors.textPrimary, marginTop: verticalScale(2) }}>
                                 {item.my_class.subjects?.name} ({item.my_class.subjects?.code})
                             </Text>
                        </>
                    ) : (
                        <Text style={{ color: colors.danger, fontSize: normalizeFont(12) }}>Info Unavailable ({item.slot_a_id})</Text>
                    )}
                </View>
            </View>

            {/* Other Class */}
            <View style={{ flexDirection: 'row' }}>
                <View style={{ width: scale(24), alignItems: 'center', marginRight: scale(8) }}>
                    <View style={{ width: scale(10), height: scale(10), borderRadius: moderateScale(5), backgroundColor: colors.warning, marginTop: verticalScale(4) }} />
                </View>
                <View style={{ flex: 1 }}>
                     <Text style={{ fontSize: normalizeFont(11), color: colors.textSecondary, fontWeight: '700', marginBottom: verticalScale(4) }}>
                         SWAPPING WITH: {item.faculty_b?.full_name?.toUpperCase()}
                     </Text>
                     {item.their_class ? (
                        <>
                             <View style={{ flexDirection: 'row', gap: scale(6), marginBottom: verticalScale(2) }}>
                                 <Text style={{ fontSize: normalizeFont(13), fontWeight: '700', color: colors.textPrimary }}>
                                     {item.their_class.target_dept}-{item.their_class.target_year}-{item.their_class.target_section}
                                 </Text>
                                 <Text style={{ fontSize: normalizeFont(13), color: colors.textSecondary }}>•</Text>
                                 <Text style={{ fontSize: normalizeFont(13), color: colors.textPrimary }}>{item.slot_b_id}</Text>
                             </View>
                             <Text style={{ fontSize: normalizeFont(12), color: colors.textSecondary }}>
                                 {item.their_class.start_time?.slice(0,5)} - {item.their_class.end_time?.slice(0,5)}
                             </Text>
                             <Text style={{ fontSize: normalizeFont(12), color: colors.textPrimary, marginTop: verticalScale(2) }}>
                                 {item.their_class.subjects?.name} ({item.their_class.subjects?.code})
                             </Text>
                        </>
                    ) : (
                        <Text style={{ color: colors.danger, fontSize: normalizeFont(12) }}>Info Unavailable ({item.slot_b_id})</Text>
                    )}
                </View>
            </View>

             {item.notes && (
                 <View style={{ marginTop: verticalScale(12), padding: scale(8), backgroundColor: colors.background, borderRadius: moderateScale(6), marginLeft: scale(32) }}>
                     <Text style={{ fontSize: normalizeFont(11), color: colors.textSecondary, fontStyle: 'italic' }}>
                         "{item.notes}"
                     </Text>
                 </View>
             )}
        </View>
    </View>
  );

  const renderSectionHeader = ({ section }: { section: { title: string } }) => (
    <View style={[localStyles.sectionHeader, { backgroundColor: colors.sectionBg }]}>
      <Text style={[localStyles.sectionTitle, { color: colors.textSecondary }]}>
        {section.title}
      </Text>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
        <Text style={styles.emptyEmoji}>{activeTab === 'substitute' ? '📪' : '🔄'}</Text>
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
          No {activeTab === 'substitute' ? 'Requests' : 'Swaps'}
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            You haven't sent any {activeTab === 'substitute' ? 'substitution' : 'swap'} requests yet.
        </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={['#0D4A4A', '#1A6B6B', '#0F3D3D']}
        style={[styles.headerGradient, { paddingTop: insets.top }]}
      >
        <View style={styles.titleRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: scale(12) }}>
            <Text style={styles.pageTitle}>History</Text>
            <Text style={styles.subtitle}>Your sent requests</Text>
          </View>
        </View>
        
        {/* Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'substitute' && styles.activeTab]}
            onPress={() => setActiveTab('substitute')}
          >
            <Text style={[styles.tabText, activeTab === 'substitute' && styles.activeTabText]}>
              Substitutions
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'swap' && styles.activeTab]}
            onPress={() => setActiveTab('swap')}
          >
            <Text style={[styles.tabText, activeTab === 'swap' && styles.activeTabText]}>
              Swaps
            </Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <SectionList
          sections={groupedData}
          keyExtractor={(item) => item.id}
          renderItem={activeTab === 'substitute' ? renderSubItem : renderSwapItem}
          renderSectionHeader={renderSectionHeader}
          ListEmptyComponent={renderEmpty}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingVertical: verticalScale(8), flexGrow: 1 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.teal} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const localStyles = StyleSheet.create({
  sectionHeader: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(8),
    marginTop: verticalScale(8),
  },
  sectionTitle: {
    fontSize: normalizeFont(13),
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
