/**
 * CompletedClassModal
 * 
 * Shows details of a completed class with option to take late attendance
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface CompletedClassModalProps {
  visible: boolean;
  classData: {
    id: string;
    subject?: { name: string; code: string };
    target_dept?: string;
    target_year?: number;
    target_section?: string;
    room?: string;
    start_time?: string;
    end_time?: string;
    slot_name?: string;
    status?: string;
    attendanceCount?: number;
    totalStudents?: number;
  } | null;
  onClose: () => void;
  onLateAttendance: () => void;
  onViewDetails: () => void;
  isDark: boolean;
}

export const CompletedClassModal = ({
  visible,
  classData,
  onClose,
  onLateAttendance,
  onViewDetails,
  isDark,
}: CompletedClassModalProps) => {
  const insets = useSafeAreaInsets();

  if (!classData) return null;

  const formatTime = (time?: string) => {
    if (!time) return '--:--';
    const [hour, min] = time.split(':');
    const h = parseInt(hour);
    const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const amPm = h >= 12 ? 'PM' : 'AM';
    return `${displayHour}:${min} ${amPm}`;
  };

  const attendancePercent = classData.attendanceCount && classData.totalStudents
    ? Math.round((classData.attendanceCount / classData.totalStudents) * 100)
    : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <BlurView intensity={20} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          
          <TouchableWithoutFeedback>
            <View style={[
              styles.modalContainer,
              { 
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                paddingBottom: insets.bottom + 20,
              }
            ]}>
              {/* Header with gradient */}
              <LinearGradient
                colors={['#10B981', '#059669']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.header}
              >
                <View style={styles.headerContent}>
                  <View style={styles.statusBadge}>
                    <Ionicons name="checkmark-circle" size={16} color="#FFF" />
                    <Text style={styles.statusText}>Completed</Text>
                  </View>
                  <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                    <Ionicons name="close" size={20} color="rgba(255,255,255,0.8)" />
                  </TouchableOpacity>
                </View>
                
                <Text style={styles.subjectName}>
                  {classData.subject?.name || 'Unknown Subject'}
                </Text>
                <Text style={styles.subjectCode}>
                  {classData.subject?.code || '---'}
                </Text>
              </LinearGradient>

              {/* Class Details */}
              <View style={styles.detailsContainer}>
                <View style={styles.detailRow}>
                  <View style={[styles.detailIcon, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#DCFCE7' }]}>
                    <Ionicons name="people" size={18} color="#10B981" />
                  </View>
                  <View style={styles.detailTextContainer}>
                    <Text style={[styles.detailLabel, isDark && { color: '#94A3B8' }]}>Section</Text>
                    <Text style={[styles.detailValue, isDark && { color: '#E2E8F0' }]}>
                      {classData.target_dept}-{classData.target_year}-{classData.target_section}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <View style={[styles.detailIcon, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : '#DBEAFE' }]}>
                    <Ionicons name="time" size={18} color="#3B82F6" />
                  </View>
                  <View style={styles.detailTextContainer}>
                    <Text style={[styles.detailLabel, isDark && { color: '#94A3B8' }]}>Time</Text>
                    <Text style={[styles.detailValue, isDark && { color: '#E2E8F0' }]}>
                      {formatTime(classData.start_time)} - {formatTime(classData.end_time)}
                    </Text>
                  </View>
                </View>

                {classData.room && (
                  <View style={styles.detailRow}>
                    <View style={[styles.detailIcon, { backgroundColor: isDark ? 'rgba(168, 85, 247, 0.1)' : '#F3E8FF' }]}>
                      <Ionicons name="location" size={18} color="#A855F7" />
                    </View>
                    <View style={styles.detailTextContainer}>
                      <Text style={[styles.detailLabel, isDark && { color: '#94A3B8' }]}>Room</Text>
                      <Text style={[styles.detailValue, isDark && { color: '#E2E8F0' }]}>
                        {classData.room}
                      </Text>
                    </View>
                  </View>
                )}

                {attendancePercent !== null && (
                  <View style={styles.attendanceCard}>
                    <View style={styles.attendanceHeader}>
                      <Text style={[styles.attendanceLabel, isDark && { color: '#94A3B8' }]}>
                        Attendance
                      </Text>
                      <Text style={[styles.attendancePercent, { color: attendancePercent >= 75 ? '#10B981' : '#EF4444' }]}>
                        {attendancePercent}%
                      </Text>
                    </View>
                    <View style={[styles.progressBarBg, isDark && { backgroundColor: '#334155' }]}>
                      <View 
                        style={[
                          styles.progressBarFill, 
                          { 
                            width: `${attendancePercent}%`,
                            backgroundColor: attendancePercent >= 75 ? '#10B981' : '#EF4444'
                          }
                        ]} 
                      />
                    </View>
                    <Text style={[styles.attendanceCount, isDark && { color: '#64748B' }]}>
                      {classData.attendanceCount} of {classData.totalStudents} present
                    </Text>
                  </View>
                )}
              </View>

              {/* Actions */}
              <View style={styles.actionsContainer}>
                <TouchableOpacity 
                  style={[styles.actionButton, styles.secondaryButton, isDark && { backgroundColor: '#334155' }]}
                  onPress={onViewDetails}
                >
                  <Ionicons name="list" size={20} color={isDark ? '#E2E8F0' : '#475569'} />
                  <Text style={[styles.actionButtonText, styles.secondaryButtonText, isDark && { color: '#E2E8F0' }]}>
                    View Details
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.actionButton, styles.primaryButton]}
                  onPress={onLateAttendance}
                >
                  <LinearGradient
                    colors={['#F97316', '#EA580C']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.gradientButton}
                  >
                    <Ionicons name="add-circle" size={20} color="#FFF" />
                    <Text style={styles.primaryButtonText}>Late Attendance</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  header: {
    padding: 20,
    paddingTop: 16,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 4,
  },
  subjectCode: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
  },
  detailsContainer: {
    padding: 20,
    gap: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  detailIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTextContainer: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  attendanceCard: {
    marginTop: 8,
    padding: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    borderRadius: 12,
  },
  attendanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  attendanceLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  attendancePercent: {
    fontSize: 20,
    fontWeight: '800',
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  attendanceCount: {
    fontSize: 12,
    color: '#94A3B8',
  },
  actionsContainer: {
    flexDirection: 'row',
    padding: 20,
    paddingTop: 0,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 14,
    gap: 8,
  },
  primaryButton: {
    flex: 1.2,
  },
  gradientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#475569',
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
