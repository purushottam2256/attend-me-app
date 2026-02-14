
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { supabase } from '../../../config/supabase';
import { useColors } from '../../../shared/hooks/useColors';
import createLogger from '../../../utils/logger';

const log = createLogger('LeaveHistory');

interface LeaveRequest {
  id: string;
  reason: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  admin_comment?: string;
  created_at: string;
}

export function LeaveHistory() { // TODO: Add props if needed
  const colors = useColors();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('leaves') // Ensure this table exists in your Supabase schema
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (err) {
      log.error('Failed to fetch leave history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    
    // Auto-refresh on mount
  }, []);

  // Real-time Subscription for Status Updates
  useEffect(() => {
    const subscription = supabase
      .channel('leave_updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'leaves',
          // filter: `user_id=eq.${supabase.auth.user()?.id}`, // RLS typically handles this, but client-side filter good too
        },
        (payload) => {
          log.info('Leave update received:', payload);
          // Update local state immediately
          setRequests(prev => prev.map(r => 
            r.id === payload.new.id ? { ...r, ...payload.new } : r
          ));
        }
      )
      .subscribe();

      return () => {
        subscription.unsubscribe();
      };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return '#10B981'; // Green
      case 'declined': return '#EF4444'; // Red
      case 'pending': return '#F59E0B'; // Amber
      default: return '#6B7280'; // Gray
    }
  };

  const renderItem = ({ item }: { item: LeaveRequest }) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.dateContainer}>
           <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
           <Text style={[styles.dateText, { color: colors.textPrimary }]}>
             {format(new Date(item.start_date), 'dd MMM')} 
             {item.start_date !== item.end_date && ` - ${format(new Date(item.end_date), 'dd MMM')}`}
           </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <Text style={[styles.badgeText, { color: getStatusColor(item.status) }]}>
            {item.status.toUpperCase()}
          </Text>
        </View>
      </View>
      
      <Text style={[styles.reason, { color: colors.textSecondary }]}>{item.reason}</Text>
      
      {item.admin_comment && (
        <View style={[styles.commentBox, { backgroundColor: colors.background }]}>
          <Text style={[styles.commentLabel, { color: colors.textSecondary }]}>Admin Note:</Text>
          <Text style={[styles.commentText, { color: colors.textPrimary }]}>{item.admin_comment}</Text>
        </View>
      )}
    </View>
  );

  if (loading) return <ActivityIndicator style={{ marginTop: 20 }} />;
  if (requests.length === 0) return (
     <View style={styles.emptyContainer}>
        <Text style={{ color: colors.textSecondary }}>No leave requests found.</Text>
     </View>
  );

  return (
    <FlatList
      data={requests}
      renderItem={renderItem}
      keyExtractor={items => items.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchHistory(); }} />}
      contentContainerStyle={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  card: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  dateContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateText: { fontWeight: '600', fontSize: 16 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  reason: { fontSize: 14, marginBottom: 8 },
  commentBox: { padding: 10, borderRadius: 8, marginTop: 8 },
  commentLabel: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  commentText: { fontSize: 14 },
  emptyContainer: { alignItems: 'center', marginTop: 30 }
});
