import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  BackHandler,
  Modal,
  Image,
  Animated,
  Dimensions,
  Easing
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@navigation/RootNavigator';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';

import { useTheme } from '@contexts';
import { ManualAttendanceGrid } from '../components/ManualAttendanceGrid';
import { useAttendance } from '../hooks/useAttendance';
import { checkExistingSession } from '@services/dashboardService';
import { supabase } from '@config/supabase';
import { ZenToast } from '@components/ZenToast';
import { scale, verticalScale, moderateScale, normalizeFont } from '@utils/responsive';


// Stats Component
const StatsBar = ({ counts, onBulkAction }: { 
    counts: { present: number, absent: number, od: number, leave: number, total: number },
    onBulkAction: (action: 'present_all' | 'absent_all') => void
}) => (
    <View style={styles.statsContainer}>
        {/* Stats Row */}
        <View style={styles.statsRow}>
            <View style={styles.statItem}>
                <View style={[styles.statDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.statText}><Text style={styles.statBold}>{counts.present}</Text> Present</Text>
            </View>
            <View style={styles.statItem}>
                <View style={[styles.statDot, { backgroundColor: '#EF4444' }]} />
                <Text style={styles.statText}><Text style={styles.statBold}>{counts.absent}</Text> Absent</Text>
            </View>
            <View style={styles.statItem}>
                <View style={[styles.statDot, { backgroundColor: '#F59E0B' }]} />
                <Text style={styles.statText}><Text style={styles.statBold}>{counts.od}</Text> OD</Text>
            </View>
        </View>

        {/* Bulk Actions Row */}
        <View style={styles.bulkActionsRow}>
            <TouchableOpacity 
                style={[styles.bulkButton, { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}
                onPress={() => onBulkAction('present_all')}
            >
                <Ionicons name="checkmark-done-circle" size={normalizeFont(16)} color="#10B981" />
                <Text style={[styles.bulkText, { color: '#10B981' }]}>Mark All Present</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
                style={[styles.bulkButton, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.3)' }]}
                onPress={() => onBulkAction('absent_all')}
            >
                <Ionicons name="close-circle" size={normalizeFont(16)} color="#EF4444" />
                <Text style={[styles.bulkText, { color: '#EF4444' }]}>Mark All Absent</Text>
            </TouchableOpacity>
        </View>
    </View>
);

export const ManualEntryScreen: React.FC = () => {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ManualEntry'>>();

  // Params
  const { classData } = route.params;

  // State
  const [batchOverride, setBatchOverride] = useState<'full' | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null); // For Modal
  
  // Custom UI State
  const [toast, setToast] = useState<{ visible: boolean, type: 'success' | 'error', message: string, onRetry?: () => void }>({ visible: false, type: 'success', message: '' });
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);

  const showToast = useCallback((type: 'success' | 'error', message: string, onRetry?: () => void) => {
    setToast({ visible: true, type, message, onRetry });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, visible: false }));
  }, []);

  const {
    students,
    loading,
    updateStudentStatus,
    submitAttendance,
    isOfflineMode,
  } = useAttendance({ classData, batchOverride });

  // Batch label for display (respects override)
  const effectiveBatch = batchOverride === 'full' ? null : (classData?.batch ?? null);
  const batchLabel = effectiveBatch === 1 ? 'Batch 1' : effectiveBatch === 2 ? 'Batch 2' : null;

  const stats = {
      present: students.filter(s => s.status === 'present').length,
      absent: students.filter(s => s.status === 'absent').length,
      od: students.filter(s => s.status === 'od').length,
      leave: students.filter(s => s.status === 'leave').length,
      total: students.length
  };


  // Bulk Actions
  const handleBulkAction = useCallback((action: 'present_all' | 'absent_all') => {
      const targetStatus = action === 'present_all' ? 'present' : 'absent';
      let changesMade = false;
      students.forEach(s => {
          if (s.status === 'od' || s.status === 'leave') return;
          if (s.status !== targetStatus) {
              updateStudentStatus(s.id, targetStatus);
              changesMade = true;
          }
      });
      if (changesMade) setHasChanges(true);
  }, [students, updateStudentStatus]);

  // Dirty State Protection
  useEffect(() => {
    const onBackPress = () => {
      if (hasChanges && !submitting) {
        setShowUnsavedModal(true);
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [hasChanges, submitting, navigation]);

  const handleToggle = useCallback((studentId: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student || student.status === 'od' || student.status === 'leave') return;
    const newStatus = (student.status === 'present' || student.status === 'pending') ? 'absent' : 'present';
    updateStudentStatus(studentId, newStatus);
    setHasChanges(true);
  }, [students, updateStudentStatus]);

  const handleSubmit = async () => {
    setSubmitting(true);
    // Don't set hasChanges(false) yet to prevent button from disappearing
    
    try {
        const { success } = await submitAttendance();
        
        if (success) {
            setHasChanges(false); // NOW we can hide it
            showToast('success', 'Attendance submitted successfully');
            
            setTimeout(() => {
                if (navigation.canGoBack()) {
                    navigation.goBack();
                }
            }, 1000);
        } else {
            setSubmitting(false);
            // hasChanges remains true, button stays visible
            showToast('error', 'Failed to save attendance', handleSubmit);
        }
    } catch (e) {
        setSubmitting(false);
        // hasChanges remains true, button stays visible
        showToast('error', 'An error occurred', handleSubmit);
    }
  };


  const colors = {
      bgGradient: ['#0D4A4A', '#1A6B6B', '#0F3D3D'],
      accent: '#3DDC97',
      text: '#FFF'
  };

  if (loading) {
      return (
          <View style={[styles.center, { backgroundColor: '#0D4A4A', flex: 1, alignItems:'center', justifyContent:'center' }]}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={{ color: colors.text, marginTop: verticalScale(10) }}>Loading Class Roster...</Text>
          </View>
      );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={colors.bgGradient as any} style={StyleSheet.absoluteFill} />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity 
            onPress={() => {
                if (hasChanges && !submitting) setShowUnsavedModal(true);
                else navigation.goBack();
            }} 
            style={styles.iconButton}
        >
            <Ionicons name="arrow-back" size={normalizeFont(24)} color="#FFF" />
        </TouchableOpacity>
        
        <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>{classData?.subject?.name || 'Attendance'}</Text>
            <Text style={styles.headerSubtitle}>
                {classData?.target_dept} • {classData?.target_year} • {classData?.target_section}{batchLabel ? ` • ${batchLabel}` : ''}
            </Text>
            {isOfflineMode && (
                <View style={{ 
                    marginTop: verticalScale(4),
                    paddingHorizontal: scale(8), 
                    paddingVertical: verticalScale(2), 
                    backgroundColor: 'rgba(245, 158, 11, 0.2)', 
                    borderRadius: moderateScale(4),
                    borderWidth: 1,
                    borderColor: '#F59E0B',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: scale(4)
                }}>
                    <Ionicons name="cloud-offline" size={normalizeFont(10)} color="#F59E0B" />
                    <Text style={{ color: '#F59E0B', fontSize: normalizeFont(10), fontWeight: '700' }}>OFFLINE MODE</Text>
                </View>
            )}
        </View>

        {/* Batch Toggle for labs */}
        {!!classData?.batch && (
          <TouchableOpacity 
            onPress={() => setBatchOverride(prev => prev === 'full' ? null : 'full')}
            style={styles.filterButton}
          >
            <Ionicons name="people-outline" size={normalizeFont(16)} color="#FFF" />
            <Text style={styles.filterText}>
              {batchLabel || 'All'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Stats & Actions */}
      <StatsBar counts={stats} onBulkAction={handleBulkAction} />

      {/* Grid */}
      <ManualAttendanceGrid
        students={students}
        onToggleStatus={handleToggle}
        onLongPress={setSelectedStudent}
        isDark={true}
      />

      {/* Floating Save Button */}
      {hasChanges && (
          <View style={[styles.fabContainer, { paddingBottom: insets.bottom + verticalScale(20) }]}>
            <TouchableOpacity 
                style={[styles.fab, isOfflineMode && { backgroundColor: '#FF9F0A' }]} 
                onPress={handleSubmit}
                disabled={submitting}
            >
                {submitting ? (
                    <ActivityIndicator color="#0D4A4A" />
                ) : (
                    <>
                        <Ionicons name={isOfflineMode ? "cloud-upload" : "save"} size={normalizeFont(20)} color="#0D4A4A" />
                        <Text style={styles.fabText}>{isOfflineMode ? 'Queue & Sync Later' : `Submit (${students.filter(s => s.status === 'absent').length} Absent)`}</Text>
                    </>
                )}
            </TouchableOpacity>
          </View>
      )}

      {/* Detailed Modal on Long Press */}
      <Modal
        visible={!!selectedStudent}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedStudent(null)}
      >
          <BlurView intensity={90} tint="dark" style={styles.modalOverlay}>
            {selectedStudent && (
                <View style={styles.modalCard}>
                    <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedStudent(null)}>
                        <Ionicons name="close" size={normalizeFont(24)} color="#FFF" />
                    </TouchableOpacity>
                    
                    <View style={styles.modalAvatarPlaceholder}>
                         <Text style={styles.modalAvatarText}>{selectedStudent.name[0]}</Text>
                    </View>
                    
                    <Text style={styles.modalName}>{selectedStudent.name}</Text>
                    <Text style={styles.modalRoll}>{selectedStudent.rollNo}</Text>
                    
                    <View style={[styles.modalStatusBadge, { 
                        backgroundColor: 
                            selectedStudent.status === 'present' ? '#10B981' : 
                            selectedStudent.status === 'absent' ? '#EF4444' : 
                            selectedStudent.status === 'od' ? '#F59E0B' : '#8B5CF6' 
                    }]}>
                        <Text style={styles.modalStatusText}>{selectedStudent.status.toUpperCase()}</Text>
                    </View>

                    <Text style={styles.modalInfo}>Batch: {selectedStudent.batch || 'N/A'}</Text>
                    <Text style={styles.modalInfo}>BLE UUID: {selectedStudent.bleUUID || 'Not Registered'}</Text>
                </View>
            )}
          </BlurView>
      </Modal>

      {/* Unsaved Changes Modal */}
      <Modal
        visible={showUnsavedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUnsavedModal(false)}
      >
          <BlurView intensity={90} tint="dark" style={styles.modalOverlay}>
            <View style={styles.modalCard}>
                <View style={[styles.modalAvatarPlaceholder, { backgroundColor: 'rgba(239, 68, 68, 0.15)', marginBottom: verticalScale(24) }]}>
                    <Ionicons name="alert-circle" size={normalizeFont(32)} color="#EF4444" />
                </View>
                
                <Text style={styles.modalName}>Unsaved Changes</Text>
                <Text style={[styles.modalRoll, { textAlign: 'center', marginBottom: verticalScale(24) }]}>
                    You have unsaved attendance marks. Are you sure you want to discard them?
                </Text>
                
                <View style={{ flexDirection: 'row', gap: scale(12), width: '100%' }}>
                    <TouchableOpacity 
                        style={[styles.bulkButton, { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1 }]}
                        onPress={() => setShowUnsavedModal(false)}
                    >
                        <Text style={[styles.bulkText, { color: '#FFF' }]}>Keep Editing</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                        style={[styles.bulkButton, { backgroundColor: '#EF4444', borderColor: '#EF4444', flex: 1.5 }]}
                        onPress={() => {
                            setShowUnsavedModal(false);
                            navigation.goBack();
                        }}
                    >
                        <Text style={[styles.bulkText, { color: '#FFF' }]}>Discard</Text>
                    </TouchableOpacity>
                </View>
            </View>
          </BlurView>
      </Modal>

      {/* Top Toast Notification */}
      <ZenToast
        visible={toast.visible}
        type={toast.type as any} // 'success' | 'error' match
        message={toast.message}
        onAction={toast.onRetry}
        actionLabel={toast.onRetry ? "Retry" : undefined}
        onHide={hideToast}
      />


    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: scale(16),
      paddingBottom: verticalScale(16),
      backgroundColor: 'rgba(0,0,0,0.2)',
  },
  iconButton: { padding: scale(8) },
  headerTitleContainer: { flex: 1, alignItems: 'center' },
  headerTitle: { color: '#FFF', fontSize: normalizeFont(18), fontWeight: '700' },
  headerSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: normalizeFont(12) },
  filterButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.15)',
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(6),
      borderRadius: moderateScale(20),
      gap: scale(6)
  },
  filterText: { color: '#FFF', fontWeight: '600', fontSize: normalizeFont(14) },
  
  // Stats
  statsContainer: {
      padding: scale(16),
      backgroundColor: 'rgba(0,0,0,0.1)',
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.05)'
  },
  statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: verticalScale(12),
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: scale(6) },
  statDot: { width: scale(8), height: scale(8), borderRadius: moderateScale(4) },
  statText: { color: 'rgba(255,255,255,0.8)', fontSize: normalizeFont(13) },
  statBold: { color: '#FFF', fontWeight: '700' },
  
  bulkActionsRow: {
      flexDirection: 'row',
      gap: scale(12),
  },
  bulkButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: verticalScale(8),
      borderRadius: moderateScale(8),
      borderWidth: 1,
      gap: scale(8)
  },
  bulkText: { fontWeight: '600', fontSize: normalizeFont(13) },

  // FAB
  fabContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      alignItems: 'center',
      justifyContent: 'center',
  },
  fab: {
      backgroundColor: '#3DDC97',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: scale(24),
      paddingVertical: verticalScale(14),
      borderRadius: moderateScale(30),
      gap: scale(8),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: verticalScale(4) },
      shadowOpacity: 0.3,
      shadowRadius: moderateScale(8),
      elevation: 6
  },
  fabText: { color: '#0D4A4A', fontWeight: 'bold', fontSize: normalizeFont(16) },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: scale(20) },
  modalCard: {
      width: '85%',
      backgroundColor: 'rgba(30,30,30,0.9)',
      borderRadius: moderateScale(24),
      padding: scale(24),
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)'
  },
  modalClose: { position: 'absolute', top: verticalScale(16), right: scale(16) },
  modalAvatarPlaceholder: {
      width: scale(64), height: scale(64), borderRadius: moderateScale(32),
      backgroundColor: 'rgba(255,255,255,0.1)',
      justifyContent: 'center', alignItems: 'center',
      marginBottom: verticalScale(16)
  },
  modalAvatarText: { color: '#FFF', fontSize: normalizeFont(24), fontWeight: 'bold' },
  modalName: { color: '#FFF', fontSize: normalizeFont(20), fontWeight: 'bold', marginBottom: verticalScale(4), textAlign: 'center' },
  modalRoll: { color: 'rgba(255,255,255,0.6)', fontSize: normalizeFont(16), marginBottom: verticalScale(16) },
  modalStatusBadge: {
      paddingHorizontal: scale(16),
      paddingVertical: verticalScale(6),
      borderRadius: moderateScale(20),
      marginBottom: verticalScale(20)
  },
  modalStatusText: { color: '#FFF', fontWeight: 'bold' },
  modalInfo: { color: 'rgba(255,255,255,0.5)', fontSize: normalizeFont(14), marginBottom: verticalScale(4) },
});
