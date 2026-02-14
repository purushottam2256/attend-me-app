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
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';
import { useNotifications } from '../../../contexts/NotificationContext';
import { supabase } from '../../../config/supabase';
import { NotificationService } from '../../../services/NotificationService';
import { NotificationRepository } from '../../../services/NotificationRepository'; 
import { NotificationCard } from '../components/NotificationCard';
import { SubstituteRequestCard } from '../components/SubstituteRequestCard';
import { LeaveRequestCard } from '../components/LeaveRequestCard';
import { NotificationSkeleton } from '../../../components/ui/LoadingAnimation'; // Import Skeleton
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
                <Ionicons name="checkmark" size={normalizeFont(12)} color="#0D4A4A" />
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
          <View style={{ width: scale(80), justifyContent: 'center', alignItems: 'center', marginBottom: verticalScale(12) }}>
            <TouchableOpacity 
              style={{
                width: scale(60), height: scale(60), borderRadius: moderateScale(30), backgroundColor: '#EF4444', 
                justifyContent: 'center', alignItems: 'center',
                shadowColor: '#EF4444', shadowOpacity: 0.3, shadowRadius: moderateScale(5)
              }}
              onPress={() => onAction(item.id, 'delete')}
            >
              <Ionicons name="trash-outline" size={normalizeFont(24)} color="#FFF" />
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

  // Leave Cards (New) or Proxy Notifications
  if (item.type === 'leave' || item.type === 'leave_proxy') {
      return (
          <Swipeable
            renderRightActions={(_progress, _dragX) => (
              <View style={{ width: scale(80), justifyContent: 'center', alignItems: 'center', marginBottom: verticalScale(12) }}>
                <TouchableOpacity 
                  style={{
                    width: scale(60), height: scale(60), borderRadius: moderateScale(30), backgroundColor: '#EF4444', 
                    justifyContent: 'center', alignItems: 'center',
                    shadowColor: '#EF4444', shadowOpacity: 0.3, shadowRadius: moderateScale(5)
                  }}
                  onPress={() => onAction(item.id, 'delete')}
                >
                  <Ionicons name="trash-outline" size={normalizeFont(24)} color="#FFF" />
                </TouchableOpacity>
              </View>
            )}
            overshootRight={false}
          >
             <LeaveRequestCard item={item} />
          </Swipeable>
      );
  }

  // Notification Card - WhatsApp style
  return (
    <NotificationCard
      {...item}
      timestamp={formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
      isDark={isDark}
      icon={item.icon || (item.type === 'request' ? 'swap-horizontal' : item.type === 'alert' ? 'time-outline' : 'notifications-outline')}
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

import { getSlotLabel } from '../../../utils/timeUtils';


type FilterType = 'all' | 'requests' | 'accepted' | 'events' | 'management' | 'leaves';

export const NotificationScreen = ({ navigation }: any) => {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { refreshNotifications, respondToSubstituteRequest, markNotificationAsRead, markNotificationsAsRead } = useNotifications();
  
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [swaps, setSwaps] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const NOTIFICATIONS_PER_PAGE = 20;

  // Selection Mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processedIds] = useState<Set<string>>(new Set());
  const viewableItemsRef = useRef<Set<string>>(new Set()); // For auto-read

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

  const loadData = async (pageNum = 0) => {
    try {
      if (pageNum === 0 && !refreshing) setInitialLoading(true);
      if (pageNum > 0) setLoadingMore(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Get Deleted/Hidden IDs (Merge Supabase + Local Cache)
      let hiddenSet = new Set<string>();
      
      // Local cache (Sync)
      try {
          const localDeleted = await NotificationRepository.getDeletedIds();
          localDeleted.forEach(id => hiddenSet.add(id));
      } catch (err) {
          console.log('Local deleted cache error', err);
      }

      // Remote cache (Async)
      if (pageNum === 0) {
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
      }

      // 2. Fetch Requests, Swaps, Leaves (ONLY on first page)
      // LIMIT all to 20 recent items to avoid massive fetches. 
      // Infinite scroll usually drives the 'notifications' list, but users can see all by clearing filters or we can add specific pagination later.
      if (pageNum === 0) {
        const LIMIT = 20;

        // ... Substitutions ...
        const { data: pendingSubsToMe } = await supabase
          .from('substitutions')
          .select(`*, original_faculty:profiles!substitutions_original_faculty_id_fkey(full_name), subject:subjects!substitutions_subject_id_fkey(name, code)`)
          .eq('substitute_faculty_id', user.id)
          .order('requested_at', { ascending: false })
          .limit(LIMIT);

        const { data: respondedSubsFromMe } = await supabase
          .from('substitutions')
          .select(`*, original_faculty:profiles!substitutions_original_faculty_id_fkey(full_name), subject:subjects!substitutions_subject_id_fkey(name, code)`)
          .eq('original_faculty_id', user.id)
          .order('requested_at', { ascending: false })
          .limit(LIMIT);

        const allSubs = [...(pendingSubsToMe || []), ...(respondedSubsFromMe || [])]
          .filter((r: any) => !hiddenSet.has(r.id));
        setRequests(allSubs);

        // ... Swaps ...
        const { data: pendingSwapsToMe } = await supabase
          .from('class_swaps')
          .select(`*, faculty_a:profiles!class_swaps_faculty_a_id_fkey(full_name), faculty_b:profiles!class_swaps_faculty_b_id_fkey(full_name)`)
          .eq('faculty_b_id', user.id)
          .order('requested_at', { ascending: false })
          .limit(LIMIT);

        const { data: respondedSwapsFromMe } = await supabase
          .from('class_swaps')
          .select(`*, faculty_a:profiles!class_swaps_faculty_a_id_fkey(full_name), faculty_b:profiles!class_swaps_faculty_b_id_fkey(full_name)`)
          .eq('faculty_a_id', user.id)
          .order('requested_at', { ascending: false })
          .limit(LIMIT);

        const allSwaps = [...(pendingSwapsToMe || []), ...(respondedSwapsFromMe || [])]
          .filter((s: any) => !hiddenSet.has(s.id));

        // Enrich Swaps
        const enrichedSwaps = await Promise.all(allSwaps.map(async (swap: any) => {
            const { data: slotA } = await supabase.from('master_timetables').select('subjects:subject_id(name, code), target_dept, target_year, target_section, start_time, end_time').eq('faculty_id', swap.faculty_a_id).eq('slot_id', swap.slot_a_id).maybeSingle();
            const { data: slotB } = await supabase.from('master_timetables').select('subjects:subject_id(name, code), target_dept, target_year, target_section, start_time, end_time').eq('faculty_id', swap.faculty_b_id).eq('slot_id', swap.slot_b_id).maybeSingle();
            return { ...swap, slot_a_details: slotA, slot_b_details: slotB };
        }));
        setSwaps(enrichedSwaps);

        // ... Leaves ...
        const { data: leaveData } = await supabase
          .from('leaves')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(LIMIT);
        
        if (leaveData) {
          setLeaves(leaveData.filter((l: any) => !hiddenSet.has(l.id)));
        }
      }

      // 3. Fetch Notifications (Paginated)
      const from = pageNum * NOTIFICATIONS_PER_PAGE;
      const to = from + NOTIFICATIONS_PER_PAGE - 1;

      const { data: notifData } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (notifData) {
        // Filter out locally deleted ones
        const visibleNotifs = notifData.filter((n: any) => !hiddenSet.has(n.id));
        
        if (pageNum === 0) {
          setNotifications(visibleNotifs);
        } else {
          setNotifications(prev => [...prev, ...visibleNotifs]);
        }

        if (notifData.length < NOTIFICATIONS_PER_PAGE) {
            setHasMore(false);
        } else {
            setHasMore(true);
        }
      } else {
        setHasMore(false);
      }

      if (pageNum === 0) await refreshNotifications();

    } catch (e: any) {
      console.log(e);
    } finally {
      setInitialLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(0); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    setPage(0);
    setHasMore(true);
    await loadData(0);
  };

  const onLoadMore = () => {
      if (!hasMore || loadingMore || refreshing) return;
      const nextPage = page + 1;
      setPage(nextPage);
      loadData(nextPage);
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
    leaves.forEach(l => allIds.add(l.id));
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
        setLeaves(prev => prev.filter(l => !selectedIds.has(l.id)));
        
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

          // Hide leave requests (soft delete via hidden_items)
          const leaveIds = idsToRemove.filter(id => leaves.find(l => l.id === id));
          if (leaveIds.length > 0) {
            const itemsToHide = leaveIds.map(id => ({
              user_id: user.id,
              item_id: id,
              item_type: 'leave'
            }));
            const { error } = await supabase.from('hidden_items').upsert(itemsToHide, { 
              onConflict: 'user_id,item_id' 
            });
            if (error) console.log('Hide leaves error:', error);
          }
          
          await NotificationRepository.addDeletedIds(idsToRemove);
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
      } else {
        // Try finding in leaves
        const leave = leaves.find(l => l.id === id);
        if (leave) {
          setLeaves(prev => prev.filter(l => l.id !== id));
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from('hidden_items').upsert({ 
              user_id: user.id, item_id: id, item_type: 'leave' 
            }, { onConflict: 'user_id,item_id' });
          }
        }
      }
      await NotificationRepository.addDeletedId(id);
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
        markNotificationAsRead(item.id);
        setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, is_read: true } : n));
        // Also update backend fire-and-forget
        supabase.from('notifications').update({ is_read: true }).eq('id', item.id);
      }
    }
  };

  // Effect to trigger actual mark read for items in viewableItemsRef
  const handleViewableItemsChanged = useRef(({ viewableItems }: any) => {
      const idsToMark: string[] = [];
      
      viewableItems.forEach((viewable: any) => {
          const item = viewable.item;
          if (item?.data && 
              !item.isRead && 
              item.type !== 'request' && 
              item.type !== 'swap' && 
              item.type !== 'leave' &&
              !viewableItemsRef.current.has(item.id)) {
                  
              idsToMark.push(item.id);
              viewableItemsRef.current.add(item.id);
          }
      });

      if (idsToMark.length > 0) {
        markNotificationsAsRead(idsToMark);
         // Local state update
         setNotifications(prev => prev.map(n => idsToMark.includes(n.id) ? { ...n, is_read: true } : n));
      }
  }).current;


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
        body: `${req.original_faculty?.full_name || 'Faculty'} requests you to cover ${req.subject?.code || 'their class'} for ${getSlotLabel(req.slot_id)}.`,
        timestamp: req.requested_at || req.created_at || new Date().toISOString(),
        isRead: req.status !== 'pending',
        data: req,
      }));

    const swapItems = (swaps || [])
      .filter(s => !processedIds.has(s.id))
      .map(s => {
        // Safe access to enriched details
        const slotA = s.slot_a_details || {};
        const slotB = s.slot_b_details || {};
        const subjectA = slotA.subjects?.code || slotA.subjects?.name || 'Class';
        const subjectB = slotB.subjects?.code || slotB.subjects?.name || 'Class';
        const timeA = getSlotLabel(s.slot_a_id);
        const timeB = getSlotLabel(s.slot_b_id);

        return {
          id: s.id,
          type: 'swap',
          status: s.status,
          title: s.faculty_a?.full_name || 'Swap Request',
          // Professional Message: "Swap Period 1 (CS101) with Period 2 (CS102)"
          body: `Request to swap ${timeA} (${subjectA}) with ${timeB} (${subjectB}).`,
          timestamp: s.requested_at || s.created_at || new Date().toISOString(),
          isRead: s.status !== 'pending',
          data: s,
        };
      });

    const notifItems = (notifications || [])
      .filter(n => n.type !== 'substitute_request' && n.type !== 'swap_request') // Remove duplicates
      .map(n => {
        // Detect if this is a Leave Notification (Database record)
        const isLeaveNotif = n.type === 'leave_request' || n.type === 'leave' || (n.data && n.data.type === 'LEAVE_REQUEST') || n.title.includes('Leave');
        
        if (isLeaveNotif) {
             return {
                 id: n.id,
                 type: 'leave_proxy', // Distinct type to handle incomplete data
                 status: n.data?.status || (n.body.includes('APPROVED') ? 'approved' : n.body.includes('REJECTED') ? 'rejected' : 'pending'),
                 title: n.title,
                 body: n.body,
                 timestamp: n.created_at,
                 isRead: n.is_read,
                 data: {
                     // Shim data for LeaveRequestCard
                     start_date: n.created_at, // Use created_at as fallback
                     end_date: n.created_at,
                     reason: n.body, // Use body as reason
                     status: n.data?.status || (n.body.includes('APPROVED') ? 'approved' : n.body.includes('REJECTED') ? 'rejected' : 'pending'),
                     leave_type: 'full_day' 
                 }
             };
        }

        return {
            id: n.id,
            type: n.type === 'class_reminder' ? 'alert' : 'info',
            status: n.data?.status || null,
            title: n.title,
            body: n.body,
            timestamp: n.created_at,
            isRead: n.is_read,
            data: n,
        };
    });

    const leaveItems = (leaves || [])
      .map(l => {
        const start = l.start_date ? format(new Date(l.start_date), 'MMM d') : '';
        const end = l.end_date ? format(new Date(l.end_date), 'MMM d') : '';
        const dateStr = start === end ? start : `${start} - ${end}`;
        
        let iconName = 'calendar-outline';
        if (l.status === 'approved') iconName = 'checkmark-circle-outline';
        else if (l.status === 'rejected') iconName = 'close-circle-outline';
        else iconName = 'time-outline';

        return {
          id: l.id,
          type: 'leave', // This falls through to NotificationCard
          status: l.status, 
          title: 'Leave Request',
          body: `Leave for ${dateStr}: ${l.status.charAt(0).toUpperCase() + l.status.slice(1)}`,
          timestamp: l.created_at,
          isRead: true, 
          icon: iconName, // Pass specific icon
          data: l,
        };
      });

    let allItems = [...subItems, ...swapItems, ...notifItems, ...leaveItems];

    // Apply filters
    if (activeFilter === 'all') {
      // User request: Leaves should be seen in leaves option ONLY.
      // So we filter OUT leaves from the 'all' view.
      allItems = [...subItems, ...swapItems, ...notifItems];
    } else if (activeFilter === 'requests') {
      allItems = allItems.filter(i => i.type === 'request' || i.type === 'swap');
    } else if (activeFilter === 'accepted') {
      allItems = allItems.filter(i => i.status === 'accepted');
    } else if (activeFilter === 'events') {
      allItems = allItems.filter(i => i.type === 'alert');
    } else if (activeFilter === 'management') {
      allItems = allItems.filter(i => i.type === 'info' || i.type === 'management_update');
    } else if (activeFilter === 'leaves') {
      allItems = allItems.filter(i => i.type === 'leave');
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
      accepted: requests.filter(r => r.status === 'accepted').length + swaps.filter(s => s.status === 'accepted').length + leaves.filter(l => l.status === 'approved').length,
      events: notifications.filter(n => n.type === 'class_reminder' && !n.is_read).length,
      management: notifications.filter(n => n.type !== 'class_reminder' && n.type !== 'substitute_request' && n.type !== 'swap_request').length,
      leaves: leaves.length,
    };
  }, [notifications, requests, swaps, leaves]);

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
        <Ionicons name="notifications-off-outline" size={normalizeFont(48)} color="#0D4A4A" />
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
                size={normalizeFont(24)} 
                color="#FFFFFF" 
              />
            </TouchableOpacity>
            <View style={{ marginLeft: scale(12) }}>
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
                  <Ionicons name="checkmark-done" size={normalizeFont(22)} color="#FFFFFF" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity 
                  onPress={handleMarkAllRead} 
                  style={styles.headerBtn}
                >
                  <Ionicons name="checkmark-done" size={normalizeFont(22)} color="#FFFFFF" />
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
          <FilterPill id="leaves" label="Leaves" count={counts.leaves} />
          <FilterPill id="events" label="Reminders" count={counts.events} />
          <FilterPill id="management" label="Management" count={counts.management} />
        </ScrollView>
        <Text style={{ 
          textAlign: 'center', 
          color: 'rgba(255,255,255,0.6)', 
          fontSize: normalizeFont(10), 
          marginTop: verticalScale(8),
          marginBottom: verticalScale(4) 
        }}>
         -- Swipe left to delete.
        </Text>
      </LinearGradient>

      { initialLoading ? (
         <View style={{ flex: 1, backgroundColor: isDark ? '#0A0F0F' : '#F5F5F5' }}>
             <NotificationSkeleton />
         </View>
      ) : (
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
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
            loadingMore ? (
                <View style={{ paddingVertical: 20 }}>
                     <NotificationSkeleton />
                </View>
            ) : null
        }
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={{
            itemVisiblePercentThreshold: 50,
            minimumViewTime: 500,
        }}
      />
      )}



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
          bottom: insets.bottom + verticalScale(24),
          left: scale(20),
          right: scale(20),
        }}>
          <TouchableOpacity
            onPress={deleteSelected}
            activeOpacity={0.9}
            style={{
              backgroundColor: '#DC2626',
              paddingVertical: verticalScale(16),
              borderRadius: moderateScale(16),
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: scale(8),
              shadowColor: '#000',
              shadowOffset: { width: 0, height: verticalScale(4) },
              shadowOpacity: 0.3,
              shadowRadius: moderateScale(8),
              elevation: 8,
            }}
          >
            <Ionicons name="trash-outline" size={normalizeFont(20)} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontSize: normalizeFont(16), fontWeight: '700' }}>
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
    paddingBottom: verticalScale(12),
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(8),
    paddingBottom: verticalScale(16),
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: scale(44),
    height: scale(44),
    borderRadius: moderateScale(14),
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: normalizeFont(24),
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: normalizeFont(14),
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    marginTop: verticalScale(2),
  },
  headerActions: {
    flexDirection: 'row',
    gap: scale(10),
  },
  headerBtn: {
    width: scale(44),
    height: scale(44),
    borderRadius: moderateScale(14),
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterContainer: {
    maxHeight: verticalScale(44),
  },
  filterScroll: {
    paddingHorizontal: scale(16),
    paddingBottom: verticalScale(12),
    gap: scale(8),
    flexDirection: 'row',
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(8),
    borderRadius: moderateScale(20),
    borderWidth: 1,
    gap: scale(6),
  },
  filterText: {
    fontSize: normalizeFont(13),
    fontWeight: '600',
  },
  filterBadge: {
    minWidth: scale(18),
    height: scale(18),
    borderRadius: moderateScale(9),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(5),
  },
  filterBadgeText: {
    fontSize: normalizeFont(11),
    fontWeight: '700',
  },
  listContent: {
    paddingTop: verticalScale(16),
    paddingBottom: verticalScale(100),
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
  },
  sectionHeader: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(8),
  },
  sectionTitle: {
    fontSize: normalizeFont(13),
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  selectionWrapper: {
    marginBottom: verticalScale(12),
    marginHorizontal: scale(16),
    borderRadius: moderateScale(16),
  },
  selectedCardWrapper: {
    borderWidth: 1.5,
    borderColor: '#3DDC97',
    backgroundColor: 'rgba(61, 220, 151, 0.1)',
  },
  requestSelectedBadge: {
    position: 'absolute',
    top: verticalScale(12),
    right: scale(12),
    width: scale(22),
    height: scale(22),
    borderRadius: moderateScale(11),
    backgroundColor: '#3DDC97',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(40),
  },
  emptyIcon: {
    width: scale(100),
    height: scale(100),
    borderRadius: moderateScale(50),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(24),
  },
  emptyTitle: {
    fontSize: normalizeFont(20),
    fontWeight: '700',
    marginBottom: verticalScale(8),
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: normalizeFont(15),
    textAlign: 'center',
    lineHeight: verticalScale(22),
  },
});
