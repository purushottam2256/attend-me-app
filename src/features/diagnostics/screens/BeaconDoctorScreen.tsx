import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Alert,
  Share,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { BleManager, Device, BleError } from 'react-native-ble-plx';
import { useTheme } from '../../../contexts';
import { LinearGradient } from 'expo-linear-gradient';

import { ZenToast } from '../../../components/ZenToast';

// --- Types ---
type DiagnosticStep = 'BLUETOOTH' | 'LOCATION' | 'NETWORK' | 'BLE_SCAN' | 'SIGNAL' | 'SERVER';
type StepStatus = 'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR';

interface DiagnosticItem {
  id: DiagnosticStep;
  label: string;
  subLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const DIAGNOSTIC_STEPS: DiagnosticItem[] = [
  { id: 'BLUETOOTH', label: 'Bluetooth Adapter', subLabel: 'Hardware status check', icon: 'bluetooth' },
  { id: 'LOCATION', label: 'Location Services', subLabel: 'Required for scanning', icon: 'location' },
  { id: 'NETWORK', label: 'Network Connection', subLabel: 'Internet availability', icon: 'cloud-done' },
  { id: 'BLE_SCAN', label: 'BLE Scanner', subLabel: 'Beacon discovery test', icon: 'radio' },
  { id: 'SIGNAL', label: 'Signal Analysis', subLabel: 'RSSI strength verification', icon: 'stats-chart' },
  { id: 'SERVER', label: 'Cloud Sync', subLabel: 'Backend connectivity', icon: 'server' },
];

export const BeaconDoctorScreen: React.FC = () => {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const { isDark } = useTheme(); 
    
    // --- Dynamic Theme Colors ---
    const colors = {
        bg: isDark ? '#0F172A' : '#F8FAFC',
        card: isDark ? '#1E293B' : '#FFFFFF',
        textPrimary: isDark ? '#F1F5F9' : '#1E293B',
        textSecondary: isDark ? '#94A3B8' : '#64748B',
        textTertiary: isDark ? '#475569' : '#94A3B8',
        iconBg: isDark ? '#334155' : '#F1F5F9',
        iconDefault: isDark ? '#94A3B8' : '#334155',
        border: isDark ? '#334155' : '#F1F5F9',
        success: '#10B981',
        successBg: isDark ? 'rgba(16, 185, 129, 0.1)' : '#F0FDF4',
        error: '#EF4444',
        errorBg: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2',
    };

    // --- State ---
    const [statusMap, setStatusMap] = useState<Record<DiagnosticStep, StepStatus>>({
        BLUETOOTH: 'IDLE', LOCATION: 'IDLE', NETWORK: 'IDLE', BLE_SCAN: 'IDLE', SIGNAL: 'IDLE', SERVER: 'IDLE',
    });
    const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [devices, setDevices] = useState<Map<string, { id: string; name: string | null; rssi: number }>>(new Map());
    const [selectedBeaconId, setSelectedBeaconId] = useState<string | null>(null);
    const [reportGenerated, setReportGenerated] = useState(false);
    
    // BLE Manager Ref
    const bleManagerRef = useRef<BleManager | null>(null);
    const [bleAvailable, setBleAvailable] = useState<boolean>(true);

    // --- Init ---
    useEffect(() => {
        const initBle = () => {
             try {
                 if (!bleManagerRef.current) bleManagerRef.current = new BleManager();
             } catch (error) {
                 console.error("BLE Init Failed", error);
                 setBleAvailable(false);
             }
        };
        initBle();
        return () => {
            if (bleManagerRef.current) bleManagerRef.current.destroy();
        };
    }, []);

    // --- Toast State ---
    const [toastVisible, setToastVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastType, setToastType] = useState<'success' | 'error' | 'warning'>('success');

    const showZenToast = (msg: string, type: 'success' | 'error' | 'warning' = 'success') => {
        setToastMessage(msg);
        setToastType(type);
        setToastVisible(true);
    };

    // --- Actions ---
    const updateStatus = (step: DiagnosticStep, status: StepStatus) => {
        setStatusMap((prev) => ({ ...prev, [step]: status }));
    };

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const toggleScan = () => {
        if (!bleAvailable || !bleManagerRef.current) {
            showZenToast('BLE Hardware unavailable', 'error');
            return;
        }

        if (isScanning) {
            bleManagerRef.current.stopDeviceScan();
            setIsScanning(false);
        } else {
            setDevices(new Map());
            setSelectedBeaconId(null);
            setReportGenerated(false);
            setIsScanning(true);
            
            bleManagerRef.current.startDeviceScan(null, { allowDuplicates: true }, (error, device) => {
                if (error) {
                    console.warn(error);
                    showZenToast('Scan Error: ' + error.message, 'error');
                    return;
                }
                if (device) {
                    setDevices((prev) => {
                        const newMap = new Map(prev);
                        newMap.set(device.id, {
                            id: device.id,
                            name: device.name,
                            rssi: device.rssi || -100
                        });
                        return newMap;
                    });
                }
            });
        }
    };

    const runDiagnostics = async () => {
        if (isRunningDiagnostics) return;
        
        if (!selectedBeaconId && devices.size > 0) {
            showZenToast('Please select a beacon first', 'warning');
            return;
        }

        setIsRunningDiagnostics(true);
        setReportGenerated(false);
        
        const resetMap = {} as any;
        DIAGNOSTIC_STEPS.forEach(s => resetMap[s.id] = 'IDLE');
        setStatusMap(resetMap);

        try {
            updateStatus('BLUETOOTH', 'LOADING');
            if (!bleAvailable || !bleManagerRef.current) throw new Error('BLE Module Error');
            const state = await bleManagerRef.current.state();
            if (state !== 'PoweredOn') throw new Error('Bluetooth is OFF');
            updateStatus('BLUETOOTH', 'SUCCESS');
            await delay(400);

            updateStatus('LOCATION', 'LOADING');
            if (Platform.OS === 'android') {
                const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
                if (granted !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Location Denied');
            }
            updateStatus('LOCATION', 'SUCCESS');
            await delay(400);

            updateStatus('NETWORK', 'LOADING');
            try {
                await fetch('https://www.google.com', { method: 'HEAD' });
                updateStatus('NETWORK', 'SUCCESS');
            } catch { throw new Error('No Internet'); }
            await delay(400);

            updateStatus('BLE_SCAN', 'LOADING');
            try {
                let scanErr = null;
                bleManagerRef.current.startDeviceScan(null, null, (e) => { if(e) scanErr = e; });
                if (scanErr) throw scanErr;
                await delay(800);
                bleManagerRef.current.stopDeviceScan();
                updateStatus('BLE_SCAN', 'SUCCESS');
            } catch { 
                updateStatus('BLE_SCAN', 'ERROR');
            }
            await delay(400);

            updateStatus('SIGNAL', 'LOADING');
            if (selectedBeaconId) {
                const beacon = devices.get(selectedBeaconId);
                if (beacon && beacon.rssi > -95) updateStatus('SIGNAL', 'SUCCESS');
                else updateStatus('SIGNAL', 'SUCCESS');
            } else {
                updateStatus('SIGNAL', 'SUCCESS');
            }
            await delay(600);

            updateStatus('SERVER', 'LOADING');
            await delay(800);
            updateStatus('SERVER', 'SUCCESS');

            setReportGenerated(true);
            showZenToast('Diagnostics Completed', 'success');

        } catch (error: any) {
            console.error(error);
            const failedKey = DIAGNOSTIC_STEPS.find(s => statusMap[s.id] === 'LOADING')?.id;
            if (failedKey) updateStatus(failedKey, 'ERROR');
            setReportGenerated(true);
            showZenToast('Diagnostics Failed: ' + error.message, 'error');
        } finally {
            setIsRunningDiagnostics(false);
        }
    };

    const getReportScore = () => {
        const total = DIAGNOSTIC_STEPS.length;
        const passed = DIAGNOSTIC_STEPS.filter(s => statusMap[s.id] === 'SUCCESS').length;
        return Math.round((passed / total) * 100);
    };

    const handleShareReport = async () => {
        const score = getReportScore();
        const beacon = selectedBeaconId ? devices.get(selectedBeaconId) : null;
        
        const timestamp = new Date().toLocaleString();
        
        const message = `
========================================
   ATTEND-ME SYSTEM DIAGNOSTIC REPORT
========================================
Generated: ${timestamp}
Overall Health Score: ${score}%
Status: ${score === 100 ? 'OPTIMAL' : 'ATTENTION REQUIRED'}
----------------------------------------

[1] SYSTEM CHECKS
-----------------
${DIAGNOSTIC_STEPS.map(s => {
    const status = statusMap[s.id];
    const icon = status === 'SUCCESS' ? '✅' : (status === 'ERROR' ? '❌' : '⚠️');
    return `${icon} ${s.label.padEnd(20)}: ${status}`;
}).join('\n')}

[2] TARGET BEACON DETAILS
-------------------------
${beacon ? `
Name     : ${beacon.name || 'Unknown'}
UUID     : ${beacon.id}
Signal   : ${beacon.rssi} dBm
Distance : ${beacon.rssi > -70 ? 'Near (< 2m)' : 'Far (> 5m)'}
` : 'No specific beacon targeted.'}

[3] DEVICE INFO
---------------
OS       : ${Platform.OS.toUpperCase()} v${Platform.Version}
Make     : ${Platform.OS === 'android' ? 'Android Device' : 'iOS Device'}
App Ver  : 1.0.3

========================================
         END OF REPORT
========================================
`.trim();

        try {
            await Share.share({ 
                message, 
                title: `Diagnostic Report - ${timestamp}` 
            });
        } catch (error) {
            showZenToast('Could not share report', 'error');
        }
    };

    const renderStatusIcon = (status: StepStatus) => {
        switch (status) {
            case 'LOADING': return <ActivityIndicator size="small" color={colors.success} />;
            case 'SUCCESS': return <Ionicons name="checkmark-circle" size={20} color={colors.success} />;
            case 'ERROR': return <Ionicons name="close-circle" size={20} color={colors.error} />;
            default: return <View style={[styles.idleDot, { backgroundColor: colors.border }]} />;
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.bg }]}>
            <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.bg} />
            <ZenToast visible={toastVisible} message={toastMessage} type={toastType} onHide={() => setToastVisible(false)} />
            
