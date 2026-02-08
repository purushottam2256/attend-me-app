import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { 
  View, Text, StyleSheet, SectionList, RefreshControl, TouchableOpacity, 
  LayoutAnimation, Platform, UIManager, ScrollView, Alert, Animated, Dimensions 
} from 'react-native';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { useNotifications } from '../../../contexts/NotificationContext';
import { supabase } from '../../../config/supabase';
import { NotificationCard } from '../components/NotificationCard';
import { SubstituteRequestCard } from '../components/SubstituteRequestCard';
import { NotificationDetailModal } from '../components/NotificationDetailModal';
import { ConfirmationModal } from '../../../components/ConfirmationModal';
import { ZenToast } from '../../../components/ZenToast';
import { formatDistanceToNow, isToday, isYesterday, format } from 'date-fns';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

// --- ZEN MODE LIST ITEM ---
const ListItem = React.memo(({ 
  item, 
  isSelected, 
  selectionMode, 
  isDark, 
  onToggle, 
  onAction, 
  onPressNotif 
}: any) => {
  // Request/Swap Cards
  if (item.type === 'request' || item.type === 'swap') {
    if (selectionMode) {
      return (
        <TouchableOpacity 
          activeOpacity={0.95}
          onPress={() => onToggle(item.id)}
          style={[styles.selectionWrapper, isSelected && styles.selectedCardWrapper]}
        >
          {isSelected && (
             <View style={styles.requestSelectedBadge}>
                <Ionicons name="checkmark" size={12} color="#0D4A4A" />
             </View>
          )}
          <View style={{ flex: 1, opacity: isSelected ? 1 : 0.9, pointerEvents: 'none' }}>
            <SubstituteRequestCard
              request={item.data}
              type={item.type === 'swap' ? 'swap' : 'substitution'}
              onAccept={() => onAction(item.id, 'accept')}
              onDecline={() => onAction(item.id, 'decline')}
            />
          </View>
        </TouchableOpacity>
      );
    }
    return (
      <Swipeable
        renderRightActions={(_progress, _dragX) => (
          <View style={{ width: 80, justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
            <TouchableOpacity 
              style={{
                width: 60, height: 60, borderRadius: 30, backgroundColor: '#EF4444', 
                justifyContent: 'center', alignItems: 'center',
                shadowColor: '#EF4444', shadowOpacity: 0.3, shadowRadius: 5
              }}
              onPress={() => onAction(item.id, 'delete')}
            >
              <Ionicons name="trash-outline" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}
        overshootRight={false}
      >
        <SubstituteRequestCard
          request={item.data}
          type={item.type === 'swap' ? 'swap' : 'substitution'}
          onAccept={() => onAction(item.id, 'accept')}
          onDecline={() => onAction(item.id, 'decline')}
        />
      </Swipeable>
    );
  }

  // Notification Card - WhatsApp style
  return (
    <NotificationCard
      {...item}
      timestamp={formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
      isDark={isDark}
      icon={item.type === 'request' ? 'swap-horizontal' : item.type === 'alert' ? 'time-outline' : 'notifications-outline'}
      selectionMode={selectionMode}
      isSelected={isSelected}
      onPress={selectionMode ? () => onToggle(item.id) : () => onPressNotif(item)}
      onLongPress={() => {
        if (!selectionMode) {
          onToggle(item.id); // Enter selection mode with this item
        }
      }}
      onDelete={() => onAction(item.id, 'delete')}
    />
  );
});

type FilterType = 'all' | 'requests' | 'accepted' | 'events' | 'system';

export const NotificationScreen = ({ navigation }: any) => {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { refreshNotifications, respondToSubstituteRequest } = useNotifications();
  
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [swaps, setSwaps] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Selection Mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processedIds] = useState<Set<string>>(new Set());

  // Modals
  const [selectedNotification, setSelectedNotification] = useState<any>(null);
  
  // Toast State
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'warning' | 'info' }>({
    visible: false,
    message: '',
    type: 'success'
  });

  // Confirmation Modal
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    isDestructive: boolean;
    onConfirm: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
    isDestructive: false,
    onConfirm: () => {},
  });

  // Animation refs
  const headerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  // Safe Date Helpers
  const safeDate = (dateString: any) => {
    if (!dateString) return new Date();
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? new Date() : date;
  };

  const getRelativeTime = (dateString: any) => {
    try {
      const date = safeDate(dateString);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch (e) {
      return 'Just now';
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    setToast({ visible: true, message, type });
  };

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch Hidden Items first
      let hiddenSet = new Set<string>();
      try {
        const { data: hiddenData } = await supabase
          .from('hidden_items')
          .select('item_id')
          .eq('user_id', user.id);
        
        if (hiddenData) {
          hiddenData.forEach((item: any) => hiddenSet.add(item.item_id));
        }
      } catch (err) {
        console.log('Hidden items error', err);
      }

      // ========================================
      // SUBSTITUTIONS - Proper Targeting
      // ========================================
      // 1. Pending requests: Only show if I am the RECEIVER (substitute_faculty_id)
      // 2. Accepted/Declined: Show if I am the SENDER (original_faculty_id) - to see responses
      const { data: pendingSubsToMe } = await supabase
        .from('substitutions')
        .select(`
          *, 
          original_faculty:profiles!substitutions_original_faculty_id_fkey(full_name), 
          subject:subjects!substitutions_subject_id_fkey(name, code)
        `)
        .eq('substitute_faculty_id', user.id) // Only requests TO me
        .eq('status', 'pending')
        .order('requested_at', { ascending: false });

      const { data: respondedSubsFromMe } = await supabase
        .from('substitutions')
        .select(`
          *, 
          original_faculty:profiles!substitutions_original_faculty_id_fkey(full_name), 
          subject:subjects!substitutions_subject_id_fkey(name, code)
        `)
        .eq('original_faculty_id', user.id) // Requests I sent
        .neq('status', 'pending') // That have been responded to
        .order('requested_at', { ascending: false });

      const allSubs = [
        ...(pendingSubsToMe || []),
        ...(respondedSubsFromMe || [])
      ].filter((r: any) => !hiddenSet.has(r.id));
      
      setRequests(allSubs);

      // ========================================
      // SWAPS - Proper Targeting
      // ========================================
      // 1. Pending swaps: Only show if I am faculty_b (the receiver)
      // 2. Accepted/Declined: Show if I am faculty_a (the sender) - to see responses
      const { data: pendingSwapsToMe } = await supabase
        .from('class_swaps')
        .select(`
          *, 
          faculty_a:profiles!class_swaps_faculty_a_id_fkey(full_name), 
          faculty_b:profiles!class_swaps_faculty_b_id_fkey(full_name)
        `)
        .eq('faculty_b_id', user.id) // Only swaps TO me
        .eq('status', 'pending')
        .order('requested_at', { ascending: false });

      const { data: respondedSwapsFromMe } = await supabase
        .from('class_swaps')
        .select(`
          *, 
          faculty_a:profiles!class_swaps_faculty_a_id_fkey(full_name), 
          faculty_b:profiles!class_swaps_faculty_b_id_fkey(full_name)
        `)
        .eq('faculty_a_id', user.id) // Swaps I sent
        .neq('status', 'pending') // That have been responded to
        .order('requested_at', { ascending: false });

      const allSwaps = [
        ...(pendingSwapsToMe || []),
        ...(respondedSwapsFromMe || [])
      ].filter((s: any) => !hiddenSet.has(s.id));

      setSwaps(allSwaps);

      // Fetch Notifications
      const { data: notifData } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (notifData) setNotifications(notifData);
      await refreshNotifications();

    } catch (e: any) {
      console.log(e);
    }
  };

  useEffect(() => { loadData(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
      return newSelected;
    });
  }, []);

  // Auto-disable selection mode when no items selected
  useEffect(() => {
    if (selectedIds.size === 0 && selectionMode) {
      setSelectionMode(false);
    }
  }, [selectedIds.size, selectionMode]);

  const toggleSelectionMode = () => {
    if (selectionMode) {
      setSelectionMode(false);
      setSelectedIds(new Set());
    } else {
      setSelectionMode(true);
    }
  };

  const selectAll = () => {
    const allIds = new Set<string>();
    notifications.forEach(n => allIds.add(n.id));
    requests.forEach(r => allIds.add(r.id));
    swaps.forEach(s => allIds.add(s.id));
    setSelectedIds(allIds);
  };

  const deleteSelected = async () => {
    setConfirmModal({
      visible: true,
      title: 'Delete Selected?',
      message: `Remove ${selectedIds.size} items?`,
      isDestructive: true,
      onConfirm: async () => {
        const idsToRemove = Array.from(selectedIds);
        
        // IMPORTANT: Capture which IDs are requests/swaps BEFORE optimistic update
        const notifIds = idsToRemove.filter(id => notifications.find(n => n.id === id));
        const subIds = idsToRemove.filter(id => requests.find(r => r.id === id));
        const swapIds = idsToRemove.filter(id => swaps.find(s => s.id === id));
        
        setConfirmModal(prev => ({ ...prev, visible: false }));
        
        // Optimistic UI update
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setNotifications(prev => prev.filter(n => !selectedIds.has(n.id)));
        setRequests(prev => prev.filter(r => !selectedIds.has(r.id)));
        setSwaps(prev => prev.filter(s => !selectedIds.has(s.id)));
        
        setSelectedIds(new Set());
        setSelectionMode(false);
        showToast(`${idsToRemove.length} items removed`, 'success');
        
        // Background DB operations - AWAIT to ensure completion
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          
          // Delete notifications (hard delete)
          if (notifIds.length > 0) {
            await supabase.from('notifications').delete().in('id', notifIds);
          }
          
          // Hide substitution requests (soft delete via hidden_items)
          if (subIds.length > 0) {
            const itemsToHide = subIds.map(id => ({
              user_id: user.id,
              item_id: id,
              item_type: 'substitution'
            }));
            const { error } = await supabase.from('hidden_items').upsert(itemsToHide, { 
              onConflict: 'user_id,item_id' 
            });
            if (error) console.log('Hide subs error:', error);
          }
          
          // Hide swap requests (soft delete via hidden_items)
          if (swapIds.length > 0) {
            const itemsToHide = swapIds.map(id => ({
              user_id: user.id,
              item_id: id,
              item_type: 'swap'
            }));
            const { error } = await supabase.from('hidden_items').upsert(itemsToHide, { 
              onConflict: 'user_id,item_id' 
            });
            if (error) console.log('Hide swaps error:', error);
          }
          
          refreshNotifications();
        } catch (err) {
          console.log('Delete error:', err);
        }
      }
    });
  };

  const handleMarkAllRead = async () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id);
    }
    showToast('All marked as read', 'success');
    await refreshNotifications();
  };

  const handleRequestAction = async (id: string, action: 'accept' | 'decline' | 'delete' | 'view') => {
    // Ignore view for now (cards show full details)
    if (action === 'view') return;

    // Handle single item delete (swipe-to-delete)
    if (action === 'delete') {
      const notification = notifications.find(n => n.id === id);
      const request = requests.find(r => r.id === id);
      const swap = swaps.find(s => s.id === id);
      
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      
      if (notification) {
        setNotifications(prev => prev.filter(n => n.id !== id));
        await supabase.from('notifications').delete().eq('id', id);
      } else if (request) {
        setRequests(prev => prev.filter(r => r.id !== id));
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('hidden_items').upsert({ 
            user_id: user.id, item_id: id, item_type: 'substitution' 
          }, { onConflict: 'user_id,item_id' });
        }
      } else if (swap) {
        setSwaps(prev => prev.filter(s => s.id !== id));
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('hidden_items').upsert({ 
            user_id: user.id, item_id: id, item_type: 'swap' 
          }, { onConflict: 'user_id,item_id' });
        }
      }
      showToast('Removed', 'success');
      return;
    }
    
    const request = requests.find(r => r.id === id);
    const swap = swaps.find(s => s.id === id);
    const type = swap ? 'swap' : 'substitution';
    
    // Conflict check for accepts
    if (action === 'accept' && (request || swap)) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const targetDate = request?.date || swap?.date;
          const targetSlot = request?.slot_id || (swap ? swap.slot_a_id : null);
          
          if (targetDate && targetSlot) {
            const { data: conflicts } = await supabase
              .from('attendance_sessions')
              .select('id')
              .eq('faculty_id', user.id)
              .eq('date', targetDate)
              .eq('slot_id', targetSlot);
            
            if (conflicts && conflicts.length > 0) {
              setConfirmModal({
                visible: true,
                title: 'Schedule Conflict',
                message: 'You already have a session for this slot. Continue anyway?',
                isDestructive: false,
                onConfirm: () => {
                  setConfirmModal(prev => ({ ...prev, visible: false }));
                  processAction(id, action, type);
                }
              });
              return;
            }
          }
        }
      } catch (err) {
        console.log('Conflict check failed', err);
      }
    }

    await processAction(id, action, type);
  };

  const processAction = async (id: string, action: 'accept' | 'decline', type: string = 'substitution') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    
    processedIds.add(id);
    if (type === 'swap') {
      setSwaps(prev => prev.filter(r => r.id !== id));
    } else {
      setRequests(prev => prev.filter(r => r.id !== id));
    }
    
    try {
      if (type === 'swap') {
        const status = action === 'accept' ? 'accepted' : 'declined';
        await supabase.from('class_swaps').update({ status }).eq('id', id);
        showToast(`Swap ${status}`, 'success');
      } else {
        const result = await respondToSubstituteRequest(id, action);
        if (result?.message) {
          showToast(result.message, result.type);
        }
      }
    } catch (error) {
      console.error("Action failed:", error);
      processedIds.delete(id);
      showToast("Action failed", "error");
      loadData();
    } finally {
      loadData();
    }
  };

  const handlePressNotification = (item: any) => {
    if (selectionMode) {
      toggleSelection(item.id);
    } else {
      setSelectedNotification(item);
      if (!item.is_read && item.type !== 'request') {
        setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, is_read: true } : n));
        supabase.from('notifications').update({ is_read: true }).eq('id', item.id);
      }
    }
  };

  // Section data with filtering
  const sections = useMemo(() => {
    const subItems = (requests || [])
      .filter(req => !processedIds.has(req.id))
      .map(req => ({
        id: req.id,
        type: 'request',
        status: req.status,
        title: req.original_faculty?.full_name ? `${req.original_faculty.full_name}` : 'Substitute Request',
        // Professional Message
        body: `${req.original_faculty?.full_name || 'Faculty'} requests you to cover ${req.subject?.code || 'their class'}.`,
        timestamp: req.requested_at || req.created_at || new Date().toISOString(),
        isRead: req.status !== 'pending',
        data: req,
      }));

    const swapItems = (swaps || [])
      .filter(s => !processedIds.has(s.id))
      .map(s => ({
        id: s.id,
        type: 'swap',
        status: s.status,
        title: s.faculty_a?.full_name || 'Swap Request',
        // Professional Message
        body: `${s.faculty_a?.full_name || 'Faculty'} requests a class swap for ${s.slot_a_id?.split('_')[1] || 'Slot A'}.`,
        timestamp: s.requested_at || s.created_at || new Date().toISOString(),
        isRead: s.status !== 'pending',
        data: s,
      }));

    const notifItems = (notifications || [])
      .filter(n => n.type !== 'substitute_request' && n.type !== 'swap_request') // Remove duplicates that are already in 'requests'/'swaps'
      .map(n => ({
      id: n.id,
      type: n.type === 'class_reminder' ? 'alert' : 'info',
      status: n.data?.status || null,
      title: n.title,
      body: n.body,
      timestamp: n.created_at,
      isRead: n.is_read,
      data: n,
    }));

    let allItems = [...subItems, ...swapItems, ...notifItems];

    // Apply filters
    if (activeFilter === 'requests') {
      allItems = allItems.filter(i => i.type === 'request' || i.type === 'swap');
    } else if (activeFilter === 'accepted') {
      allItems = allItems.filter(i => i.status === 'accepted');
    } else if (activeFilter === 'events') {
      allItems = allItems.filter(i => i.type === 'alert');
    } else if (activeFilter === 'system') {
      allItems = allItems.filter(i => i.type === 'info');
    }

    // Sort by timestamp
    allItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Group by Date - Enhanced
    const groups: { [key: string]: any[] } = {};

    allItems.forEach(item => {
      const date = safeDate(item.timestamp);
      let key = 'Earlier';
      
      if (isToday(date)) {
        key = 'Today';
      } else if (isYesterday(date)) {
        key = 'Yesterday';
      } else {
        key = format(date, 'MMM d, yyyy');
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
    });

    const result = Object.keys(groups).map(key => ({
      title: key,
      data: groups[key]
    }));

    // Sort sections: Today, Yesterday, then date descending
    result.sort((a, b) => {
      if (a.title === 'Today') return -1;
      if (b.title === 'Today') return 1;
      if (a.title === 'Yesterday') return -1;
      if (b.title === 'Yesterday') return 1;
      
      // Parse dates for sorting other keys
      const dateA = new Date(a.title); // 'MMM d, yyyy' works with Date constructor usually
      const dateB = new Date(b.title);
      
      // Fallback for sorting if date parsing fails (though unlikely with format)
      if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0;

      return dateB.getTime() - dateA.getTime();
    });

    return result;
  }, [notifications, requests, swaps, activeFilter]);

  // Counts
  const counts = useMemo(() => {
    const unreadNotifs = notifications.filter(n => !n.is_read).length;
    const pendingReqs = requests.filter(r => r.status === 'pending').length;
    const pendingSwaps = swaps.filter(s => s.status === 'pending').length;
    return {
      all: unreadNotifs + pendingReqs + pendingSwaps,
      requests: pendingReqs + pendingSwaps,
      accepted: requests.filter(r => r.status === 'accepted').length + swaps.filter(s => s.status === 'accepted').length,
      events: notifications.filter(n => n.type === 'class_reminder' && !n.is_read).length,
      system: notifications.filter(n => n.type !== 'class_reminder' && n.type !== 'substitute_request' && n.type !== 'swap_request').length,
    };
  }, [notifications, requests, swaps]);

  // ZEN COLORS
  const zenColors = {
    bg: isDark ? '#050D0D' : '#F8FAFA',
    surface: isDark ? '#0A1A1A' : '#FFFFFF',
    accent: isDark ? '#3DDC97' : '#0D4A4A',
    textPrimary: isDark ? '#F7FAFC' : '#0F172A',
    textSecondary: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(15, 23, 42, 0.5)',
    border: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  };

  // Filter Pill Component - Frosted Glass on Teal Gradient
  const FilterPill = ({ id, label, count }: { id: FilterType; label: string; count: number }) => {
    const isActive = activeFilter === id;
    return (
      <TouchableOpacity
        onPress={() => setActiveFilter(id)}
        style={[
          styles.filterPill,
          {
            backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
            borderColor: isActive ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)',
          }
        ]}
        activeOpacity={0.8}
      >
        <Text style={[
          styles.filterText,
          { color: '#FFFFFF', opacity: isActive ? 1 : 0.8 }
        ]}>
          {label}
        </Text>
        {count > 0 && (
          <View style={[
            styles.filterBadge,
            { backgroundColor: isActive ? '#3DDC97' : 'rgba(255,255,255,0.2)' }
          ]}>
            <Text style={[
              styles.filterBadgeText,
              { color: isActive ? '#0D4A4A' : '#FFFFFF' }
            ]}>
              {count}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Empty State - Teal Theme
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIcon, { backgroundColor: 'rgba(13, 74, 74, 0.1)' }]}>
        <Ionicons name="notifications-off-outline" size={48} color="#0D4A4A" />
      </View>
      <Text style={[styles.emptyTitle, { color: isDark ? '#FFF' : '#0F172A' }]}>All caught up</Text>
      <Text style={[styles.emptySubtitle, { color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(15, 23, 42, 0.5)' }]}>
        No notifications right now. Check back later.
      </Text>
    </View>
  );

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: isDark ? '#0A0F0F' : '#F5F5F5' }]}>
      {/* Teal Gradient Header - Matching History Screen */}
      <LinearGradient
        colors={['#0D4A4A', '#1A6B6B', '#0F3D3D']}
        style={[styles.headerGradient, { paddingTop: insets.top }]}
      >
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => {
                if (selectionMode) {
                  setSelectionMode(false);
                  setSelectedIds(new Set());
                } else {
                  navigation.goBack();
                }
              }}
              activeOpacity={0.8}
            >
              <Ionicons 
                name={selectionMode ? "close" : "chevron-back"} 
                size={24} 
                color="#FFFFFF" 
              />
            </TouchableOpacity>
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.headerTitle}>
                {selectionMode ? `${selectedIds.size} Selected` : 'Notifications'}
              </Text>
              {!selectionMode && counts.all > 0 && (
                <Text style={styles.headerSubtitle}>
                  {counts.all} unread
                </Text>
              )}
            </View>
          </View>

          <View style={styles.headerActions}>
            {selectionMode ? (
              <>
                <TouchableOpacity 
                  onPress={selectAll} 
                  style={styles.headerBtn}
                >
                  <Ionicons name="checkmark-done" size={22} color="#FFFFFF" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity 
                  onPress={handleMarkAllRead} 
                  style={styles.headerBtn}
                >
                  <Ionicons name="checkmark-done" size={22} color="#FFFFFF" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Filters inside gradient header */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
          style={styles.filterContainer}
        >
          <FilterPill id="all" label="All" count={counts.all} />
          <FilterPill id="requests" label="Requests" count={counts.requests} />
          <FilterPill id="accepted" label="Accepted" count={counts.accepted} />
          <FilterPill id="events" label="Reminders" count={counts.events} />
          <FilterPill id="system" label="System" count={counts.system} />
        </ScrollView>
        <Text style={{ 
          textAlign: 'center', 
          color: 'rgba(255,255,255,0.6)', 
          fontSize: 10, 
          marginTop: 8,
          marginBottom: 4 
        }}>
         -- Swipe left to delete.
        </Text>
      </LinearGradient>

      {/* Content */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ListItem
            item={item}
            isSelected={selectedIds.has(item.id)}
            selectionMode={selectionMode}
            isDark={isDark}
            onToggle={toggleSelection}
            onAction={handleRequestAction}
            onPressNotif={handlePressNotification}
          />
        )}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: isDark ? '#0A0F0F' : '#F5F5F5' }]}>
            <Text style={[styles.sectionTitle, { color: isDark ? 'rgba(255,255,255,0.5)' : '#0D4A4A' }]}>
              {section.title}
            </Text>
          </View>
        )}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[
          styles.listContent,
          sections.length === 0 && styles.emptyList
        ]}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0D4A4A"
            colors={['#0D4A4A']}
          />
        }
        showsVerticalScrollIndicator={false}
      />



      {/* Toast */}
      <ZenToast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast(prev => ({ ...prev, visible: false }))}
      />

      {/* Modals */}
      <NotificationDetailModal
        visible={!!selectedNotification}
        notification={selectedNotification}
        onClose={() => setSelectedNotification(null)}
        onDelete={() => {
          if (selectedNotification) {
            setNotifications(prev => prev.filter(n => n.id !== selectedNotification.id));
            supabase.from('notifications').delete().eq('id', selectedNotification.id);
            setSelectedNotification(null);
            showToast('Deleted', 'success');
          }
        }}
        isDark={isDark}
      />

      <ConfirmationModal
        visible={confirmModal.visible}
        title={confirmModal.title}
        message={confirmModal.message}
        isDestructive={confirmModal.isDestructive}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, visible: false }))}
        isDark={isDark}
      />

      {/* Floating Delete Button */}
      {selectionMode && selectedIds.size > 0 && (
        <View style={{
          position: 'absolute',
          bottom: insets.bottom + 24,
          left: 20,
          right: 20,
        }}>
          <TouchableOpacity
            onPress={deleteSelected}
            activeOpacity={0.9}
            style={{
              backgroundColor: '#DC2626',
              paddingVertical: 16,
              borderRadius: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>
              Delete ({selectedIds.size})
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerGradient: {
    paddingBottom: 12,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterContainer: {
    maxHeight: 44,
  },
  filterScroll: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    flexDirection: 'row',
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  listContent: {
    paddingTop: 16,
    paddingBottom: 100,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  selectionWrapper: {
    marginBottom: 12,
    marginHorizontal: 16,
    borderRadius: 16,
  },
  selectedCardWrapper: {
    borderWidth: 1.5,
    borderColor: '#3DDC97',
    backgroundColor: 'rgba(61, 220, 151, 0.1)',
  },
  requestSelectedBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#3DDC97',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
