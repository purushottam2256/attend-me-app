import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts/ThemeContext';
import { ZenToast } from '../../../components/ZenToast';
import { ResolverEngine, SyncResult } from '../../../services/ResolverEngine';
import { getPendingCount } from '../../../services/offlineService';
import NetInfo from '@react-native-community/netinfo';

export const SyncManagerScreen = ({ navigation }: any) => {
    const { isDark } = useTheme();
    const insets = useSafeAreaInsets();
    
    const [stats, setStats] = useState({ pending: 0, lastSync: 'Never' });
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncLog, setSyncLog] = useState<string[]>([]);
    const [isOnline, setIsOnline] = useState(true);
    const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'warning' }>({
        visible: false,
        message: '',
        type: 'success'
    });

    useEffect(() => {
        checkStatus();
        const unsubscribe = NetInfo.addEventListener(state => {
            setIsOnline(!!state.isConnected);
        });
        return unsubscribe;
    }, []);

    const checkStatus = async () => {
        const count = await getPendingCount();
        setStats(s => ({ ...s, pending: count }));
    };

    const handleSync = async () => {
        if (!isOnline) {
            setToast({ visible: true, message: 'Please connect to the internet to sync.', type: 'warning' });
            return;
        }

        setIsSyncing(true);
        addToLog('Starting sync process...');

        try {
            const result: SyncResult = await ResolverEngine.syncPendingAttendance();
            
            if (result.success) {
                if (result.syncedCount > 0) {
                    addToLog(`Successfully synced ${result.syncedCount} batches.`);
                } else if (result.failedCount > 0) {
                    addToLog(`Failed to sync ${result.failedCount} batches.`);
                } else {
                    addToLog('All up to date. No pending changes.');
                }

                if (result.errors.length > 0) {
                    result.errors.forEach(e => addToLog(`Error: ${e}`));
                }
            } else {
                addToLog('Sync failed. ' + result.errors.join(', '));
            }
        } catch (e: any) {
            addToLog('Critical Error: ' + e.message);
        } finally {
            setIsSyncing(false);
            checkStatus(); // Refresh pending count
        }
    };

    const addToLog = (msg: string) => {
        const time = new Date().toLocaleTimeString();
        setSyncLog(prev => [`[${time}] ${msg}`, ...prev]);
    };

    return (
        <View style={[styles.container, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', paddingTop: insets.top }]}>
            
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={isDark ? '#FFF' : '#0F172A'} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: isDark ? '#FFF' : '#0F172A' }]}>Sync Manager</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                
                {/* Status Card */}
                <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#FFF' }]}>
                    <View style={styles.statusRow}>
                        <View>
                            <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#64748B' }]}>CONNECTION STATUS</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isOnline ? '#10B981' : '#EF4444', marginRight: 8 }} />
                                <Text style={{ fontSize: 16, fontWeight: '600', color: isDark ? '#FFF' : '#0F172A' }}>
                                    {isOnline ? 'Online' : 'Offline'}
                                </Text>
                            </View>
                        </View>
                        <View>
                            <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#64748B' }]}>PENDING UPLOADS</Text>
                            <Text style={{ fontSize: 24, fontWeight: '700', color: isDark ? '#FFF' : '#0F172A', marginTop: 4 }}>
                                {stats.pending}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Sync Action */}
                <TouchableOpacity 
                    onPress={handleSync} 
                    disabled={isSyncing || !isOnline}
                    style={[
                        styles.syncBtn, 
                        { opacity: (isSyncing || !isOnline) ? 0.7 : 1, backgroundColor: isOnline ? '#0F766E' : '#64748B' }
                    ]}
                >
                    {isSyncing ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <>
                            <Ionicons name="cloud-upload-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
                            <Text style={styles.syncBtnText}>{isOnline ? 'Sync Now' : 'Connect to Sync'}</Text>
                        </>
                    )}
                </TouchableOpacity>

                {/* Logs */}
                <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#64748B', marginTop: 32, marginBottom: 12 }]}>SYNC ACTIVITY LOG</Text>
                <View style={[styles.logContainer, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
                    {syncLog.length === 0 ? (
                        <Text style={{ color: '#94A3B8', fontStyle: 'italic', textAlign: 'center', marginTop: 20 }}>No activity yet.</Text>
                    ) : (
                        syncLog.map((log, i) => (
                            <Text key={i} style={[styles.logText, { color: isDark ? '#CBD5E1' : '#334155' }]}>{log}</Text>
                        ))
                    )}
                </View>

            </ScrollView>
            
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
    header: { flexDirection: 'row', alignItems: 'center', padding: 20 },
    backBtn: { padding: 8, marginRight: 16 },
    headerTitle: { fontSize: 20, fontWeight: '700' },
    content: { padding: 20 },
    card: { borderRadius: 16, padding: 20, marginBottom: 24, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    statusRow: { flexDirection: 'row', justifyContent: 'space-between' },
    label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
    syncBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 16, marginBottom: 24 },
    syncBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
    logContainer: { borderRadius: 12, padding: 16, minHeight: 200 },
    logText: { fontSize: 13, marginBottom: 8, fontFamily: 'monospace' }
});
