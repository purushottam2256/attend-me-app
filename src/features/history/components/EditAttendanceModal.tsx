/**
 * EditAttendanceModal - Edit attendance within 24 hours
 * Features:
 * - Roster list with swipe/tap to toggle
 * - WhatsApp text format export
 * - JSON, PDF, Excel export with filters
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  Share,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts';
import { supabase } from '../../../config/supabase';
import { ZenToast } from '../../../components/ZenToast';

// Types
interface Student {
  id: string;
  rollNumber: string;
  fullRollNumber: string; // e.g., 22Q91A6612
  name: string;
  status: 'present' | 'absent' | 'od' | 'leave';
}

interface SessionInfo {
  id: string;
  subject: string;
  subjectCode: string;
  section: string; // e.g., "4-CSM-B"
  date: Date;
  time: string;
  total: number;
}

interface EditAttendanceModalProps {
  visible: boolean;
  onClose: () => void;
  session: SessionInfo | null;
  students: Student[];
  onSave: (updatedStudents: Student[]) => void;
}

type FilterType = 'all' | 'present' | 'absent' | 'od';

export const EditAttendanceModal: React.FC<EditAttendanceModalProps> = ({
  visible,
  onClose,
  session,
  students: initialStudents,
  onSave,
}) => {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Toast State
  const [toast, setToast] = useState<{ visible: boolean, type: 'success' | 'error', message: string }>({ visible: false, type: 'success', message: '' });

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ visible: true, type, message });
  };

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setStudents(initialStudents);
      setSearchQuery('');
      setFilter('all');
      setHasChanges(false);
      setToast(prev => ({ ...prev, visible: false }));
    }
  }, [visible, initialStudents]);

  // Colors
  const colors = {
    background: isDark ? '#0A0A0A' : '#F8FAFC',
    cardBg: isDark ? 'rgba(30, 41, 59, 0.9)' : '#FFFFFF',
    cardBorder: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
    textPrimary: isDark ? '#FFFFFF' : '#0F172A',
    textSecondary: isDark ? 'rgba(255,255,255,0.7)' : '#64748B',
    textMuted: isDark ? 'rgba(255,255,255,0.4)' : '#94A3B8',
    inputBg: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
    present: '#22C55E',
    absent: '#EF4444',
    od: '#F59E0B',
    leave: '#8B5CF6',
    accent: '#3DDC97',
  };

  // Extract short roll number
  const getShortRoll = (fullRoll: string): string => {
    // 22Q91A6612 -> 12, LE-1 stays as LE-1
    if (fullRoll.startsWith('LE') || fullRoll.startsWith('le')) {
      return fullRoll.toUpperCase();
    }
    return fullRoll.slice(-2);
  };

  // Toggle student status - Faculty can only toggle Present/Absent
  const toggleStatus = (studentId: string) => {
    setStudents(prev => prev.map(s => {
      if (s.id === studentId) {
        // Only toggle between present and absent for faculty
        return { ...s, status: s.status === 'present' ? 'absent' : 'present' };
      }
      return s;
    }));
    setHasChanges(true);
  };

  // Quick toggle between present/absent only
  const quickToggle = (studentId: string) => {
    setStudents(prev => prev.map(s => {
      if (s.id === studentId) {
        return { ...s, status: s.status === 'present' ? 'absent' : 'present' };
      }
      return s;
    }));
    setHasChanges(true);
  };

  // Get counts
  const getCounts = () => {
    const present = students.filter(s => s.status === 'present').length;
    const absent = students.filter(s => s.status === 'absent').length;
    const od = students.filter(s => s.status === 'od').length;
    const leave = students.filter(s => s.status === 'leave').length;
    return { present, absent, od, leave, total: students.length };
  };

  const counts = getCounts();

  // Filter students
  const filteredStudents = students.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          s.rollNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          s.fullRollNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === 'all' || s.status === filter;
    return matchesSearch && matchesFilter;
  });

  // Format date for display
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  // Generate WhatsApp text
  const generateWhatsAppText = (): string => {
    if (!session) return '';

    const presentStudents = students
      .filter(s => s.status === 'present')
      .map(s => getShortRoll(s.fullRollNumber))
      .sort((a, b) => {
        // Sort LE students after regular students
        if (a.startsWith('LE') && !b.startsWith('LE')) return 1;
        if (!a.startsWith('LE') && b.startsWith('LE')) return -1;
        return parseInt(a.replace('LE-', '')) - parseInt(b.replace('LE-', ''));
      })
      .join(', ');

    const absentStudents = students
      .filter(s => s.status === 'absent')
      .map(s => getShortRoll(s.fullRollNumber))
      .sort((a, b) => {
        if (a.startsWith('LE') && !b.startsWith('LE')) return 1;
        if (!a.startsWith('LE') && b.startsWith('LE')) return -1;
        return parseInt(a.replace('LE-', '')) - parseInt(b.replace('LE-', ''));
      })
      .join(', ');

    const odStudents = students
      .filter(s => s.status === 'od')
      .map(s => getShortRoll(s.fullRollNumber))
      .join(', ');

    let text = `📚 ${session.section} Attendance\n`;
    text += `📅 ${formatDate(session.date)}\n`;
    text += `🕐 ${session.time}\n`;
    text += `📖 ${session.subject}\n\n`;
    text += `✅ Present (${counts.present}):\n${presentStudents || 'None'}\n\n`;
    text += `❌ Absent (${counts.absent}):\n${absentStudents || 'None'}`;
    
    if (odStudents) {
      text += `\n\n🔶 OD (${counts.od}):\n${odStudents}`;
    }

    return text;
  };

  // Share WhatsApp text
  const shareWhatsApp = async () => {
    const text = generateWhatsAppText();
    try {
      await Share.share({
        message: text,
        title: `Attendance - ${session?.section}`,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  // Note: Export functionality moved to ExportModal in HistoryScreen

  // Save changes to Supabase
  const handleSave = async () => {
    if (!session) {
      showToast('error', 'No session selected');
      return;
    }
    if (!hasChanges) {
      onClose();
      return;
    }
    
    try {
      // Prepare the updates for attendance_logs table
      const updates = students.map(student => ({
        session_id: session.id,
        student_id: student.id,
        status: student.status,
        is_modified: true,
        modified_at: new Date().toISOString(),
      }));
      
      console.log('[EditAttendanceModal] Saving updates:', updates.length, 'records');
      
      // Upsert to attendance_logs
      const { error, data } = await supabase
        .from('attendance_logs')
        .upsert(updates, {
          onConflict: 'session_id,student_id',
        })
        .select();
      
      if (error) {
        console.error('[EditAttendanceModal] Upsert error:', error);
        throw error;
      }
      
      console.log('[EditAttendanceModal] Upsert success, updated:', data?.length || 0);
      
      // Update session counts
      const counts = getCounts();
      const { error: sessionError } = await supabase
        .from('attendance_sessions')
        .update({
          present_count: counts.present,
          absent_count: counts.absent,
          od_count: counts.od,
          leave_count: counts.leave,
          is_modified: true,
          modified_at: new Date().toISOString(),
        })
        .eq('id', session.id);
      
      if (sessionError) {
        console.error('[EditAttendanceModal] Session update error:', sessionError);
        throw sessionError;
      }
      
      // Call parent callback and close - Success alert removed (handled by parent)
      onSave(students);
      onClose();
    } catch (error: any) {
      console.error('[EditAttendanceModal] Save error:', error);
      showToast('error', error.message || 'Failed to save attendance');
    }
  };

  // Render student item
  const renderStudent = ({ item }: { item: Student }) => {
    const statusColors = {
      present: colors.present,
      absent: colors.absent,
      od: colors.od,
      leave: colors.leave,
    };

    const statusIcons = {
      present: 'checkmark-circle',
      absent: 'close-circle',
      od: 'document-text',
      leave: 'calendar',
    };

    return (
      <TouchableOpacity
        style={[styles.studentCard, { 
          backgroundColor: colors.cardBg,
          borderLeftColor: statusColors[item.status],
        }]}
        onPress={() => quickToggle(item.id)}
        onLongPress={() => toggleStatus(item.id)}
        activeOpacity={0.7}
      >
        {/* Avatar placeholder */}
        <View style={[styles.avatar, { 
          backgroundColor: statusColors[item.status] + '20',
          borderColor: statusColors[item.status],
        }]}>
          <Text style={[styles.avatarText, { color: statusColors[item.status] }]}>
            {item.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </Text>
        </View>
        
        <View style={styles.studentInfo}>
          <Text style={[styles.rollNumber, { color: colors.textPrimary }]}>
            {getShortRoll(item.fullRollNumber)}
          </Text>
          <View style={styles.studentDetails}>
            <Text style={[styles.studentName, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.fullRoll, { color: colors.textMuted }]}>
              {item.fullRollNumber}
            </Text>
          </View>
        </View>
        
        <TouchableOpacity
          style={[styles.statusBadge, { backgroundColor: statusColors[item.status] + '20' }]}
          onPress={() => toggleStatus(item.id)}
        >
          <Ionicons 
            name={statusIcons[item.status] as any} 
            size={18} 
            color={statusColors[item.status]} 
          />
          <Text style={[styles.statusText, { color: statusColors[item.status] }]}>
            {item.status.toUpperCase()}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // Render export menu
  const renderExportMenu = () => (
    <Modal visible={showExportMenu} transparent animationType="fade">
      <TouchableOpacity 
        style={styles.exportOverlay} 
        activeOpacity={1}
        onPress={() => setShowExportMenu(false)}
      >
        <View style={[styles.exportMenu, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.exportTitle, { color: colors.textPrimary }]}>
            Export Options
          </Text>

          {/* Export Filters */}
          <View style={styles.exportSection}>
            <Text style={[styles.exportLabel, { color: colors.textSecondary }]}>
              Download By:
            </Text>
            <View style={styles.filterChips}>
              {(['all', 'present', 'absent', 'od'] as FilterType[]).map(f => (
                <TouchableOpacity
                  key={f}
                  style={[
                    styles.filterChip,
                    { backgroundColor: filter === f ? colors.accent : colors.inputBg }
                  ]}
                  onPress={() => setFilter(f)}
                >
                  <Text style={{ 
                    color: filter === f ? '#000' : colors.textSecondary,
                    fontWeight: '600',
                    fontSize: 12,
                  }}>
                    {f.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Export Buttons */}
          <View style={styles.exportButtons}>
            <TouchableOpacity
              style={[styles.exportBtn, { backgroundColor: '#25D366' }]}
              onPress={() => { shareWhatsApp(); setShowExportMenu(false); }}
            >
              <Ionicons name="logo-whatsapp" size={20} color="#FFF" />
              <Text style={styles.exportBtnText}>WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.exportBtn, { backgroundColor: '#4285F4' }]}
              onPress={() => { 
                showToast('error', 'Use the Export button on History screen');
                setShowExportMenu(false); 
              }}
            >
              <Ionicons name="code-slash" size={20} color="#FFF" />
              <Text style={styles.exportBtnText}>JSON</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.exportBtn, { backgroundColor: '#217346' }]}
              onPress={() => { 
                showToast('error', 'Use the Export button on History screen');
                setShowExportMenu(false); 
              }}
            >
              <Ionicons name="grid" size={20} color="#FFF" />
              <Text style={styles.exportBtnText}>Excel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.exportBtn, { backgroundColor: '#E53935' }]}
              onPress={() => { 
                showToast('error', 'PDF generation coming soon!');
                setShowExportMenu(false); 
              }}
            >
              <Ionicons name="document-text" size={20} color="#FFF" />
              <Text style={styles.exportBtnText}>PDF</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.closeExportBtn, { backgroundColor: colors.inputBg }]}
            onPress={() => setShowExportMenu(false)}
          >
            <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  if (!session) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              Edit Attendance
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              {session.section} • {formatDate(session.date)}
            </Text>
          </View>

          <TouchableOpacity 
            onPress={handleSave} 
            style={[styles.headerBtn, { opacity: hasChanges ? 1 : 0.5 }]}
            disabled={!hasChanges}
          >
            <Ionicons name="checkmark" size={24} color={colors.accent} />
          </TouchableOpacity>
        </View>

        {/* Stats Bar */}
        <View style={[styles.statsBar, { backgroundColor: colors.cardBg }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.present }]}>{counts.present}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Present</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.absent }]}>{counts.absent}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Absent</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.od }]}>{counts.od}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>OD</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.textPrimary }]}>{counts.total}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total</Text>
          </View>
        </View>

        {/* Search & Filter */}
        <View style={styles.searchSection}>
          <View style={[styles.searchBar, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="Search by name or roll..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <View style={styles.filterRow}>
            {(['all', 'present', 'absent', 'od'] as FilterType[]).map(f => (
              <TouchableOpacity
                key={f}
                style={[
                  styles.filterBtn,
                  { 
                    backgroundColor: filter === f ? colors.accent : colors.inputBg,
                    borderColor: filter === f ? colors.accent : 'transparent',
                  }
                ]}
                onPress={() => setFilter(f)}
              >
                <Text style={{ 
                  color: filter === f ? '#000' : colors.textSecondary,
                  fontWeight: '600',
                  fontSize: 12,
                }}>
                  {f === 'all' ? 'ALL' : f.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Tip */}
        <View style={[styles.tipBar, { backgroundColor: colors.inputBg }]}>
          <Ionicons name="bulb-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.tipText, { color: colors.textMuted }]}>
            Tap to toggle Present/Absent • Long press for more options
          </Text>
        </View>

        {/* Student List */}
        <FlatList
          data={filteredStudents}
          renderItem={renderStudent}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />

        {/* Bottom Actions - Just Save */}
        <View style={[styles.bottomBar, { 
          paddingBottom: insets.bottom + 16,
          backgroundColor: colors.cardBg,
          borderTopColor: colors.cardBorder,
        }]}>
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: hasChanges ? colors.accent : colors.inputBg }]}
            onPress={handleSave}
            disabled={!hasChanges}
          >
            <Ionicons name="checkmark-circle" size={20} color={hasChanges ? '#000' : colors.textMuted} />
            <Text style={[styles.saveButtonText, { color: hasChanges ? '#000' : colors.textMuted }]}>Save Changes</Text>
          </TouchableOpacity>
        </View>

        {renderExportMenu()}

        {/* Toast Notification */}
        <ZenToast
          visible={toast.visible}
          type={toast.type}
          message={toast.message}
          onHide={() => setToast(prev => ({ ...prev, visible: false }))}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    marginHorizontal: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  searchSection: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  tipBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  tipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderLeftWidth: 4,
  },
  studentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  rollNumber: {
    fontSize: 18,
    fontWeight: '700',
    width: 36,
    textAlign: 'center',
  },
  studentDetails: {
    flex: 1,
  },
  studentName: {
    fontSize: 15,
    fontWeight: '600',
  },
  fullRoll: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
  },
  exportButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  exportOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  exportMenu: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  exportTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  exportSection: {
    marginBottom: 20,
  },
  exportLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  filterChips: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  exportButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    width: '47%',
    justifyContent: 'center',
  },
  exportBtnText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  closeExportBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    marginRight: 12,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
  },
});

export default EditAttendanceModal;
