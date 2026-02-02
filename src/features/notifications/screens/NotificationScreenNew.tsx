import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, SectionList, RefreshControl, TouchableOpacity, LayoutAnimation, Platform, UIManager, ScrollView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';
import { useNotifications } from '../../../contexts/NotificationContext';
import { supabase } from '../../../config/supabase';
import { NotificationCard } from '../components/NotificationCard';
import { NotificationDetailModal } from '../components/NotificationDetailModal';
import { ConfirmationModal } from '../../../components/ConfirmationModal';
import { ZenToast } from '../../../components/ZenToast';
import { formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { Colors } from '../../../constants';

if (Platform.OS === 'android') {
    if (UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
    }
}

type FilterType = 'all' | 'requests' | 'accepted' | 'events' | 'system';

export const NotificationScreen = ({ navigation }: any) => {
    const { isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const { refreshNotifications, respondToSubstituteRequest } = useNotifications();
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');
    const [notifications, setNotifications] = useState<any[]>([]);
    const [requests, setRequests] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    // Selection Mode
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    // Optimistic ID tracker
    const [processedIds] = useState<Set<string>>(new Set());

    // Modals
    const [selectedNotification, setSelectedNotification] = useState<any>(null);
    
    // Toast State
    const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'warning' | 'info' }>({
        visible: false,
        message: '',
        type: 'success'
    });

    // Confirmation Modal State
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

            // Fetch Substitutions (Filtered for privacy)
            const { data: subData, error: subError } = await supabase
                .from('substitutions')
                .select(`*, original_faculty:original_faculty_id(full_name), subject:subject_id(name, code)`)
                // Secure Filter: Only show my requests, requests to me, or subs I took
                .or(`original_faculty_id.eq.${user.id},substitute_faculty_id.eq.${user.id}`)
                .order('created_at', { ascending: false });

            if (subData) setRequests(subData);

            // Fetch Notifications (Filtered for privacy)
            const { data: notifData, error: notifError } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id) // Strict ONE-TO-ONE check
                .order('created_at', { ascending: false })
                .limit(50);

            if (notifData) setNotifications(notifData);
            
            await refreshNotifications();

        } catch (e) {
             console.log(e);
        }
    };

    useEffect(() => { loadData(); }, []);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const toggleSelection = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
            if (newSelected.size === 0) setSelectionMode(false);
        } else {
            newSelected.add(id);
            setSelectionMode(true);
        }
        setSelectedIds(newSelected);
    };

    const selectAll = () => {
        const allItems = [...requests, ...notifications].map(n => n.id);
        if (selectedIds.size === allItems.length) {
            setSelectedIds(new Set());
            setSelectionMode(false);
        } else {
            setSelectedIds(new Set(allItems));
            setSelectionMode(true);
        }
    };

    const deleteSelected = async () => {
        setConfirmModal({
            visible: true,
            title: 'Delete Selected?',
            message: `Are you sure you want to remove ${selectedIds.size} items?`,
            isDestructive: true,
            onConfirm: async () => {
                   const idsToRemove = Array.from(selectedIds);
                   setConfirmModal(prev => ({ ...prev, visible: false }));
                   
                   // Separate IDs by type
                   const requestIds = idsToRemove.filter(id => requests.find(r => r.id === id));
                   const notifIds = idsToRemove.filter(id => notifications.find(n => n.id === id));

                   LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                   
                   // 1. Delete Notifications (Safe)
                   if (notifIds.length > 0) {
                       setNotifications(prev => prev.filter(n => !selectedIds.has(n.id)));
                       await supabase.from('notifications').delete().in('id', notifIds);
                   }

                   // 2. Handle Requests (Cannot delete from DB)
                   if (requestIds.length > 0) {
                       // Do NOT remove from UI, as they still exist in DB
                       // Optional: You could implement a 'hidden_ids' table later
                       showToast(`${notifIds.length} deleted. Requests cannot be deleted.`, 'warning');
                   } else {
                       showToast('Notifications deleted', 'success');
                   }
                   
                   setSelectedIds(new Set());
                   setSelectionMode(false);
                   await refreshNotifications();
            }
        });
    };

    const handleMarkAllRead = async () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setRequests(prev => prev.map(r => ({ ...r, is_read: true })));
        
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
            }
            await refreshNotifications();
        } catch (error) { console.log(error); }
    };

    const handleAction = async (id: string, action: 'accept' | 'decline') => {
        const item = requests.find(r => r.id === id);
        
        if (action === 'accept' && item) {
             try {
                const dateStr = item.date || item.requested_at; 
                const requestDate = new Date(dateStr); 
                
                if (!isNaN(requestDate.getTime())) {
                    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const dayName = days[requestDate.getDay()];
                    const { data: { user } } = await supabase.auth.getUser();

                    if (user) {
                        const { data: myClasses } = await supabase
                            .from('master_timetables')
                            .select('subjects(name), target_section')
                            .eq('faculty_id', user.id)
                            .eq('day', dayName)
                            .eq('slot_id', item.slot_id)
                            .eq('is_active', true);
                        
                        if (myClasses && myClasses.length > 0) {
                            const conflictClass = myClasses[0];
                            // @ts-ignore
                            const subjectName = conflictClass.subjects?.name || 'a class';
                            
                            Alert.alert(
                                "Schedule Conflict",
                                `You are busy teaching ${subjectName} (${conflictClass.target_section}) at this time.`,
                                [
                                    { text: "Decline Request", style: 'destructive', onPress: () => processAction(id, 'decline') },
                                    { text: "Cancel", style: "cancel" },
                                    { text: "Take Anyway", onPress: () => processAction(id, 'accept') }
                                ]
                            );
                            return; 
                        }
                    }
                }
             } catch (err) {
                 console.log('Conflict check failed', err);
             }
        }

        await processAction(id, action);
    };

    const processAction = async (id: string, action: 'accept' | 'decline') => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        
        processedIds.add(id);
        setRequests(prev => prev.filter(r => r.id !== id));
        
        try {
            const result = await respondToSubstituteRequest(id, action);
            if (result && result.message) {
                showToast(result.message, result.type);
            }
        } catch (error) {
            console.error("Action failed:", error);
            processedIds.delete(id);
            showToast("Action failed. Please check your connection.", "error");
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

    const handleDeleteSingle = async (id: string) => {
        // Check if it's a request
        const isRequest = requests.some(r => r.id === id);
        
        if (isRequest) {
            Alert.alert("Cannot Delete", "Substitution requests are permanent records and cannot be deleted.");
            return;
        }

        setConfirmModal({
            visible: true,
            title: 'Delete Notification?',
            message: 'This action cannot be undone.',
            isDestructive: true,
            onConfirm: async () => {
                   setConfirmModal(prev => ({ ...prev, visible: false }));
                   LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                   
                   setNotifications(prev => prev.filter(n => n.id !== id));
                   // Do not filter requests
                   
                   await supabase.from('notifications').delete().eq('id', id);
                   await refreshNotifications();
                   showToast('Notification deleted', 'success');
            }
        });
    };

    const sections = useMemo(() => {
        const subItems = (requests || [])
            .filter(req => !processedIds.has(req.id)) 
            .map(req => ({
                id: req.id,
                type: 'request',
                status: req.status, 
                title: req.original_faculty?.full_name ? `Request from ${req.original_faculty.full_name}` : 'Substitute Request',
                body: `${req.original_faculty?.full_name || 'A faculty'} requests coverage for ${req.slot_id?.split('_')[1] || 'class'} (${req.target_dept || 'DEPT'}-${req.target_year || 'YR'}-${req.target_section || 'SEC'}).`,
                timestamp: req.requested_at || req.created_at || new Date().toISOString(),
                is_read: req.status !== 'pending',
                data: req
            }));

        const notifItems = (notifications || []).map(n => ({
            id: n.id,
            type: n.type === 'alert' ? 'alert' : 'info',
            status: null,
            title: n.title || 'Notification',
            body: n.body || '',
            timestamp: n.created_at || new Date().toISOString(),
            is_read: n.is_read || false,
            data: n
        }));

        let allItems = [...subItems, ...notifItems].sort((a, b) => 
            safeDate(b.timestamp).getTime() - safeDate(a.timestamp).getTime()
        );

        if (activeFilter === 'requests') allItems = subItems.filter(i => i.status === 'pending');
        if (activeFilter === 'accepted') allItems = subItems.filter(i => i.status === 'accepted' || i.status === 'declined');
        if (activeFilter === 'events') allItems = notifItems.filter(i => i.type === 'alert');
        if (activeFilter === 'system') allItems = notifItems.filter(i => i.type === 'info');

        // Group by Date (e.g. "02 Feb")
        const grouped: { [key: string]: any[] } = {};
        
        allItems.forEach(item => {
            const date = safeDate(item.timestamp);
            const day = date.getDate();
            const month = date.toLocaleString('default', { month: 'short' });
            const key = isToday(date) ? 'Today' : isYesterday(date) ? 'Yesterday' : `${day} ${month}`; // e.g., "1 Feb"
            
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(item);
        });

        return Object.entries(grouped).map(([title, data]) => ({ title, data }));
    }, [requests, notifications, activeFilter, processedIds]);
    const counts = {
        all: requests.filter(r => r.status === 'pending').length + notifications.filter(n => !n.is_read).length,
        requests: requests.filter(r => r.status === 'pending').length,
        accepted: requests.filter(r => r.status === 'accepted' || r.status === 'declined').length,
        events: notifications.filter(n => n.type === 'alert' && !n.is_read).length,
        system: notifications.filter(n => n.type !== 'alert' && !n.is_read).length,
    };

    const bgColors = [Colors.premium.gradientStart, Colors.premium.gradientMid, Colors.premium.gradientEnd];

    const renderFilterPill = (filter: FilterType, label: string, icon: string) => {
        const isActive = activeFilter === filter;
        const count = counts[filter];
        const activeBg = '#10B981';
        const activeText = '#FFFFFF';
        const inactiveBg = isDark ? '#334155' : '#FFFFFF';
        const inactiveText = isDark ? '#FFFFFF' : '#000000';
        const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';

        return (
            <TouchableOpacity
                key={filter}
                onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setActiveFilter(filter);
                }}
                style={[
                    styles.pill,
                    { 
                        backgroundColor: isActive ? activeBg : inactiveBg,
                        borderWidth: 1,
                        borderColor: isActive ? activeBg : borderColor
                    }
                ]}
            >
                <Ionicons name={icon as any} size={14} color={isActive ? activeText : inactiveText} />
                <Text style={[styles.pillText, { color: isActive ? activeText : inactiveText }]}>{label}</Text>
                {count > 0 && (
                    <View style={[
                        styles.pillBadge, 
                        { backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : (isDark ? 'rgba(255,255,255,0.1)' : '#F1F5F9') }
                    ]}>
                        <Text style={[styles.pillBadgeText, { color: isActive ? activeText : inactiveText }]}>{count}</Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <View style={StyleSheet.absoluteFill}>
                <LinearGradient
                    colors={bgColors as any}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                />
                <View style={[styles.orb, styles.orb1, { backgroundColor: isDark ? 'rgba(61, 220, 151, 0.15)' : 'rgba(16, 185, 129, 0.15)' }]} />
                <View style={[styles.orb, styles.orb2, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(56, 189, 248, 0.15)' }]} />
            </View>
            
            <View style={[styles.contentContainer, { paddingTop: insets.top }]}>
                {/* Header */}
                <View style={styles.header}>
                    {selectionMode ? (
                        <>
                            <TouchableOpacity onPress={() => { setSelectionMode(false); setSelectedIds(new Set()); }}>
                                <Ionicons name="close" size={24} color="#FFF" />
                            </TouchableOpacity>
                            <Text style={[styles.headerTitle, { fontSize: 20, marginBottom: 0, color: '#FFF' }]}>
                                {selectedIds.size} Selected
                            </Text>
                            <View style={{ flexDirection: 'row', gap: 16 }}>
                                <TouchableOpacity onPress={selectAll}>
                                    <Ionicons name="checkmark-done-circle-outline" size={24} color="#FFF" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={deleteSelected}>
                                    <Ionicons name="trash-outline" size={24} color="#EF4444" />
                                </TouchableOpacity>
                            </View>
                        </>
                    ) : (
                        <>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <TouchableOpacity 
                                    style={{ 
                                        width: 44, height: 44, borderRadius: 14,
                                        backgroundColor: 'rgba(255,255,255,0.15)',
                                        alignItems: 'center', justifyContent: 'center'
                                     }}
                                    onPress={() => navigation.navigate('Home')}
                                >
                                    <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
                                </TouchableOpacity>
                                <View>
                                    <Text style={[styles.headerTitle, { color: '#FFF' }]}>Notifications</Text>
                                    <Text style={[styles.headerSubtitle, { color: 'rgba(255,255,255,0.7)' }]}>
                                        {counts.all} unread
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={handleMarkAllRead} style={[styles.readAllButton, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#E0F2FE' }]}>
                                <Ionicons name="checkmark-done-outline" size={18} color={isDark ? '#10B981' : '#0284C7'} />
                                <Text style={[styles.readAllText, { color: isDark ? '#10B981' : '#0284C7' }]}>Read all</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>

                {/* Filters */}
                {!selectionMode && (
                    <View style={styles.filterContainer}>
                        <ScrollView 
                            horizontal 
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.pillScrollContent}
                            style={styles.pillScroll}
                        >
                            {renderFilterPill('all', 'All', 'layers')}
                            {renderFilterPill('requests', 'Requests', 'people')}
                            {renderFilterPill('accepted', 'Accepted', 'checkmark-circle')}
                            {renderFilterPill('events', 'Events', 'calendar')}
                            {renderFilterPill('system', 'System', 'megaphone')}
                        </ScrollView>
                    </View>
                )}

                <SectionList
                    sections={sections}
                    keyExtractor={(item) => item.id}
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.content}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? "#10B981" : "#0F766E"} />}
                    stickySectionHeadersEnabled={false}
                    renderSectionHeader={({ section: { title } }) => (
                        <Text style={[styles.sectionHeader, { color: isDark ? '#64748B' : '#475569' }]}>{title}</Text>
                    )}
                    renderItem={({ item }) => (
                        <NotificationCard
                            {...item}
                            timestamp={getRelativeTime(item.timestamp)}
                            isDark={isDark}
                            icon={item.type === 'request' ? 'people' : item.type === 'alert' ? 'calendar' : 'megaphone'}
                            selectionMode={selectionMode}
                            isSelected={selectedIds.has(item.id)}
                            onLongPress={() => toggleSelection(item.id)}
                            onPress={() => handlePressNotification(item)}
                            actions={(!selectionMode && item.type === 'request' && item.status === 'pending') ? [
                                { label: 'Accept', variant: 'primary', icon: 'checkmark', onPress: () => handleAction(item.id, 'accept') },
                                { label: 'Decline', variant: 'secondary', icon: 'close', onPress: () => handleAction(item.id, 'decline') }
                            ] : undefined}
                            status={item.status} // Pass status for rendering badges
                        />
                    )}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <View style={[styles.emptyIcon, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', borderColor: isDark ? 'transparent' : '#E2E8F0', borderWidth: isDark ? 0 : 1 }]}>
                                <Ionicons name="notifications-off-outline" size={40} color={isDark ? '#475569' : '#94A3B8'} />
                            </View>
                            <Text style={[styles.emptyText, { color: isDark ? '#475569' : '#64748B' }]}>No notifications yet</Text>
                        </View>
                    }
                />
            </View>

            <NotificationDetailModal 
                visible={!!selectedNotification}
                notification={selectedNotification}
                onClose={() => setSelectedNotification(null)}
                onDelete={handleDeleteSingle}
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
            
            <View style={{ position: 'absolute', top: insets.top + 60, left: 20, right: 20, zIndex: 9999 }}>
                <ZenToast
                    visible={toast.visible}
                    message={toast.message}
                    type={toast.type}
                    onHide={() => setToast(prev => ({ ...prev, visible: false }))}
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0D4A4A' },
    contentContainer: { flex: 1, zIndex: 10 },
    header: {
        paddingHorizontal: 24, paddingBottom: 16, paddingTop: 12, // Increased top padding
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', // Align bottom
    },
    headerTitle: { fontSize: 28, fontWeight: '800', marginBottom: 0 }, // Reduced bottom margin
    headerSubtitle: { fontSize: 14, fontWeight: '500', marginBottom: 4 }, 
    readAllButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, marginBottom: 2 }, // Small margin for alignment
    readAllText: { fontSize: 13, fontWeight: '600' },
    filterContainer: { paddingVertical: 12 },
    pillScroll: { flexGrow: 0 },
    pillScrollContent: { flexDirection: 'row', gap: 10, paddingHorizontal: 24 },
    pill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
    pillText: { fontSize: 13, fontWeight: '600' },
    pillBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
    pillBadgeText: { fontSize: 11, fontWeight: '700' },
    content: { paddingHorizontal: 24, paddingBottom: 40, flexGrow: 1 },
    sectionHeader: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 24, marginBottom: 12 },
    emptyState: { alignItems: 'center', marginTop: 80, gap: 16 },
    emptyIcon: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
    emptyText: { fontSize: 15, fontWeight: '500' },
    orb: { position: 'absolute', borderRadius: 200 },
    orb1: { width: 300, height: 300, top: -100, right: -100 },
    orb2: { width: 250, height: 250, bottom: 200, left: -80 },
});
