import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  TextInput, ActivityIndicator, KeyboardAvoidingView, 
  Platform, Alert, Animated, Easing
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts';
import { Colors } from '../../../constants';
import { LinearGradient } from 'expo-linear-gradient';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { ZenToast } from '../../../components/ZenToast';
import { useConnectionStatus } from '../../../hooks';
import { projectFeesService, ProjectFee, ProjectFeeStudent } from '../services/projectFeesService';
import { supabase } from '../../../config/supabase';

interface ProjectFeesScreenProps {
  navigation: any;
  route: any;
}

export const ProjectFeesScreen: React.FC<ProjectFeesScreenProps> = ({ navigation, route }) => {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { status: connectionStatus } = useConnectionStatus();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<ProjectFee[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectFee | null>(null);
  
  const [students, setStudents] = useState<ProjectFeeStudent[]>([]);
  const [originalStudents, setOriginalStudents] = useState<ProjectFeeStudent[]>([]);
  
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'warning' | 'error' });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  // Track which student cards have their reason section expanded
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  
  // Faculty class context
  const [facultyDept, setFacultyDept] = useState('');
  const [facultyYear, setFacultyYear] = useState<number>(0);
  const [facultySection, setFacultySection] = useState('');

  // Dropdown animation
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadClassContextAndProjects();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (!hasUnsavedChanges) {
         return;
      }
      e.preventDefault();
      
      Alert.alert(
        'Discard changes?',
        'You have unsaved fee changes. Are you sure to discard them and leave the screen?',
        [
          { text: "Don't leave", style: 'cancel', onPress: () => {} },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]
      );
    });
    return unsubscribe;
  }, [navigation, hasUnsavedChanges]);

  const loadClassContextAndProjects = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
         throw new Error("No user found");
      }
      
      // Get the faculty's assigned class incharge details
      const { data: inchargeData, error: inchargeError } = await supabase
        .from('class_incharges')
        .select('id, faculty_id, dept, year, section, is_active')
        .eq('faculty_id', user.id)
        .eq('is_active', true)
        .single();
        
      if (inchargeError || !inchargeData) {
         setLoading(false);
         showToast("You are not currently assigned as a class incharge.", "warning");
         return;
      }
      
      setFacultyDept(inchargeData.dept);
      setFacultyYear(inchargeData.year);
      setFacultySection(inchargeData.section);
      
      // Load projects for this class
      const fees = await projectFeesService.getAvailableProjectsForClass(
          inchargeData.dept, 
          inchargeData.year, 
          inchargeData.section
      );
      
      setProjects(fees);
      if (fees.length > 0) {
        handleSelectProject(fees[0], inchargeData.dept, inchargeData.year, inchargeData.section);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      showToast("Error loading project fees. Please try again.", "error");
      setLoading(false);
    }
  };

  const handleSelectProject = async (project: ProjectFee, dept = facultyDept, year = facultyYear, section = facultySection) => {
      // Check unsaved changes before switching
      if (hasUnsavedChanges) {
          Alert.alert(
            'Unsaved Changes',
            'You have unsaved changes. Please save or discard them before switching projects.',
            [{ text: 'OK' }]
          );
          setIsDropdownOpen(false);
          return;
      }
      
      setSelectedProject(project);
      setIsDropdownOpen(false);
      setLoading(true);
      
      try {
        const studentList = await projectFeesService.getProjectFeeStudents(project.id, dept, year, section);
        setStudents(studentList);
        // Deep copy for comparing later
        setOriginalStudents(JSON.parse(JSON.stringify(studentList)));
        setHasUnsavedChanges(false);
      } catch (err) {
        console.error(err);
        showToast("Error loading student fees. Please try again.", "error");
      } finally {
        setLoading(false);
      }
  };

  const showToast = (message: string, type: 'success' | 'warning' | 'error' = 'success') => {
    setToast({ visible: true, message, type });
  };

  const toggleDropdown = () => {
    if (isDropdownOpen) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }).start(() => setIsDropdownOpen(false));
    } else {
      setIsDropdownOpen(true);
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }).start();
    }
  };

  const updateStudentStatus = (id: string, newStatus: 'paid' | 'due') => {
      setStudents(prev => {
          const updated = prev.map(s => s.student_id === id ? { ...s, status: newStatus } : s);
          checkUnsavedChanges(updated);
          return updated;
      });
      // Auto-expand reason section if marked due
      if (newStatus === 'due') {
        setExpandedStudentId(id);
      } else {
        if (expandedStudentId === id) setExpandedStudentId(null);
      }
  };

  const updateStudentReason = (id: string, newReason: string) => {
      setStudents(prev => {
          const updated = prev.map(s => s.student_id === id ? { ...s, reason: newReason } : s);
          checkUnsavedChanges(updated);
          return updated;
      });
  };
  
  const checkUnsavedChanges = (currentList: ProjectFeeStudent[]) => {
      const isChanged = JSON.stringify(currentList) !== JSON.stringify(originalStudents);
      setHasUnsavedChanges(isChanged);
  };

  const handleSave = async () => {
      if (!selectedProject || !hasUnsavedChanges) return;
      
      setSaving(true);
      try {
          const updates = students.map(s => ({
              student_id: s.student_id,
              status: s.status,
              reason: s.reason || ''
          }));
          
          await projectFeesService.bulkUpdateStudentFeeStatus(selectedProject.id, updates);
          
          // Reset state
          setOriginalStudents(JSON.parse(JSON.stringify(students)));
          setHasUnsavedChanges(false);
          showToast("Changes saved successfully!");
      } catch (err) {
          console.error("Save error:", err);
          showToast("Failed to save changes. Please try again.", "error");
      } finally {
          setSaving(false);
      }
  };

  const toggleExpanded = (id: string) => {
    setExpandedStudentId(prev => prev === id ? null : id);
  };

  const renderStudentItem = React.useCallback(({ item, index }: { item: ProjectFeeStudent, index: number }) => {
    return (
      <StudentFeeCard
        item={item}
        index={index}
        isDark={isDark}
        isExpanded={expandedStudentId === item.student_id}
        onToggleExpand={() => toggleExpanded(item.student_id)}
        onStatusChange={(status: 'paid' | 'due') => updateStudentStatus(item.student_id, status)}
        onReasonChange={(text: string) => updateStudentReason(item.student_id, text)}
      />
    );
  }, [isDark, expandedStudentId, updateStudentStatus, updateStudentReason]);

  return (
    <ErrorBoundary>
      <View style={[styles.container, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
        <ZenToast
          visible={toast.visible}
          message={toast.message}
          type={toast.type}
          onHide={() => setToast({ ...toast, visible: false })}
        />

        {/* Floating Header */}
        <View style={{ paddingTop: insets.top }}>
          <LinearGradient
             colors={[
               isDark ? 'rgba(15,23,42,0.95)' : 'rgba(248,250,252,0.95)',
               isDark ? 'rgba(15,23,42,0.8)' : 'rgba(248,250,252,0.8)'
             ]}
             style={styles.headerGlass}
          >
             <View style={styles.headerContent}>
                <TouchableOpacity 
                  onPress={() => navigation.goBack()}
                  style={[styles.backBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
                >
                  <Ionicons name="arrow-back" size={normalizeFont(24)} color={isDark ? '#FFF' : '#0F172A'} />
                </TouchableOpacity>
                <View style={styles.headerTextContainer}>
                  <Text style={[styles.headerTitle, { color: isDark ? '#FFF' : '#0F172A' }]}>
                     Student Fees
                  </Text>
                  {facultyYear > 0 && (
                     <Text style={[styles.headerSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                        {facultyDept} - Year {facultyYear} - Sec {facultySection}
                     </Text>
                  )}
                </View>

                {/* Save Button */}
                <TouchableOpacity 
                   style={[
                     styles.saveBtn,
                     !hasUnsavedChanges || saving ? { opacity: 0.5 } : {}
                   ]}
                   onPress={handleSave}
                   disabled={!hasUnsavedChanges || saving}
                >
                   {saving ? (
                      <ActivityIndicator size="small" color="#FFF" />
                   ) : (
                      <Text style={styles.saveBtnText}>Save</Text>
                   )}
                </TouchableOpacity>
             </View>

             {/* Dropdown Selector */}
             <View style={{ paddingHorizontal: scale(20), paddingBottom: verticalScale(16) }}>
               <TouchableOpacity 
                  style={[
                    styles.dropdownToggle, 
                    { 
                      backgroundColor: isDark ? '#1E293B' : '#FFF',
                      borderColor: isDark ? '#334155' : '#E2E8F0',
                    }
                  ]}
                  onPress={toggleDropdown}
                  disabled={projects.length === 0}
               >
                 <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                   <View style={[styles.projectIconContainer, { backgroundColor: isDark ? 'rgba(13, 148, 136, 0.2)' : '#F0FDFA' }]}>
                      <Ionicons name="briefcase" size={normalizeFont(16)} color="#34C759" />
                   </View>
                   <View style={{ flex: 1, marginLeft: scale(12) }}>
                     <Text style={[styles.projectSelectorTitle, { color: isDark ? '#FFF' : '#0F172A' }]} numberOfLines={1}>
                        {selectedProject ? selectedProject.title : "No Active Projects"}
                     </Text>
                     {selectedProject && (
                       <Text style={[styles.projectSelectorAmount, { color: '#0D9488' }]}>
                         ₹{selectedProject.amount} • Due: {new Date(selectedProject.due_date).toLocaleDateString()}
                       </Text>
                     )}
                   </View>
                 </View>
                 <Ionicons name={isDropdownOpen ? 'chevron-up' : 'chevron-down'} size={normalizeFont(20)} color={isDark ? '#94A3B8' : '#64748B'} />
               </TouchableOpacity>

               {/* Dropdown Menu */}
               {isDropdownOpen && (
                 <Animated.View style={[
                   styles.dropdownMenu,
                   {
                     backgroundColor: isDark ? '#1E293B' : '#FFF',
                     borderColor: isDark ? '#334155' : '#E2E8F0',
                     opacity: slideAnim,
                     transform: [{
                       translateY: slideAnim.interpolate({
                         inputRange: [0, 1],
                         outputRange: [-10, 0]
                       })
                     }]
                   }
                 ]}>
                   {projects.map((p) => (
                      <TouchableOpacity
                        key={p.id}
                        style={styles.dropdownItem}
                        onPress={() => handleSelectProject(p)}
                      >
                         <Text style={[
                           styles.dropdownItemText, 
                           { color: isDark ? '#F1F5F9' : '#0F172A', fontWeight: p.id === selectedProject?.id ? '700' : '400' }
                         ]}>
                           {p.title} - ₹{p.amount}
                         </Text>
                         {p.id === selectedProject?.id && (
                           <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                         )}
                      </TouchableOpacity>
                   ))}
                 </Animated.View>
               )}
             </View>
          </LinearGradient>
        </View>

        {connectionStatus !== 'online' && (
           <View style={{ backgroundColor: '#F59E0B', padding: scale(8), alignItems: 'center' }}>
              <Text style={{ color: '#FFF', fontSize: normalizeFont(12), fontWeight: '600' }}>
                 Offline Mode. Changes won't be saved until reconnected.
              </Text>
           </View>
        )}

        <KeyboardAvoidingView 
           style={{ flex: 1 }}
           behavior={Platform.OS === 'ios' ? 'padding' : undefined}
           keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
        >
          {loading ? (
             <View style={styles.centerContainer}>
               <ActivityIndicator size="large" color="#34C759" />
             </View>
          ) : projects.length === 0 ? (
             <View style={styles.centerContainer}>
               <Ionicons name="folder-open-outline" size={scale(64)} color={isDark ? '#334155' : '#CBD5E1'} />
               <Text style={[styles.emptyStateTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                 No Fee Projects
               </Text>
               <Text style={[styles.emptyStateDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                 There are currently no active fee projects assigned to your class.
               </Text>
             </View>
          ) : (
              <FlatList
                data={students}
                keyExtractor={(item) => item.student_id}
                renderItem={renderStudentItem}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
                removeClippedSubviews={false}
                ListEmptyComponent={() => (
                  <View style={styles.centerContainer}>
                     <Text style={{ color: isDark ? '#94A3B8' : '#64748B' }}>
                       No active students found in this class section.
                     </Text>
                  </View>
                )}
              />
          )}
        </KeyboardAvoidingView>
      </View>
    </ErrorBoundary>
  );
};

// Extracted and memoized to prevent full-list re-renders when a single student changes.
const StudentFeeCard = React.memo(({ 
  item, 
  index, 
  isDark, 
  isExpanded, 
  onToggleExpand, 
  onStatusChange, 
  onReasonChange 
}: { 
  item: ProjectFeeStudent, 
  index: number, 
  isDark: boolean, 
  isExpanded: boolean, 
  onToggleExpand: () => void, 
  onStatusChange: (status: 'paid' | 'due') => void, 
  onReasonChange: (reason: string) => void 
}) => {
  const safeLength = item.full_name ? item.full_name.length : 0;
  const initials = item.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'U';
  const avatarColors = ['#FCA5A5', '#FDBA74', '#FCD34D', '#86EFAC', '#6EE7B7', '#93C5FD', '#A5B4FC', '#C4B5FD', '#F9A8D4'];
  const avatarBg = avatarColors[safeLength % avatarColors.length];

  return (
    <View style={[
      styles.studentCard,
      { 
        backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
        borderColor: isDark ? '#334155' : '#E2E8F0',
        ...(isExpanded ? { borderColor: isDark ? 'rgba(13, 148, 136, 0.4)' : 'rgba(13, 148, 136, 0.3)', shadowOpacity: 0.1 } : {})
      }
    ]}>
      <View style={styles.cardHeader}>
        {/* Avatar Area */}
        <View style={{ 
            width: scale(36), height: scale(36), borderRadius: scale(18), 
            backgroundColor: avatarBg, 
            alignItems: 'center', justifyContent: 'center', marginRight: scale(12) 
        }}>
            <Text style={{ fontSize: normalizeFont(12), fontWeight: '700', color: '#FFF' }}>{initials}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[styles.studentName, { color: isDark ? '#F1F5F9' : '#0F172A' }]} numberOfLines={1}>
            {index + 1}. {item.full_name}
          </Text>
          <Text style={[styles.studentRoll, { color: isDark ? '#94A3B8' : '#64748B' }]}>
            {item.roll_no}
          </Text>
        </View>
        
        
        <View style={[styles.statusToggleContainer, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}>
          {/* Animated Slider Background */}
          <Animated.View 
            style={[
              StyleSheet.absoluteFill,
              {
                width: '50%',
                backgroundColor: item.status === 'paid' ? '#10B981' : '#EF4444',
                borderRadius: moderateScale(6),
                transform: [{
                  translateX: item.status === 'paid' ? scale(38) : 0 // Assuming approx total width 76
                }]
              }
            ]} 
          />
          <TouchableOpacity
            style={[styles.statusButton, { flex: 1, zIndex: 1 }]}
            onPress={() => onStatusChange('due')}
          >
            <Text style={[
              styles.statusButtonText,
              item.status === 'due' ? { color: '#FFF', fontWeight: '800' } : { color: isDark ? '#94A3B8' : '#64748B' }
            ]}>
              DUE
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.statusButton, { flex: 1, zIndex: 1 }]}
            onPress={() => onStatusChange('paid')}
          >
             <Text style={[
              styles.statusButtonText,
              item.status === 'paid' ? { color: '#FFF', fontWeight: '800' } : { color: isDark ? '#94A3B8' : '#64748B' }
            ]}>
              PAID
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Reason Box - Always visible if 'due' and expanded */}
      {item.status === 'due' && (
        <TouchableOpacity 
           style={{ 
             flexDirection: 'row', 
             alignItems: 'center', 
             justifyContent: 'space-between',
             paddingTop: verticalScale(10),
             borderTopWidth: 1,
             borderTopColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
           }}
           onPress={onToggleExpand}
        >
           <Text style={{ fontSize: normalizeFont(12), color: isDark ? '#9A9A9A' : '#777' }}>
             {item.reason ? `Reason: ${item.reason}` : 'Add a Due Reason...'}
           </Text>
           <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={normalizeFont(16)} color={isDark ? '#FFF' : '#000'} />
        </TouchableOpacity>
      )}

      {isExpanded && item.status === 'due' && (
        <View style={{
          marginTop: verticalScale(12),
          padding: scale(12),
          backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
          borderRadius: moderateScale(12),
        }}>
           <Text style={{ fontSize: normalizeFont(11), fontWeight: '700', color: isDark ? '#CBD5E1' : '#475569', marginBottom: verticalScale(8), textTransform: 'uppercase' }}>
             Select Reason
           </Text>
           {/* Quick Suggestion Chips */}
           <View style={styles.chipsContainer}>
              {["Financial Issue", "Partial Paid", "Waived", "Not Checked"].map(reason => {
                const isSelected = item.reason === reason;
                return (
                <TouchableOpacity 
                   key={reason}
                   style={[
                     styles.suggestionChip, 
                     { backgroundColor: isSelected ? 'rgba(13, 148, 136, 0.15)' : (isDark ? '#334155' : '#E2E8F0') },
                     isSelected && { borderWidth: 1, borderColor: '#0D9488' }
                   ]}
                   onPress={() => onReasonChange(reason)}
                 >
                   <Text style={[
                     styles.suggestionText, 
                     { color: isSelected ? '#0D9488' : (isDark ? '#CBD5E1' : '#475569'), fontWeight: isSelected ? '700' : '500' }
                   ]}>
                     {reason}
                   </Text>
                 </TouchableOpacity>
                )
              })}
           </View>
           
           <TextInput
             style={[
               styles.reasonInput,
               {
                 backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                 color: isDark ? '#F1F5F9' : '#0F172A',
                 borderColor: isDark ? '#334155' : '#E2E8F0',
                 marginTop: verticalScale(12)
               }
             ]}
             placeholder="Or type custom reason..."
             placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
             value={item.reason}
             onChangeText={onReasonChange}
             maxLength={100}
           />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerGlass: {
    width: '100%',
    paddingBottom: verticalScale(10),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150,150,150,0.1)',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(16),
  },
  backBtn: {
    width: scale(40),
    height: scale(40),
    borderRadius: moderateScale(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextContainer: {
    flex: 1,
    marginLeft: scale(16),
  },
  headerTitle: {
    fontSize: normalizeFont(20),
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: normalizeFont(13),
    fontWeight: '500',
    marginTop: verticalScale(2),
  },
  saveBtn: {
    backgroundColor: '#0D9488',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(8),
    borderRadius: moderateScale(8),
    minWidth: scale(70),
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: normalizeFont(14),
  },
  dropdownToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: scale(12),
    borderRadius: moderateScale(12),
    borderWidth: 1,
  },
  projectIconContainer: {
    width: scale(36),
    height: scale(36),
    borderRadius: moderateScale(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectSelectorTitle: {
    fontSize: normalizeFont(15),
    fontWeight: '700',
  },
  projectSelectorAmount: {
    fontSize: normalizeFont(12),
    fontWeight: '600',
    marginTop: verticalScale(2),
  },
  dropdownMenu: {
    position: 'absolute',
    top: verticalScale(70),
    left: scale(20),
    right: scale(20),
    borderWidth: 1,
    borderRadius: moderateScale(12),
    padding: scale(8),
    zIndex: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(12),
    borderRadius: moderateScale(8),
  },
  dropdownItemText: {
    fontSize: normalizeFont(14),
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: scale(20),
  },
  emptyStateTitle: {
    fontSize: normalizeFont(20),
    fontWeight: '700',
    marginTop: verticalScale(16),
  },
  emptyStateDesc: {
    fontSize: normalizeFont(14),
    textAlign: 'center',
    marginTop: verticalScale(8),
    lineHeight: 22,
  },
  listContent: {
    padding: scale(20),
    paddingBottom: verticalScale(100),
  },
  studentCard: {
    padding: scale(16),
    borderRadius: moderateScale(16),
    borderWidth: 1,
    marginBottom: verticalScale(16),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(16),
  },
  studentName: {
    fontSize: normalizeFont(16),
    fontWeight: '700',
  },
  studentRoll: {
    fontSize: normalizeFont(13),
    marginTop: verticalScale(2),
  },
  statusToggleContainer: {
    flexDirection: 'row',
    width: scale(76),
    height: verticalScale(28),
    borderRadius: moderateScale(8),
    padding: 2,
    position: 'relative'
  },
  statusButton: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: moderateScale(6),
  },
  statusButtonText: {
    fontSize: normalizeFont(12),
    fontWeight: '600',
  },
  reasonContainer: {
    marginTop: verticalScale(4),
  },
  reasonInput: {
    borderWidth: 1,
    borderRadius: moderateScale(8),
    padding: scale(12),
    minHeight: verticalScale(40),
    fontSize: normalizeFont(14),
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: verticalScale(8),
    gap: scale(6),
  },
  suggestionChip: {
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(100),
  },
  suggestionText: {
    fontSize: normalizeFont(11),
    fontWeight: '500',
  }
});
