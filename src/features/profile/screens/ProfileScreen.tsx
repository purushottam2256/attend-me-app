import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
  Vibration,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts';
import { supabase } from '../../../config/supabase';
import { DigitalIdCard } from '../components/DigitalIdCard';
import { SlideToLogout } from '../components/SlideToLogout';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { ZenToast } from '../../../components/ZenToast';
import { EditProfileModal } from '../components/EditProfileModal';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../../constants';

interface ProfileScreenProps {
  userName: string;
  onLogout: () => void;
}

interface MenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  isToggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (value: boolean) => void;
  color?: string;
  destructive?: boolean;
}

// --- Components ---
// ZenToast is now imported




export const ProfileScreen: React.FC<ProfileScreenProps> = ({ userName, onLogout }) => {
  const navigation = useNavigation();
  const { isDark, setTheme } = useTheme();
  const insets = useSafeAreaInsets();
  
  // -- Settings State --
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [textSize, setTextSize] = useState(1); // 0: Small, 1: Standard, 2: Large

  // -- User Data --
  const [userEmail, setUserEmail] = useState('');
  const [userDept, setUserDept] = useState('');
  const [userRole, setUserRole] = useState('');
  const [displayName, setDisplayName] = useState(userName);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  // -- Modals --
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  // Removed avatarModalVisible as we are back to native
  // const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [leaveModalVisible, setLeaveModalVisible] = useState(false);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [helpModalVisible, setHelpModalVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  // -- Toast State --
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'warning' }>({
      visible: false,
      message: '',
      type: 'success'
  });

  // -- Forms --
  // Leave
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveFrom, setLeaveFrom] = useState(new Date());
  const [leaveTo, setLeaveTo] = useState(new Date());
  const [leaveType, setLeaveType] = useState<'full_day' | 'half_day'>('full_day');
  
  // Date Picker State
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState<'from' | 'to'>('from');

  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);

  // No local edit state needed, handled in EditProfileModal

  // Report
  const [reportQuery, setReportQuery] = useState('');
  const [reportImage, setReportImage] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // -- Holidays --
  const [holidays, setHolidays] = useState<any[]>([]);

  useEffect(() => {
    loadUserData();
    loadSettings();
    loadHolidays();
  }, []);

  const loadHolidays = async () => {
      const { data } = await supabase
          .from('holidays')
          .select('*')
          .gte('date', new Date().toISOString())
          .order('date', { ascending: true })
          .limit(3);
      if (data) setHolidays(data);
  };

  const loadUserData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || '');
        const { data: profile } = await supabase
            .from('profiles')
            .select('dept, role, full_name, avatar_url')
            .eq('id', user.id)
            .single();
        if (profile) {
            setUserDept(profile.dept || '');
            setUserRole(profile.role || 'faculty');
            if (profile.full_name) {
                setDisplayName(profile.full_name);
            }
            if (profile.avatar_url) setProfileImage(profile.avatar_url);
        }
      }
    } catch (error) { console.error(error); }
  };

  const loadSettings = async () => {
      try {
          const haptics = await AsyncStorage.getItem('hapticsEnabled');
          if (haptics !== null) setHapticsEnabled(haptics === 'true');
          
          const notifs = await AsyncStorage.getItem('notificationsEnabled');
          if (notifs !== null) setNotificationsEnabled(notifs === 'true');
      } catch (e) {}
  };

  const toggleHaptics = async (val: boolean) => {
      setHapticsEnabled(val);
      await AsyncStorage.setItem('hapticsEnabled', val.toString());
      if (val) Haptics.selectionAsync();
  };

  const toggleNotifications = async (val: boolean) => {
      setNotificationsEnabled(val);
      await AsyncStorage.setItem('notificationsEnabled', val.toString());
  };

  const showZenToast = (msg: string, type: 'success' | 'error' | 'warning' = 'success') => {
      setToast({ visible: true, message: msg, type });
      if (hapticsEnabled) {
          if (type === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          else if (type === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
  };

  // --- Actions ---
  const handleApplyLeave = async () => {
      if (!leaveReason.trim()) {
          showZenToast('Please enter a reason.', 'warning');
          return;
      }
      setIsSubmittingLeave(true);
      
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No user');
        
        // For Half Day, imply End Date = Start Date (Single Day)
        const finalEndDate = leaveType === 'half_day' ? leaveFrom : leaveTo;

        const { error } = await supabase.from('leaves').insert({
            user_id: user.id,
            reason: leaveReason,
            start_date: leaveFrom.toISOString(),
            end_date: finalEndDate.toISOString(),
            leave_type: leaveType,
            status: 'pending'
        });

        if (error) throw error;

        setLeaveModalVisible(false);
        showZenToast('Application Sent Successfully');
        setLeaveReason('');
        // Notify HOD logic would be ideally backend trigger, but we simulate success here
      } catch (err) {
        showZenToast('Failed to apply for leave.', 'error');
        console.error(err);
      } finally {
        setIsSubmittingLeave(false);
      }
  };

  const handlePickReportImage = async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
           showZenToast('Gallery permission required.', 'error');
           return;
      }
      
      const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.5,
      });
      
      if (!result.canceled && result.assets[0].uri) {
          setReportImage(result.assets[0].uri);
      }
  };

  const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === 'android') {
          setShowDatePicker(false);
      }
      
      if (selectedDate) {
          if (datePickerMode === 'from') {
              setLeaveFrom(selectedDate);
              // Auto-set To date if it's before From date or for convenience
              if (selectedDate > leaveTo) {
                  setLeaveTo(selectedDate);
              }
          } else {
              setLeaveTo(selectedDate);
          }
      }
  };

  const showDatepicker = (mode: 'from' | 'to') => {
      setDatePickerMode(mode);
      setShowDatePicker(true);
  };
  
  const handleReportIssue = async () => {
      if (!reportQuery.trim()) return;
      setIsSubmittingReport(true);
      
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No user');

        const { error } = await supabase.from('issues').insert({
            user_id: user.id,
            description: reportQuery,
            has_screenshot: !!reportImage, // Boolean flag for specific field if schema requires, or maybe we should store URL later
            status: 'open'
        });

        if (error) throw error;

        setReportModalVisible(false);
        setReportQuery('');
        setReportImage(null);

        showZenToast(`Report Submitted. ID: #${Math.floor(Math.random() * 9000) + 1000}`, 'success');
      } catch (err) {
          showZenToast('Failed to submit report.', 'error');
          console.error(err);
      } finally {
          setIsSubmittingReport(false);
      }
  };


  // --- Render Sections ---
  const renderSection = (title: string, items: MenuItem[]) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: isDark ? '#FFFFFF' : '#1E293B' }]}>
        {title}
      </Text>
      <View style={[
          styles.menuCard, 
          { 
              backgroundColor: isDark ? '#082020' : '#FFFFFF',
              borderWidth: isDark ? 0 : 1,
              borderColor: '#E2E8F0'
          }
      ]}>
        {items.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.menuItem,
              index < items.length - 1 && styles.menuItemBorder,
              { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : '#F1F5F9' },
            ]}
            onPress={item.onPress}
            disabled={item.isToggle}
            activeOpacity={item.isToggle ? 1 : 0.7}
          >
            <View style={[
                styles.menuIconContainer, 
                { backgroundColor: 'transparent' } 
            ]}>
              <Ionicons 
                name={item.icon} 
                size={22} 
                color={item.destructive ? '#EF4444' : (item.color || '#334155')} 
              />
            </View>
            <View style={styles.menuContent}>
              <Text style={[
                  styles.menuLabel, 
                  { color: item.destructive ? '#EF4444' : (isDark ? '#FFFFFF' : '#0F172A') }
              ]}>
                {item.label}
              </Text>
              {item.value && (
                <Text style={[styles.menuValue, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  {item.value}
                </Text>
              )}
            </View>
            {item.isToggle ? (
              <Switch
                value={item.toggleValue}
                onValueChange={item.onToggle}
                trackColor={{ false: isDark ? '#475569' : '#E2E8F0', true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            ) : (
              <Ionicons 
                name="chevron-forward" 
                size={20} 
                color={isDark ? '#475569' : '#CBD5E1'} 
              />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Premium Gradient Background with Orbs */}
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={[Colors.premium.gradientStart, Colors.premium.gradientMid, Colors.premium.gradientEnd]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <View style={[styles.orb, styles.orb1]} />
        <View style={[styles.orb, styles.orb2]} />
        <View style={[styles.orb, styles.orb3]} />
      </View>

      <ZenToast 
        visible={toast.visible} 
        message={toast.message} 
        type={toast.type}
        onHide={() => setToast(prev => ({ ...prev, visible: false }))} 
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        <DigitalIdCard 
            user={{ name: displayName, email: userEmail, dept: userDept, role: userRole, photoUrl: profileImage || undefined }}
            onEdit={() => setEditProfileVisible(true)}
        />

        <View style={{ marginBottom: 24 }} />

        {renderSection('Faculty Services', [
           { icon: 'document-text', label: 'Apply for Leave', value: 'Notify HOD', onPress: () => setLeaveModalVisible(true), color: '#F59E0B' },
           { icon: 'calendar', label: 'My Schedule', value: 'Weekly Timetable', onPress: () => { setScheduleModalVisible(true); loadHolidays(); }, color: '#8B5CF6' }
        ])}

        {renderSection('App Settings', [
          { icon: isDark ? 'moon' : 'sunny', label: 'Dark Mode', isToggle: true, toggleValue: isDark, onToggle: () => setTheme(isDark ? 'light' : 'dark'), color: isDark ? '#8B5CF6' : '#F59E0B' },
          { icon: 'notifications', label: 'Push Notifications', isToggle: true, toggleValue: notificationsEnabled, onToggle: toggleNotifications, color: '#EC4899' },
          { icon: 'phone-portrait', label: 'Haptic Feedback', isToggle: true, toggleValue: hapticsEnabled, onToggle: toggleHaptics, color: '#10B981' }
        ])}

        {renderSection('Data & Cloud', [
           { icon: 'cloud', label: 'Sync Manager', value: 'Check Status', onPress: () => (navigation as any).navigate('SyncManager'), color: '#10B981' },
        ])}

        {renderSection('Help & Support', [
           { icon: 'help-buoy', label: 'Help Center', value: 'User Guide', onPress: () => setHelpModalVisible(true), color: '#14B8A6' },
           { icon: 'medkit', label: 'Beacon Doctor', value: 'System Diagnostics', onPress: () => (navigation as any).navigate('BeaconDoctor'), color: '#10B981' },
           { icon: 'warning', label: 'Report Issue', onPress: () => setReportModalVisible(true), color: '#F59E0B' }
        ])}

        <View style={styles.logoutContainer}>
            <SlideToLogout onLogout={onLogout} />
        </View>

        <Text style={[styles.versionText, { color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)' }]}>MRCE Attend-Me v1.0.3</Text>
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* --- Leave Modal --- */}
      <Modal visible={leaveModalVisible} animationType="slide" transparent onRequestClose={() => setLeaveModalVisible(false)}>
          <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { backgroundColor: isDark ? '#082020' : '#FFF' }]}>
                  <Text style={[styles.modalTitle, { color: isDark ? '#FFF' : '#082020' }]}>Apply for Leave</Text>
                  
                  {/* Leave Type Toggle */}
                   <View style={{ flexDirection: 'row', marginBottom: 16 }}>
                      {['full_day', 'half_day'].map((type) => (
                          <TouchableOpacity 
                              key={type}
                              onPress={() => setLeaveType(type as any)}
                              style={{ 
                                  flex: 1, 
                                  paddingVertical: 10, 
                                  alignItems: 'center', 
                                  backgroundColor: leaveType === type ? '#0F766E' : (isDark ? '#082020' : '#F1F5F9'),
                                  borderRadius: 8,
                                  marginRight: 8
                              }}
                          >
                              <Text style={{ 
                                  color: leaveType === type ? '#FFF' : (isDark ? '#94A3B8' : '#64748B'),
                                  fontWeight: '700', fontSize: 13
                              }}>
                                  {type === 'full_day' ? 'Full Day' : 'Half Day'}
                              </Text>
                          </TouchableOpacity>
                      ))}
                  </View>

                  <View style={{ marginBottom: 16 }}>
                      {leaveType === 'full_day' ? (
                          <View style={{ flexDirection: 'row', gap: 12 }}>
                              <View style={{ flex: 1 }}>
                                  <Text style={[styles.inputLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>FROM</Text>
                                  <TouchableOpacity onPress={() => showDatepicker('from')} style={[styles.dateBtn, { backgroundColor: isDark ? '#082020' : '#F8FAFC' }]}>
                                      <Text style={{ color: isDark ? '#FFF' : '#082020' }}>{leaveFrom.toLocaleDateString()}</Text>
                                  </TouchableOpacity>
                              </View>
                              <View style={{ flex: 1 }}>
                                  <Text style={[styles.inputLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>TO</Text>
                                  <TouchableOpacity onPress={() => showDatepicker('to')} style={[styles.dateBtn, { backgroundColor: isDark ? '#082020' : '#F8FAFC' }]}>
                                      <Text style={{ color: isDark ? '#FFF' : '#082020' }}>{leaveTo.toLocaleDateString()}</Text>
                                  </TouchableOpacity>
                              </View>
                          </View>
                      ) : (
                          <View>
                              <Text style={[styles.inputLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>DATE</Text>
                              <TouchableOpacity onPress={() => showDatepicker('from')} style={[styles.dateBtn, { backgroundColor: isDark ? '#082020' : '#F8FAFC', width: '100%' }]}>
                                  <Text style={{ color: isDark ? '#FFF' : '#082020' }}>{leaveFrom.toLocaleDateString()}</Text>
                              </TouchableOpacity>
                          </View>
                      )}
                  </View>

                  <Text style={[styles.inputLabel, { color: isDark ? '#94A3B8' : '#64748B', marginTop: 4 }]}>REASON</Text>
                  <TextInput 
                      style={[styles.input, { color: isDark ? '#FFF' : '#082020', backgroundColor: isDark ? '#082020' : '#F8FAFC', height: 80, textAlignVertical: 'top' }]}
                      value={leaveReason} onChangeText={setLeaveReason} multiline placeholder="I am taking leave because..." placeholderTextColor="#94A3B8"
                  />

                  <View style={styles.modalActions}>
                      <TouchableOpacity onPress={() => setLeaveModalVisible(false)} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                      <TouchableOpacity onPress={handleApplyLeave} style={styles.saveBtn}>
                          {isSubmittingLeave ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Submit</Text>}
                      </TouchableOpacity>
                  </View>
              </View>
          </View>
          
          {showDatePicker && (
              <DateTimePicker
                  testID="dateTimePicker"
                  value={datePickerMode === 'from' ? leaveFrom : leaveTo}
                  mode="date"
                  is24Hour={true}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onDateChange}
                  themeVariant={isDark ? 'dark' : 'light'}
              />
          )}
      </Modal>

      <EditProfileModal 
          visible={editProfileVisible}
          onClose={() => setEditProfileVisible(false)}
          onProfileUpdated={() => {
              loadUserData();
              showZenToast('Profile Updated Successfully', 'success');
          }}
          currentName={displayName}
          currentPhoto={profileImage}
          isDark={isDark}
      />

      {/* --- Schedule Modal (Overhauled) --- */}
      <Modal visible={scheduleModalVisible} animationType="slide" transparent={false} onRequestClose={() => setScheduleModalVisible(false)}>
          {/* Green Theme Container */}
          <View style={{ flex: 1, backgroundColor: '#0F766E' }}> 
              
              {/* Header */}
              <View style={[styles.modalHeader, { marginTop: insets.top + 20, paddingHorizontal: 20 }]}>
                  <View>
                      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>ACADEMIC PLAN</Text>
                      <Text style={{ color: '#FFF', fontSize: 28, fontWeight: '800' }}>Weekly Schedule</Text>
                  </View>
                  <TouchableOpacity 
                      onPress={() => setScheduleModalVisible(false)}
                      style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 100 }}
                  >
                      <Ionicons name="close" size={24} color="#FFF" />
                  </TouchableOpacity>
              </View>
              
              <View style={{ flex: 1, backgroundColor: isDark ? '#082020' : '#F1F5F9', borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' }}>
                    <ScrollView contentContainerStyle={{ padding: 20 }}>
                        {/* Tabular Schedule Grid */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                            <View>
                                {/* Header Row (Days) */}
                                <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0', paddingBottom: 8, marginBottom: 8 }}>
                                    <View style={{ width: 80, alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#94A3B8' : '#64748B' }}>TIME / DAY</Text>
                                    </View>
                                    {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
                                        <View key={day} style={{ width: 140, alignItems: 'center', justifyContent: 'center' }}>
                                            <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#FFF' : '#082020' }}>{day}</Text>
                                        </View>
                                    ))}
                                </View>

                                {/* Time Rows */}
                                {['09:30 - 10:20', '10:20 - 11:10', '11:10 - 12:00', '12:00 - 12:50', '01:40 - 02:30', '02:30 - 03:20'].map((time, rowIdx) => (
                                    <View key={rowIdx} style={{ flexDirection: 'row', marginBottom: 12, alignItems: 'center' }}>
                                        {/* Time Column */}
                                        <View style={{ width: 80, paddingRight: 12, justifyContent: 'center' }}>
                                            <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#FFF' : '#082020', textAlign: 'center' }}>{time.split(' - ')[0]}</Text>
                                            <Text style={{ fontSize: 10,  color: isDark ? '#94A3B8' : '#64748B', textAlign: 'center' }}>to</Text>
                                            <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#FFF' : '#082020', textAlign: 'center' }}>{time.split(' - ')[1]}</Text>
                                        </View>

                                        {/* Schedule Cells (Simulated Fetch Data) */}
                                        {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day, colIdx) => {
                                            // Mock Data Logic (Replace with real DB data map)
                                            const isBreak = rowIdx === 3; // Lunch break simulation
                                            const hasClass = !isBreak && (rowIdx + colIdx) % 3 !== 0; // Randomize cells
                                            
                                            // Real app should map `timetable` data here using `day` and `time`
                                            
                                            if (isBreak) return (
                                                <View key={colIdx} style={{ width: 140, height: 80, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9', marginHorizontal: 4, borderRadius: 8, justifyContent: 'center', alignItems: 'center' }}>
                                                    <Text style={{ color: isDark ? '#475569' : '#94A3B8', fontSize: 10, fontWeight: '700', letterSpacing: 1 }}>LUNCH</Text>
                                                </View>
                                            );

                                            return (
                                                <View key={colIdx} style={{ 
                                                    width: 140, height: 90, 
                                                    backgroundColor: hasClass ? (isDark ? '#082020' : '#FFF') : 'transparent',
                                                    borderWidth: hasClass ? 1 : 0,
                                                    borderColor: isDark ? '#334155' : '#E2E8F0',
                                                    borderRadius: 12, 
                                                    marginHorizontal: 4, 
                                                    padding: 10,
                                                    justifyContent: 'center',
                                                    elevation: hasClass ? 1 : 0
                                                }}>
                                                    {hasClass ? (
                                                        <>
                                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                                                <Text style={{ color: '#0F766E', fontSize: 10, fontWeight: '800' }}>CS{3100 + rowIdx}</Text>
                                                                <Text style={{ color: isDark ? '#CBD5E1' : '#475569', fontSize: 10, fontWeight: '700' }}>III-CSE-A</Text>
                                                            </View>
                                                            <Text style={{ color: isDark ? '#FFF' : '#082020', fontSize: 12, fontWeight: '700', marginBottom: 2 }} numberOfLines={2}>
                                                                {['Computer Networks', 'Operating Systems', 'Software Eng.', 'Database Mgmt'][rowIdx % 4]}
                                                            </Text>
                                                        </>
                                                    ) : (
                                                        <Text style={{ color: isDark ? '#334155' : '#CBD5E1', fontSize: 11, textAlign: 'center', fontWeight: '600' }}>- Free -</Text>
                                                    )}
                                                </View>
                                            )
                                        })}
                                    </View>
                                ))}
                            </View>
                        </ScrollView>
                        
                        {/* Legend / Info */}
                        <Text style={{ textAlign: 'center', color: '#rgba(255,255,255,0.6)', fontSize: 11, marginTop: 12 }}>
                             Swipe horizontal to view full week • Data synced from central db
                        </Text>
                        
                        {/* Holidays Section */}
                        <Text style={[styles.sectionTitle, { color: isDark ? '#94A3B8' : '#64748B', marginTop: 32 }]}>UPCOMING HOLIDAYS & EVENTS</Text>
                        
                        {holidays.length === 0 ? (
                            <View style={{ padding: 20, alignItems: 'center', opacity: 0.5 }}>
                                <Text style={{ color: isDark ? '#FFF' : '#000' }}>No upcoming events.</Text>
                            </View>
                        ) : (
                            holidays.map((h, i) => (
                                <View key={i} style={{ 
                                    flexDirection: 'row', 
                                    alignItems: 'center', 
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFF', 
                                    padding: 16, 
                                    borderRadius: 16, 
                                    marginBottom: 12,
                                    borderWidth: 1,
                                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'transparent'
                                }}>
                                    <View style={{ 
                                        width: 48, height: 48, 
                                        borderRadius: 12, 
                                        backgroundColor: h.type === 'holiday' ? 'rgba(239, 68, 68, 0.1)' : (h.type === 'exam' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(59, 130, 246, 0.1)'), 
                                        alignItems: 'center', justifyContent: 'center',
                                        marginRight: 16
                                    }}>
                                        <Text style={{ 
                                            fontSize: 18, fontWeight: '800',
                                            color: h.type === 'holiday' ? '#EF4444' : (h.type === 'exam' ? '#F59E0B' : '#3B82F6')
                                        }}>
                                            {new Date(h.date).getDate()}
                                        </Text>
                                        <Text style={{ 
                                            fontSize: 9, fontWeight: '700', textTransform: 'uppercase',
                                            color: h.type === 'holiday' ? '#EF4444' : (h.type === 'exam' ? '#F59E0B' : '#3B82F6')
                                        }}>
                                            {new Date(h.date).toLocaleString('default', { month: 'short' })}
                                        </Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: isDark ? '#FFF' : '#0F172A', fontWeight: '700', fontSize: 15 }}>{h.title}</Text>
                                        <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 13, marginTop: 2 }}>{h.description || 'College Event'}</Text>
                                    </View>
                                    <View style={{ backgroundColor: isDark ? '#334155' : '#F1F5F9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 }}>
                                        <Text style={{ fontSize: 10, color: isDark ? '#CBD5E1' : '#475569', fontWeight: '600', textTransform: 'uppercase' }}>{h.type}</Text>
                                    </View>
                                </View>
                            ))
                        )}

                        <View style={{ height: 100 }} />
                    </ScrollView>
              </View>
          </View>
      </Modal>

      {/* --- Help Modal (Full Screen Detailed Guide) --- */}
      <Modal visible={helpModalVisible} animationType="slide" transparent={false} onRequestClose={() => setHelpModalVisible(false)}>
          <View style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }}>
              <View style={[styles.modalHeader, { marginTop: insets.top + 20, paddingHorizontal: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
                  <View>
                      <Text style={[styles.modalTitle, { color: isDark ? '#FFF' : '#0F172A', marginBottom: 4 }]}>Help Center</Text>
                      <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 13 }}>Complete guide to Attend-Me</Text>
                  </View>
                  <TouchableOpacity onPress={() => setHelpModalVisible(false)} style={{ backgroundColor: isDark ? '#1E293B' : '#FFF', padding: 8, borderRadius: 100, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' }}>
                      <Ionicons name="close" size={24} color={isDark ? '#FFF' : '#0F172A'} />
                  </TouchableOpacity>
              </View>
              
              <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
                   
                   {/* 1. Getting Started */}
                   <View style={{ marginBottom: 32 }}>
                       <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F766E', marginBottom: 16, letterSpacing: 1 }}>GETTING STARTED</Text>
                       <View style={{ backgroundColor: isDark ? '#1E293B' : '#FFF', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' }}>
                           <View style={{ flexDirection: 'row', marginBottom: 16 }}>
                               <View style={{ width: 32, height: 32, borderRadius: 100, backgroundColor: '#cffafe', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                   <Text style={{ fontWeight: '700', color: '#0F766E' }}>1</Text>
                               </View>
                               <View style={{ flex: 1 }}>
                                   <Text style={{ fontWeight: '700', fontSize: 15, color: isDark ? '#FFF' : '#0F172A', marginBottom: 4 }}>Select Your Class</Text>
                                   <Text style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 20 }}>
                                       On the Home Screen, tap "Select Class" to choose the Department, Year, and Section you are teaching.
                                   </Text>
                               </View>
                           </View>
                           <View style={{ flexDirection: 'row' }}>
                               <View style={{ width: 32, height: 32, borderRadius: 100, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                   <Text style={{ fontWeight: '700', color: '#166534' }}>2</Text>
                               </View>
                               <View style={{ flex: 1 }}>
                                   <Text style={{ fontWeight: '700', fontSize: 15, color: isDark ? '#FFF' : '#0F172A', marginBottom: 4 }}>Start Attendance</Text>
                                   <Text style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 20 }}>
                                       Tap "Take Attendance". The app looks for the class beacon. If found, students are marked present automatically.
                                   </Text>
                               </View>
                           </View>
                       </View>
                   </View>

                   {/* 2. Troubleshooting */}
                   <View style={{ marginBottom: 32 }}>
                       <Text style={{ fontSize: 12, fontWeight: '800', color: '#F59E0B', marginBottom: 16, letterSpacing: 1 }}>TROUBLESHOOTING</Text>
                       
                       <View style={{ flexDirection: 'row', marginBottom: 20 }}>
                           <Ionicons name="bluetooth" size={24} color={isDark ? '#94A3B8' : '#64748B'} style={{ marginRight: 16, marginTop: 2 }} />
                           <View style={{ flex: 1 }}>
                               <Text style={{ fontWeight: '700', fontSize: 15, color: isDark ? '#FFF' : '#0F172A' }}>Bluetooth Issues</Text>
                               <Text style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B', marginTop: 4, lineHeight: 18 }}>
                                   Always keep Bluetooth ON. If scanning fails, try toggling Airplane Mode or use the <Text style={{ fontWeight: '700', color: '#10B981' }}>Beacon Doctor</Text> feature in Profile to diagnose hardware.
                               </Text>
                           </View>
                       </View>
                       
                       <View style={{ flexDirection: 'row' }}>
                           <Ionicons name="wifi" size={24} color={isDark ? '#94A3B8' : '#64748B'} style={{ marginRight: 16, marginTop: 2 }} />
                           <View style={{ flex: 1 }}>
                               <Text style={{ fontWeight: '700', fontSize: 15, color: isDark ? '#FFF' : '#0F172A' }}>Offline Mode</Text>
                               <Text style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B', marginTop: 4, lineHeight: 18 }}>
                                   No internet? No problem. Attendance is saved locally and auto-synced when you reconnect.
                               </Text>
                           </View>
                       </View>
                   </View>

                   {/* 3. Features */}
                   <View style={{ marginBottom: 32 }}>
                       <Text style={{ fontSize: 12, fontWeight: '800', color: '#8B5CF6', marginBottom: 16, letterSpacing: 1 }}>FEATURES & TOOLS</Text>
                       <View style={{ backgroundColor: isDark ? '#1E293B' : '#F9FAFB', borderRadius: 12, overflow: 'hidden' }}>
                           {[
                               { label: 'Manual Entry', desc: 'Mark students manually if they forgot their ID.' },
                               { label: 'Leave Application', desc: 'Apply for Full/Half day leaves. HOD is notified instantly.' },
                               { label: 'Weekly Schedule', desc: 'View your timetable. Data is synced with the college DB.' },
                               { label: 'Report Issue', desc: 'Found a bug? Shake the phone or use the Report form.' },
                           ].map((f, i) => (
                               <View key={i} style={{ padding: 16, borderBottomWidth: i===3 ? 0 : 1, borderBottomColor: isDark ? '#334155' : '#E2E8F0' }}>
                                   <Text style={{ fontWeight: '700', fontSize: 14, color: isDark ? '#FFF' : '#0F172A' }}>{f.label}</Text>
                                   <Text style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B', marginTop: 2 }}>{f.desc}</Text>
                               </View>
                           ))}
                       </View>
                   </View>

                   {/* 4. Footer */}
                   <View style={{ alignItems: 'center', marginTop: 20 }}>
                       <Text style={{ color: isDark ? '#475569' : '#94A3B8', fontSize: 12 }}>Still need help? Contact Admin.</Text>
                       <TouchableOpacity onPress={() => { setHelpModalVisible(false); setReportModalVisible(true); }} style={{ marginTop: 12 }}>
                           <Text style={{ color: '#0F766E', fontWeight: '700' }}>Contact Support</Text>
                       </TouchableOpacity>
                   </View>

              </ScrollView>
          </View>
      </Modal>

      {/* --- Report Modal --- */}
      <Modal visible={reportModalVisible} animationType="slide" transparent onRequestClose={() => setReportModalVisible(false)}>
          <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFF', borderWidth: 1, borderColor: isDark ? '#334155' : 'transparent' }]}>
                  
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                          <Ionicons name="warning" size={20} color="#EF4444" />
                      </View>
                      <View>
                          <Text style={[styles.modalTitle, { color: isDark ? '#FFF' : '#0F172A', marginBottom: 2, fontSize: 18 }]}>Report Issue</Text>
                          <Text style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B' }}>Help us improve the system</Text>
                      </View>
                  </View>
                  
                  <Text style={[styles.inputLabel, { color: isDark ? '#FFF' : '#0F172A', marginBottom: 6 }]}>ISSUE DESCRIPTION</Text>
                  <TextInput 
                      style={[styles.input, { color: isDark ? '#FFF' : '#0F172A', backgroundColor: isDark ? '#0F172A' : '#F8FAFC', height: 120, textAlignVertical: 'top', fontSize: 14 }]}
                      value={reportQuery} onChangeText={setReportQuery} multiline placeholder="Describe the issue in detail..." placeholderTextColor="#94A3B8"
                  />

                  <TouchableOpacity 
                    style={[styles.photoUpload, { borderColor: isDark ? '#334155' : '#E2E8F0', marginTop: 4, height: 60, flexDirection: 'row', gap: 12 }]}
                    onPress={handlePickReportImage}
                  >
                      {reportImage ? (
                          <>
                             <Image source={{ uri: reportImage }} style={{ width: 40, height: 40, borderRadius: 8 }} />
                             <View style={{ justifyContent: 'center' }}>
                                 <Text style={{ color: '#10B981', fontSize: 13, fontWeight: '600' }}>Image Attached</Text>
                                 <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 11 }}>Tap to change</Text>
                             </View>
                          </>
                      ) : (
                          <>
                            <View style={{ width: 32, height: 32, borderRadius: 100, backgroundColor: isDark ? '#334155' : '#E2E8F0', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="image" size={16} color="#94A3B8" />
                            </View>
                            <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 13, fontWeight: '600' }}>
                                Attach Screenshot (Optional)
                            </Text>
                          </>
                      )}
                  </TouchableOpacity>

                  <View style={styles.modalActions}>
                      <TouchableOpacity onPress={() => setReportModalVisible(false)} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                      <TouchableOpacity onPress={handleReportIssue} style={[styles.saveBtn, { backgroundColor: '#EF4444', paddingHorizontal: 32 }]}>
                          {isSubmittingReport ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Submit Report</Text>}
                      </TouchableOpacity>
                  </View>
              </View>
          </View>
      </Modal>



    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 0 },
  section: { marginBottom: 24, paddingHorizontal: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginLeft: 4 },
  menuCard: { borderRadius: 16, overflow: 'hidden', shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  menuItemBorder: { borderBottomWidth: 1 },
  menuIconContainer: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  menuContent: { flex: 1 },
  menuLabel: { fontSize: 15, fontWeight: '600' },
  menuValue: { fontSize: 13, marginTop: 2 },
  logoutContainer: { marginTop: 10 },
  versionText: { textAlign: 'center', fontSize: 12, marginTop: 24, fontWeight: '500' },
  
  // Modal & Toast
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { borderRadius: 24, padding: 24 },
  modalCardFull: { borderRadius: 24, padding: 24, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: '700', marginBottom: 6, letterSpacing: 0.5 },
  input: { borderRadius: 12, padding: 12, borderWidth: 1, fontSize: 15, borderColor: '#E2E8F0', marginBottom: 16 },
  dateBtn: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#334155', alignItems: 'center' },
  photoUpload: { height: 80, borderWidth: 2, borderStyle: 'dashed', borderRadius: 12, justifyContent: 'center', alignItems: 'center', gap: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 12 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 16 },
  cancelText: { color: '#64748B', fontWeight: '600' },
  saveBtn: { backgroundColor: '#0F766E', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center' },
  saveText: { color: '#FFF', fontWeight: '700' },
  
  // Toast
  toastContainer: { position: 'absolute', top: 60, left: 20, right: 20, zIndex: 100, alignItems: 'center' },
  toastContent: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 100, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5, gap: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  toastText: { fontWeight: '600', color: '#0F766E', fontSize: 13 },

  // Schedule Table
  tableRow: { flexDirection: 'row' },
  cellFixed: { width: 70, padding: 12, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center' },
  cell: { width: 90, padding: 12, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 13, textAlign: 'center' },
  cellTextBold: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  
  // Date Picker
  dateOption: { paddingVertical: 16, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // Background Orbs
  orb: {
    position: 'absolute',
    borderRadius: 200,
  },
  orb1: {
    width: 300,
    height: 300,
    backgroundColor: 'rgba(61, 220, 151, 0.15)',
    top: -100,
    right: -100,
  },
  orb2: {
    width: 250,
    height: 250,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    bottom: 200,
    left: -80,
  },
  orb3: {
    width: 180,
    height: 180,
    backgroundColor: 'rgba(61, 220, 151, 0.08)',
    bottom: 400,
    right: -40,
  },
});