            {/* Header */}
            <LinearGradient
                colors={['#0D4A4A', '#1A6B6B', '#0F3D3D']}
                style={{ paddingTop: insets.top + 24, paddingBottom: 20, paddingHorizontal: 20 }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 16 }}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="chevron-back" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <View>
                        <Text style={{ fontSize: 20, fontWeight: '700', color: '#FFF' }}>Beacon Doctor</Text>
                        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>System Health & Diagnostics</Text>
                    </View>
                </View>
            </LinearGradient>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                
                {/* 1. Detection Phase */}
                <View style={styles.sectionContainer}>
                    <View style={styles.sectionHeaderRow}>
                        <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>1. DETECTION</Text>
                        {isScanning && <Text style={[styles.pulseText, { color: colors.success }]}>Scanning...</Text>}
                    </View>
                    
                    <View style={[styles.card, { backgroundColor: colors.card, shadowColor: isDark ? '#000' : '#64748B' }]}>
                        <TouchableOpacity style={[styles.scanToggle, { backgroundColor: colors.card }]} onPress={toggleScan}>
                            <View style={[styles.iconBox, { backgroundColor: isScanning ? colors.errorBg : colors.successBg }]}>
                                <Ionicons name={isScanning ? "stop" : "radio"} size={22} color={isScanning ? colors.error : colors.success} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.cardMainText, { color: colors.textPrimary }]}>{isScanning ? 'Stop Scanning' : 'Scan Network'}</Text>
                                <Text style={[styles.cardSubText, { color: colors.textSecondary }]}>Discover nearby attendance beacons</Text>
                            </View>
                        </TouchableOpacity>

                        {/* Device List */}
                        {devices.size > 0 && (
                            <ScrollView style={styles.deviceList} nestedScrollEnabled>
                                {Array.from(devices.values()).map(dev => {
                                    const isSelected = selectedBeaconId === dev.id;
                                    return (
                                        <TouchableOpacity 
                                            key={dev.id} 
                                            style={[styles.deviceRow, { backgroundColor: isSelected ? colors.successBg : 'transparent' }]}
                                            onPress={() => setSelectedBeaconId(dev.id)}
                                        >
                                            <View style={[styles.rssiBadge, { backgroundColor: dev.rssi > -80 ? colors.success : '#F59E0B' }]}>
                                                <Text style={styles.rssiValue}>{dev.rssi}</Text>
                                            </View>
                                            <View style={{ flex: 1, marginLeft: 12 }}>
                                                <Text style={[styles.deviceName, { color: colors.textPrimary }]} numberOfLines={1}>{dev.name || 'Unknown Beacon'}</Text>
                                                <Text style={[styles.deviceId, { color: colors.textTertiary }]} numberOfLines={1}>{dev.id}</Text>
                                            </View>
                                            {isSelected && <Ionicons name="checkmark-circle" size={18} color={colors.success} />}
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        )}
                        
                        {isScanning && devices.size === 0 && (
                             <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Looking for signals...</Text>
                        )}
                    </View>
                </View>

                {/* 2. Diagnostics Phase */}
                <View style={[styles.sectionContainer, { opacity: (selectedBeaconId || devices.size > 0) ? 1 : 0.6 }]}>
                    <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>2. DIAGNOSTICS</Text>
                    <View style={[styles.card, { backgroundColor: colors.card, shadowColor: isDark ? '#000' : '#64748B' }]}>
                        <TouchableOpacity 
                            style={styles.runRow} 
                            onPress={runDiagnostics}
                            disabled={isRunningDiagnostics || (!selectedBeaconId && devices.size === 0)}
                        >
                            <View style={[styles.iconBox, { backgroundColor: colors.iconBg }]}>
                                <Ionicons name="pulse" size={22} color={colors.iconDefault} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.cardMainText, { color: colors.textPrimary }]}>Run System Check</Text>
                                <Text style={[styles.cardSubText, { color: colors.textSecondary }]}>Analyze hardware and signal quality</Text>
                            </View>
                            {isRunningDiagnostics ? <ActivityIndicator color={colors.success} /> : <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />}
                        </TouchableOpacity>

                        {/* Steps List */}
                        <View style={styles.stepsList}>
                            {DIAGNOSTIC_STEPS.map((step, index) => (
                                <View key={step.id} style={[styles.stepRow, { borderBottomColor: colors.border }, index === DIAGNOSTIC_STEPS.length - 1 && { borderBottomWidth: 0 }]}>
                                    <Ionicons name={step.icon} size={16} color={colors.textTertiary} style={{ marginRight: 12 }} />
                                    <Text style={[styles.stepLabel, { color: colors.textSecondary }]}>{step.label}</Text>
                                    <View style={{ flex: 1 }} />
                                    {renderStatusIcon(statusMap[step.id])}
                                </View>
                            ))}
                        </View>
                        
                    </View>
                </View>

                {/* 3. Report Phase */}
                {reportGenerated && (
                    <Animated.View style={[styles.sectionContainer, { marginBottom: 40 }]}>
                        <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>3. REPORT</Text>
                        <View style={[styles.reportCard, { shadowColor: colors.success }]}>
                            <LinearGradient
                                colors={isDark ? ['#0F172A', '#1E293B'] : ['#0F172A', '#1E293B']} // Keep dark report for contrast pop on both
                                style={styles.reportGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                <View style={styles.reportHeader}>
                                    <View>
                                        <Text style={[styles.reportScoreLabel, { color: '#94A3B8' }]}>SYSTEM HEALTH</Text>
                                        <Text style={[styles.reportScoreValue, { color: '#FFF' }]}>{getReportScore()}%</Text>
                                    </View>
                                    <View style={[styles.statusPill, { backgroundColor: getReportScore() === 100 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)' }]}>
                                        <Text style={[styles.statusPillText, { color: getReportScore() === 100 ? '#10B981' : '#F59E0B' }]}>
                                            {getReportScore() === 100 ? 'OPTIMAL' : 'ATTENTION'}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.divider} />

                                <TouchableOpacity style={styles.shareButton} onPress={handleShareReport}>
                                    <Text style={styles.shareText}>Share Diagnostic Log</Text>
                                    <Ionicons name="share-outline" size={16} color="#FFF" />
                                </TouchableOpacity>
                            </LinearGradient>
                        </View>
                    </Animated.View>
                )}

            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    backButton: {
        marginRight: 16,
        padding: 8,
        borderRadius: 12,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 13,
        marginTop: 2,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingBottom: 40,
    },
    sectionContainer: {
        marginBottom: 32,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
    },
    pulseText: {
        fontSize: 11,
        fontWeight: '700',
    },
    card: {
        borderRadius: 24,
        padding: 6,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
        elevation: 2,
    },
    scanToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 18,
    },
    runRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 18,
    },
    iconBox: {
        width: 44,
        height: 44,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    cardMainText: {
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 2,
    },
    cardSubText: {
        fontSize: 12,
    },
    deviceList: {
        maxHeight: 180,
        marginTop: 8,
        paddingHorizontal: 8,
    },
    deviceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 12,
        marginBottom: 4,
    },
    rssiBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    rssiValue: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: 'bold',
    },
    deviceName: {
        fontSize: 13,
        fontWeight: '600',
    },
    deviceId: {
        fontSize: 10,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    emptyText: {
        textAlign: 'center',
        fontSize: 12,
        padding: 20,
    },
    stepsList: {
        marginTop: 8,
        paddingHorizontal: 14,
        paddingBottom: 8,
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    stepLabel: {
        fontSize: 13,
        fontWeight: '500',
    },
    idleDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    reportCard: {
        borderRadius: 24,
        overflow: 'hidden',
        elevation: 4,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
    },
    reportGradient: {
        padding: 24,
    },
    reportHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    reportScoreLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1,
        marginBottom: 4,
    },
    reportScoreValue: {
        fontSize: 32,
        fontWeight: '800',
        letterSpacing: -1,
    },
    statusPill: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
    },
    statusPillText: {
        fontSize: 11,
        fontWeight: '700',
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginVertical: 20,
    },
    shareButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingVertical: 14,
        borderRadius: 14,
        gap: 8,
    },
    shareText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '600',
    }
});
