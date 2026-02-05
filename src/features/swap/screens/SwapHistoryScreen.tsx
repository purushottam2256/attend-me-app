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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../../contexts';
import { supabase } from '../../../config/supabase';
import { swapStyles as styles } from '../styles/SwapScreen.styles';
import { format, isToday, isYesterday, isThisWeek, isThisMonth } from 'date-fns';

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
    surface: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
    textPrimary: isDark ? '#FFFFFF' : '#0F172A',
    textSecondary: isDark ? 'rgba(255,255,255,0.7)' : '#64748B',
    sectionBg: isDark ? '#0F1515' : '#F1F5F9',
    accent: '#0D9488', 
    teal: '#0D4A4A',
    tealLight: '#1A6B6B',
  };

  const loadHistory = async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Fetch Substitute Requests (Created by me)
        const { data: subs, error: subError } = await supabase
            .from('substitutions')
            .select(`
                *,
                substitute_faculty:substitute_faculty_id(full_name),
                subject:subject_id(name, code)
            `)
            .eq('original_faculty_id', user.id)
            .order('date', { ascending: false });

        if (subError) throw subError;
        setSubRequests(subs || []);

        // Fetch Swap Requests (Initiated by me)
        const { data: swaps, error: swapError } = await supabase
            .from('class_swaps')
            .select(`
                *,
                faculty_b:faculty_b_id(full_name)
            `)
            .eq('faculty_a_id', user.id)
            .order('date', { ascending: false });

        if (swapError) throw swapError;
        setSwapRequests(swaps || []);

    } catch (error) {
        console.error('Error loading history:', error);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  }, []);

  // Group items by date
  const sections = useMemo(() => {
    const items = activeTab === 'substitute' ? subRequests : swapRequests;
    
    const today: any[] = [];
    const yesterday: any[] = [];
    const thisWeek: any[] = [];
    const thisMonth: any[] = [];
    const older: any[] = [];
    
    items.forEach(item => {
      const itemDate = new Date(item.date);
      if (isToday(itemDate)) {
        today.push(item);
      } else if (isYesterday(itemDate)) {
        yesterday.push(item);
      } else if (isThisWeek(itemDate)) {
        thisWeek.push(item);
      } else if (isThisMonth(itemDate)) {
        thisMonth.push(item);
      } else {
        older.push(item);
      }
    });
    
    const result = [];
    if (today.length > 0) result.push({ title: 'Today', data: today });
    if (yesterday.length > 0) result.push({ title: 'Yesterday', data: yesterday });
    if (thisWeek.length > 0) result.push({ title: 'This Week', data: thisWeek });
    if (thisMonth.length > 0) result.push({ title: 'This Month', data: thisMonth });
    if (older.length > 0) result.push({ title: 'Older', data: older });
    
    return result;
  }, [activeTab, subRequests, swapRequests]);

  const getStatusColor = (status: string) => {
    switch (status) {
        case 'accepted': return '#22C55E';
        case 'declined': return '#EF4444';
        default: return '#F59E0B';
    }
  };

  const renderStatusBadge = (status: string) => (
    <View style={[styles.requestBadge, { backgroundColor: getStatusColor(status) + '20' }]}>
        <Text style={[styles.requestBadgeText, { color: getStatusColor(status) }]}>
            {status}
        </Text>
    </View>
  );

  const renderSubItem = ({ item }: { item: any }) => (
    <View style={[styles.requestCard, { backgroundColor: colors.surface, borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0', marginHorizontal: 16, marginBottom: 8 }]}>
        <View style={styles.requestHeader}>
            <View style={{ flex: 1 }}>
                <Text style={[styles.requestTitle, { color: colors.textPrimary }]}>
                    {item.subject?.name || 'Class'}
                </Text>
                <Text style={[styles.requestMeta, { color: colors.textSecondary }]}>
                    {format(new Date(item.date), 'EEE, MMM d')} • {item.slot_id}
                </Text>
            </View>
            {renderStatusBadge(item.status)}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <Ionicons name="arrow-forward" size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                To: <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{item.substitute_faculty?.full_name || 'Unknown'}</Text>
            </Text>
        </View>
        {item.notes && (
             <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 8, fontStyle: 'italic' }}>
                "{item.notes}"
             </Text>
        )}
    </View>
  );

  const renderSwapItem = ({ item }: { item: any }) => (
    <View style={[styles.requestCard, { backgroundColor: colors.surface, borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0', marginHorizontal: 16, marginBottom: 8 }]}>
        <View style={styles.requestHeader}>
            <View>
                <Text style={[styles.requestTitle, { color: colors.textPrimary }]}>
                    Swap Request
                </Text>
                <Text style={[styles.requestMeta, { color: colors.textSecondary }]}>
                    {format(new Date(item.date), 'EEE, MMM d')}
                </Text>
            </View>
            {renderStatusBadge(item.status)}
        </View>
        
        <View style={{ marginTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '600', width: 60 }}>You:</Text>
                <Text style={{ color: colors.textSecondary }}>{item.slot_a_id}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '600', width: 60 }}>With:</Text>
                <Text style={{ color: colors.textSecondary }}>
                    {item.faculty_b?.full_name} ({item.slot_b_id})
                </Text>
            </View>
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
          <View style={{ flex: 1, marginLeft: 12 }}>
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
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={activeTab === 'substitute' ? renderSubItem : renderSwapItem}
          renderSectionHeader={renderSectionHeader}
          ListEmptyComponent={renderEmpty}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingVertical: 8, flexGrow: 1 }}
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
