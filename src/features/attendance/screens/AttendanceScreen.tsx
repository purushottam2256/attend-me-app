/**
 * Attendance Screen (Scan)
 * Take attendance with premium design
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts';
import { supabase } from '../../../config/supabase';
import { ZenToast } from '../../../components/ZenToast';
import { ConfirmationModal } from '../../../components/ConfirmationModal';
import { findCachedRoster, queueSubmission } from '../../../services/offlineService'; // Import cached roster and queue
import { useConnectionStatus } from '../../../hooks'; // Import connection status logic
import { 
  getTodaySchedule, 
  getStudentsForClass, 
  createAttendanceSession,
  submitAttendance,
  TimetableSlot, 
  Student 
} from '../../../services/dashboardService';

interface AttendanceRecord {
  studentId: string;
  status: 'present' | 'absent';
}

export const AttendanceScreen: React.FC = () => {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { status: connectionStatus } = useConnectionStatus(); // Get status explicitly
  const connectionStatusRef = useRef(connectionStatus);
  connectionStatusRef.current = connectionStatus;
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedClass, setSelectedClass] = useState<TimetableSlot | null>(null);
  const [classes, setClasses] = useState<TimetableSlot[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Map<string, 'present' | 'absent'>>(new Map());
  
  // UI State
  const [toast, setToast] = useState<{ visible: boolean, type: 'success' | 'error' | 'warning', message: string }>({ visible: false, type: 'success', message: '' });
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const showToast = (type: 'success' | 'error' | 'warning', message: string) => {
    setToast({ visible: true, type, message });
  };

  const loadClasses = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const data = await getTodaySchedule(user.id);
      setClasses(data);
      
      // Auto-select first class
      if (data.length > 0 && !selectedClass) {
        setSelectedClass(data[0]);
      }
    } catch (error) {
      console.error('Error loading classes:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedClass]);

  const loadStudents = useCallback(async () => {
    if (!selectedClass) return;
    
    try {
      // Try online fetch first if online
      let data: Student[] = [];
      let loadedFromCache = false;

      if (connectionStatusRef.current === 'online') {
          data = await getStudentsForClass(
            selectedClass.target_dept,
            selectedClass.target_year,
            selectedClass.target_section,
            selectedClass.batch
          );
      }

      // If online failed or offline, try cache
      if ((!data || data.length === 0) || connectionStatusRef.current !== 'online') {
         // Load from cache using robust lookup (Department, Year, Section)
         // Assuming slot_id might not match cache key mechanism, use class details.
         if (selectedClass) {
             console.log(`Loading roster from cache for ${selectedClass.target_dept}-${selectedClass.target_year}-${selectedClass.target_section}`);
             const cachedRoster = await findCachedRoster(
                 selectedClass.target_dept, 
                 selectedClass.target_year, 
                 selectedClass.target_section
             );
         if (cachedRoster && cachedRoster.students) {
             data = cachedRoster.students.map(s => ({
                 id: s.id,
                 roll_no: s.rollNo,
                 full_name: s.name,
                 bluetooth_uuid: s.bluetoothUUID,
                 batch: s.batch
             }));
             loadedFromCache = true;
         }
         }
      }

      setStudents(data);
      
      // Initialize all as present
      const newAttendance = new Map<string, 'present' | 'absent'>();
      data.forEach(student => newAttendance.set(student.id, 'present'));
      setAttendance(newAttendance);
      
      if (loadedFromCache) {
          showToast('warning', 'Offline Mode: Loaded cached roster');
      }

    } catch (error) {
      console.error('Error loading students:', error);
      showToast('error', 'Failed to load students');
    }
  }, [selectedClass]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    if (selectedClass) {
      loadStudents();
    }
  }, [selectedClass, loadStudents]);

  const toggleAttendance = (studentId: string) => {
    setAttendance(prev => {
      const newMap = new Map(prev);
      newMap.set(studentId, prev.get(studentId) === 'present' ? 'absent' : 'present');
      return newMap;
    });
  };

  const markAll = (status: 'present' | 'absent') => {
    const newAttendance = new Map<string, 'present' | 'absent'>();
    students.forEach(student => newAttendance.set(student.id, status));
    setAttendance(newAttendance);
  };

  const handleSubmit = async () => {
    if (!selectedClass) return;
    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    setShowConfirmModal(false);
    
    if (!selectedClass) return;

    const records: AttendanceRecord[] = [];
    attendance.forEach((status, studentId) => {
      records.push({ studentId, status });
    });

    setSubmitting(true);
    try {
      // OFFLINE SUBMISSION
      if (connectionStatusRef.current !== 'online') {
          // Queue submission
          try {
              await queueSubmission({
                  classData: {
                      slotId: selectedClass.slot_id || '0',
                      subjectName: selectedClass.subject?.name || 'Unknown',
                      subjectId: selectedClass.subject?.id,
                      dept: selectedClass.target_dept,
                      year: selectedClass.target_year,
                      sectionLetter: selectedClass.target_section,
                      section: `${selectedClass.target_dept}-${selectedClass.target_year}-${selectedClass.target_section}`,
                  },
                  attendance: records,
                  submittedAt: new Date().toISOString(),
                  id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  retryCount: 0,
              });
              
              showToast('success', 'Attendance Saved Offline (Will sync when online)');
              // Clear selection or stay? Maybe stay to confirm.
              // Logic usually clears or refreshes.
              setSelectedClass(null); // Return to class list
          } catch (err) {
              showToast('error', 'Failed to save offline attendance');
              console.error(err);
          }
          return;
      }
      
      // ONLINE SUBMISSION
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { sessionId, error: sessionError } = await createAttendanceSession(
        user.id,
        selectedClass.subject.id,
        selectedClass.slot_id,
        selectedClass.target_dept,
        selectedClass.target_year,
        selectedClass.target_section,
        students.length,
        selectedClass.batch
      );

      if (sessionError || !sessionId) {
        showToast('error', sessionError || 'Failed to create session');
        return;
      }

      const { success, error } = await submitAttendance(sessionId, user.id, records);
      
      if (success) {
        showToast('success', 'Attendance submitted successfully!');
        loadClasses();
      } else {
        showToast('error', error || 'Failed to submit attendance');
      }
    } catch (error) {
      showToast('error', 'An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const presentCount = Array.from(attendance.values()).filter(s => s === 'present').length;
  const absentCount = students.length - presentCount;

  const renderHeader = () => (
    <LinearGradient
      colors={['#166534', '#15803D', '#22C55E']}
      style={[styles.header, { paddingTop: insets.top + 16 }]}
    >
      <View style={styles.headerContent}>
        <Text style={styles.headerTitle}>Take Attendance</Text>
        {selectedClass && (
          <View style={styles.headerClassInfo}>
            <Text style={styles.headerSubject}>{selectedClass.subject?.name}</Text>
            <Text style={styles.headerClass}>
              {selectedClass.target_dept}-{selectedClass.target_year}-{selectedClass.target_section}
            </Text>
          </View>
        )}
      </View>
    </LinearGradient>
  );

  const renderClassSelector = () => (
    <View style={styles.classSelectorContainer}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.selectorScroll}
      >
        {classes.map((cls, index) => (
          <TouchableOpacity
            key={cls.id || index}
            style={[
              styles.classChip,
              { 
                backgroundColor: selectedClass?.id === cls.id 
                  ? '#166534' 
                  : isDark ? '#334155' : '#F1F5F9'
              }
            ]}
            onPress={() => setSelectedClass(cls)}
          >
            <Text style={[
              styles.classChipText,
              { 
                color: selectedClass?.id === cls.id 
                  ? '#FFFFFF' 
                  : isDark ? '#94A3B8' : '#64748B'
              }
            ]}>
              {cls.subject?.code || cls.slot_id}
            </Text>
            <Text style={[
              styles.classChipTime,
              { 
                color: selectedClass?.id === cls.id 
                  ? 'rgba(255,255,255,0.8)' 
                  : isDark ? '#64748B' : '#94A3B8'
              }
            ]}>
              {cls.start_time}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderStats = () => (
    <View style={styles.statsContainer}>
      <View style={[styles.statCard, { backgroundColor: '#DCFCE7' }]}>
        <Text style={[styles.statValue, { color: '#166534' }]}>{presentCount}</Text>
        <Text style={[styles.statLabel, { color: '#166534' }]}>Present</Text>
      </View>
      <View style={[styles.statCard, { backgroundColor: '#FEE2E2' }]}>
        <Text style={[styles.statValue, { color: '#DC2626' }]}>{absentCount}</Text>
        <Text style={[styles.statLabel, { color: '#DC2626' }]}>Absent</Text>
      </View>
      <View style={[styles.statCard, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}>
        <Text style={[styles.statValue, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
          {students.length}
        </Text>
        <Text style={[styles.statLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Total</Text>
      </View>
    </View>
  );

  const renderBulkActions = () => (
    <View style={styles.bulkActions}>
      <TouchableOpacity 
        style={[styles.bulkButton, { backgroundColor: '#DCFCE7' }]}
        onPress={() => markAll('present')}
      >
        <Ionicons name="checkmark-circle" size={18} color="#166534" />
        <Text style={[styles.bulkButtonText, { color: '#166534' }]}>All Present</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.bulkButton, { backgroundColor: '#FEE2E2' }]}
        onPress={() => markAll('absent')}
      >
        <Ionicons name="close-circle" size={18} color="#DC2626" />
        <Text style={[styles.bulkButtonText, { color: '#DC2626' }]}>All Absent</Text>
      </TouchableOpacity>
    </View>
  );

  const renderStudent = (student: Student, index: number) => {
    const status = attendance.get(student.id) || 'present';
    const isPresent = status === 'present';

    return (
      <TouchableOpacity
        key={student.id || index}
        style={[
          styles.studentCard,
          { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' },
          isPresent ? styles.studentPresent : styles.studentAbsent,
        ]}
        onPress={() => toggleAttendance(student.id)}
        activeOpacity={0.7}
      >
        <View style={styles.studentInfo}>
          <Text style={[styles.studentRoll, { color: isDark ? '#94A3B8' : '#64748B' }]}>
            {student.roll_no}
          </Text>
          <Text style={[styles.studentName, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
            {student.full_name}
          </Text>
        </View>
        <View style={[
          styles.statusToggle,
          { backgroundColor: isPresent ? '#22C55E' : '#EF4444' }
        ]}>
          <Ionicons 
            name={isPresent ? 'checkmark' : 'close'} 
            size={20} 
            color="#FFFFFF" 
          />
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
        <ActivityIndicator size="large" color="#166534" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
      {renderHeader()}
      
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {classes.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
            <Ionicons name="calendar-outline" size={48} color={isDark ? '#475569' : '#CBD5E1'} />
            <Text style={[styles.emptyText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              No classes scheduled for today
            </Text>
          </View>
        ) : (
          <>
            {renderClassSelector()}
            {renderStats()}
            {renderBulkActions()}
            
            <View style={styles.studentList}>
              {students.map((student, index) => renderStudent(student, index))}
            </View>
          </>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Submit Button */}
      {students.length > 0 && (
        <View style={[styles.submitContainer, { paddingBottom: insets.bottom + 90 }]}>
          <TouchableOpacity 
            style={styles.submitButton}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="cloud-upload" size={20} color="#FFFFFF" />
                <Text style={styles.submitText}>Submit Attendance</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
      {/* Modal and Toast */}
      <ConfirmationModal
        visible={showConfirmModal}
        title="Submit Attendance"
        message={`Mark ${presentCount} present and ${absentCount} absent?`}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowConfirmModal(false)}
        confirmLabel="Submit"
        isDark={isDark}
      />

      <ZenToast
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onHide={() => setToast(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  headerContent: {
    gap: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerClassInfo: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  headerSubject: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  headerClass: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  classSelectorContainer: {
    marginBottom: 16,
  },
  selectorScroll: {
    gap: 8,
  },
  classChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  classChipText: {
    fontSize: 15,
    fontWeight: '700',
  },
  classChipTime: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  bulkActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  bulkButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  bulkButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  studentList: {
    gap: 8,
  },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  studentPresent: {
    borderLeftColor: '#22C55E',
  },
  studentAbsent: {
    borderLeftColor: '#EF4444',
  },
  studentInfo: {
    flex: 1,
  },
  studentRoll: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 2,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCard: {
    padding: 40,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 16,
    textAlign: 'center',
  },
  submitContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#166534',
    paddingVertical: 16,
    borderRadius: 14,
    shadowColor: '#166534',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});

export default AttendanceScreen;
