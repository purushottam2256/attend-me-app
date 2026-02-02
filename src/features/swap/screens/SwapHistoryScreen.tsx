/**
 * SwapHistoryScreen - View sent requests
 * Premium Zen UI
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
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
import { format } from 'date-fns';

type Tab = 'substitute' | 'swap';

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
    accent: '#0D9488', 
    teal: '#0D4A4A',
    tealLight: '#1A6B6B',
  };

  const loadHistory = async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // 1. Fetch Substitute Requests (Created by me)
        const { data: subs, error: subError } = await supabase
            .from('substitutions')
            .select(`
                *,
                substitute_faculty:substitute_faculty_id(full_name),
                subject:subject_id(name, code)
            `)
            .eq('original_faculty_id', user.id)
            .order('requested_at', { ascending: false });

        if (subError) throw subError;
        setSubRequests(subs || []);

        // 2. Fetch Swap Requests (Initiated by me)
        // Note: Assuming 'faculty_a_id' is the initiator
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

  const renderSubItem = (item: any) => (
    <View key={item.id} style={[styles.requestCard, { backgroundColor: colors.surface, borderColor: 'rgba(255,255,255,0.1)' }]}>
        <View style={styles.requestHeader}>
            <View>
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

  const renderSwapItem = (item: any) => (
    <View key={item.id} style={[styles.requestCard, { backgroundColor: colors.surface, borderColor: 'rgba(255,255,255,0.1)' }]}>
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

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.teal} />
        }
      >
        {loading ? (
           <View style={styles.loadingContainer}>
             <ActivityIndicator size="large" color={colors.accent} />
           </View>
        ) : activeTab === 'substitute' ? (
            subRequests.length > 0 ? (
                subRequests.map(renderSubItem)
            ) : (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyEmoji}>📪</Text>
                    <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Requests</Text>
                    <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                        You haven't sent any substitution requests yet.
                    </Text>
                </View>
            )
        ) : (
            swapRequests.length > 0 ? (
                swapRequests.map(renderSwapItem)
            ) : (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyEmoji}>🔄</Text>
                    <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Swaps</Text>
                    <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                        You haven't sent any swap requests yet.
                    </Text>
                </View>
            )
        )}
      </ScrollView>
    </View>
  );
};
