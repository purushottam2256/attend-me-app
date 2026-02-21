import React, { useState, useEffect } from 'react';
import { useDeferredLoad } from '../../../hooks/useDeferredLoad';
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
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts';
import { supabase } from '../../../config/supabase';
import { DigitalIdCard } from '../components/DigitalIdCard';
import { SlideToLogout } from '../components/SlideToLogout';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { safeHaptic } from '../../../utils/haptics';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { ZenToast } from '../../../components/ZenToast';
import { EditProfileModal } from '../components/EditProfileModal';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../../constants';
import { cacheProfile, getCachedProfile, cacheTimetable, getCachedTimetable } from '../../../services/offlineService';
import { useConnectionStatus } from '../../../hooks';
import { NotificationService } from '../../../services/NotificationService';
import { LeaveHistory } from '../components/LeaveHistory';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive'; // Import responsive utils

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
  const [isOfflineData, setIsOfflineData] = useState(false);
  
  const { status: connectionStatus } = useConnectionStatus();

  // -- Modals --
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  // Removed avatarModalVisible as we are back to native
  // const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [leaveModalVisible, setLeaveModalVisible] = useState(false);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [helpModalVisible, setHelpModalVisible] = useState(false);
  const [helpTopic, setHelpTopic] = useState<string | null>(null); // Navigation state definition
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
  const [leaveSession, setLeaveSession] = useState<'morning' | 'afternoon'>('morning');
  
  // Date Picker State
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState<'from' | 'to'>('from');

  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);

  // No local edit state needed, handled in EditProfileModal

  // Report
  const [reportQuery, setReportQuery] = useState('');
  const [reportImage, setReportImage] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // -- Holidays & Timetable --
  const [holidays, setHolidays] = useState<any[]>([]);
  const [timetable, setTimetable] = useState<any[]>([]);

  useDeferredLoad(() => {
    loadUserData();
    loadSettings();
    loadHolidays();
  }, []);

  const loadHolidays = async () => {
      try {
        // User requested 'holidays' table strictly
        const { data } = await supabase
            .from('holidays') 
            .select('*')
            .gte('date', new Date().toISOString())
            .order('date', { ascending: true })
            .limit(5);
            
        if (data) {
            // Map potential schema differences (e.g. name vs title)
            const mappedData = data.map((h: any) => ({
                ...h,
                title: h.title || h.name || 'Holiday',
                type: h.type || 'holiday',
                description: h.description || ''
            }));
            setHolidays(mappedData);
        }
      } catch (e) {
        console.error('Error loading holidays:', e);
      }
  };

  const loadTimetable = async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
            .from('master_timetables')
            .select(`
                day,
                slot_id,
                start_time,
                end_time,
                target_dept,
                target_year,
                target_section,
                subject:subject_id(name, code)
            `)
            .eq('faculty_id', user.id)
            .eq('is_active', true);

        if (error) throw error;
        if (data) setTimetable(data);
    } catch (err) {
        console.log('Error loading timetable:', err);
    }
  };

  const loadUserData = async () => {
    try {
      if (connectionStatus === 'online') {
          // Online: Fetch from Supabase
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUserEmail(user.email || '');
                
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();
                
                if (profile) {
                    setDisplayName(profile.full_name || '');
                    setUserDept(profile.department || 'CSM'); 
                    setUserRole(profile.role || 'faculty');
                    setProfileImage(profile.avatar_url);
                    
                    // We can still cache it for other screens like Home/Notifications,
                    // but we won't load it for the ID card if offline.
                    await cacheProfile(profile);
                }
            }
          } catch (e) {
              console.error('Error loading user data:', e);
          }
      } else {
          // Offline Model Removed as per request
          // We do not load from cache.
          // Silently fail or just don't load. User requested "no need to know".
      }
      // Ensure we treat this as "no offline data loaded"
      setIsOfflineData(false); 
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
      if (val) await safeHaptic(Haptics.ImpactFeedbackStyle.Light);
  };

  const toggleNotifications = async (val: boolean) => {
      setNotificationsEnabled(val);
      await AsyncStorage.setItem('notificationsEnabled', val.toString());
      
      // IMPORTANT: Sync with database so HomeScreen can check
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ notifications_enabled: val })
          .eq('id', user.id);
      }
      
      // Cancel all scheduled reminders when disabled
      if (!val) {
        await NotificationService.cancelAllScheduled();
        showZenToast('Class reminders disabled', 'warning');
      } else {
        showZenToast('Class reminders enabled', 'success');
      }
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
        
        let finalReason = leaveReason;
        if (leaveType === 'half_day') {
            finalReason = `[${leaveSession === 'morning' ? 'Morning' : 'Afternoon'} Session] ${leaveReason}`;
        }

        const { error } = await supabase.from('leaves').insert({
            user_id: user.id,
            reason: finalReason,
            start_date: leaveFrom.toISOString(),
            end_date: finalEndDate.toISOString(),
            leave_type: leaveType,
            status: 'pending'
        });

        if (error) throw error;

        setLeaveModalVisible(false);
        showZenToast('Application Sent Successfully');
        setLeaveReason('');

        // Trigger FCM Push Notification (Simulating backend trigger)
        // In a real app, the backend would notify the HOD. 
        // Here, we send a "Confirmation" push to the CURRENT USER to verify FCM works.
        // Re-using user from outer scope if available, or just ensuring we don't redeclare
        
        if (user) {
            // Get current user's token to self-notify
            const { data: profile } = await supabase
                .from('profiles')
                .select('push_token')
                .eq('id', user.id)
                .single();
                
            if (profile?.push_token) {
                await NotificationService.sendPushNotification(
                    profile.push_token,
                    'Leave Request Submitted',
                    `Your leave for ${leaveFrom.toLocaleDateString()} has been sent to the HOD.`,
                    { type: 'LEAVE_REQUEST', leaveId: 'pending' },
                    'REQUESTS'
                );
            } else {
                // Fallback if no token (e.g. emulator)
                await NotificationService.showLocalNotification({
                    title: 'Leave Request Submitted',
                    body: `Your leave for ${leaveFrom.toLocaleDateString()} has been sent.`,
                });
            }
        }
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
                size={normalizeFont(22)} 
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
                size={normalizeFont(20)} 
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
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + verticalScale(20) }]}
        showsVerticalScrollIndicator={false}
      >
        <DigitalIdCard 
            user={{ 
                name: displayName || 'Faculty Member', 
                email: userEmail || 'No Email', 
                dept: userDept || 'CSM', 
                role: userRole || 'Faculty', 
                photoUrl: profileImage || undefined 
            }}
            onEdit={() => setEditProfileVisible(true)}
        />

        <View style={{ marginBottom: verticalScale(24) }} />

        {renderSection('Faculty Services', [
           { icon: 'document-text', label: 'Apply for Leave', value: 'Notify HOD', onPress: () => setLeaveModalVisible(true), color: '#F59E0B' },
           { icon: 'calendar', label: 'My Schedule', value: 'Weekly Timetable', onPress: () => { setScheduleModalVisible(true); loadTimetable(); loadHolidays(); }, color: '#8B5CF6' }
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
                   <View style={{ flexDirection: 'row', marginBottom: verticalScale(16) }}>
                      {['full_day', 'half_day'].map((type) => (
                          <TouchableOpacity 
                              key={type}
                              onPress={() => setLeaveType(type as any)}
                              style={{ 
                                  flex: 1, 
                                  paddingVertical: verticalScale(10), 
                                  alignItems: 'center', 
                                  backgroundColor: leaveType === type ? '#0F766E' : (isDark ? '#082020' : '#F1F5F9'),
                                  borderRadius: moderateScale(8),
                                  marginRight: scale(8)
                              }}
                          >
                              <Text style={{ 
                                  color: leaveType === type ? '#FFF' : (isDark ? '#94A3B8' : '#64748B'),
                                  fontWeight: '700', fontSize: normalizeFont(13)
                              }}>
                                  {type === 'full_day' ? 'Full Day' : 'Half Day'}
                              </Text>
                          </TouchableOpacity>
                      ))}
                  </View>

                  <View style={{ marginBottom: 16 }}>
                      {leaveType === 'full_day' ? (
                          <View style={{ flexDirection: 'row', gap: scale(12) }}>
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
                              <View style={{ flexDirection: 'row', gap: scale(12), marginBottom: verticalScale(12) }}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={[styles.inputLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>DATE</Text>
                                    <TouchableOpacity onPress={() => showDatepicker('from')} style={[styles.dateBtn, { backgroundColor: isDark ? '#082020' : '#F8FAFC', width: '100%' }]}>
                                        <Text style={{ color: isDark ? '#FFF' : '#082020' }}>{leaveFrom.toLocaleDateString()}</Text>
                                    </TouchableOpacity>
                                  </View>
                                  
                                  {/* Session Selector for Half Day */}
                                  <View style={{ flex: 1 }}>
                                       <Text style={[styles.inputLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>SESSION</Text>
                                       <View style={{ flexDirection: 'row', height: verticalScale(48), backgroundColor: isDark ? '#082020' : '#F8FAFC', borderRadius: moderateScale(12), padding: scale(4), borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' }}>
                                           <TouchableOpacity 
                                              onPress={() => setLeaveSession('morning')}
                                              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: moderateScale(8), backgroundColor: leaveSession === 'morning' ? '#0F766E' : 'transparent' }}
                                           >
                                               <Text style={{ fontSize: normalizeFont(12), fontWeight: '700', color: leaveSession === 'morning' ? '#FFF' : (isDark ? '#94A3B8' : '#64748B') }}>AM</Text>
                                           </TouchableOpacity>
                                           <TouchableOpacity 
                                              onPress={() => setLeaveSession('afternoon')}
                                              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: moderateScale(8), backgroundColor: leaveSession === 'afternoon' ? '#0F766E' : 'transparent' }}
                                           >
                                               <Text style={{ fontSize: normalizeFont(12), fontWeight: '700', color: leaveSession === 'afternoon' ? '#FFF' : (isDark ? '#94A3B8' : '#64748B') }}>PM</Text>
                                           </TouchableOpacity>
                                       </View>
                                  </View>
                              </View>
                          </View>
                      )}
                  </View>

                  <Text style={[styles.inputLabel, { color: isDark ? '#94A3B8' : '#64748B', marginTop: 4 }]}>REASON</Text>
                  <TextInput 
                      style={[styles.input, { color: isDark ? '#FFF' : '#082020', backgroundColor: isDark ? '#082020' : '#F8FAFC', height: verticalScale(80), textAlignVertical: 'top' }]}
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
              <View style={[styles.modalHeader, { marginTop: insets.top + verticalScale(20), paddingHorizontal: scale(20), justifyContent: 'flex-start', gap: scale(16) }]}>
                  <TouchableOpacity 
                      onPress={() => setScheduleModalVisible(false)}
                      style={{ 
                        width: scale(44),
                        height: scale(44),
                        borderRadius: moderateScale(14),
                        backgroundColor: 'rgba(255,255,255,0.15)',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                  >
                      <Ionicons name="chevron-back" size={normalizeFont(24)} color="#FFFFFF" />
                  </TouchableOpacity>
                  <View>
                      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: normalizeFont(12), fontWeight: '700', letterSpacing: 1 }}>ACADEMIC PLAN</Text>
                      <Text style={{ color: '#FFF', fontSize: normalizeFont(24), fontWeight: '800' }}>Weekly Schedule</Text>
                  </View>
              </View>
              
              <View style={{ flex: 1, backgroundColor: isDark ? '#082020' : '#F1F5F9', borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' }}>
                    <ScrollView contentContainerStyle={{ padding: 20 }}>
                        {/* Tabular Schedule Grid */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                            <View>
                                {/* Header Row (Days) */}
                                <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0', paddingBottom: verticalScale(8), marginBottom: verticalScale(8) }}>
                                    <View style={{ width: scale(80), alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ fontSize: normalizeFont(12), fontWeight: '800', color: isDark ? '#94A3B8' : '#64748B' }}>TIME / DAY</Text>
                                    </View>
                                    {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
                                        <View key={day} style={{ width: scale(140), alignItems: 'center', justifyContent: 'center' }}>
                                            <Text style={{ fontSize: normalizeFont(14), fontWeight: '800', color: isDark ? '#FFF' : '#082020' }}>{day}</Text>
                                        </View>
                                    ))}
                                </View>

                                {/* Dynamic Time Rows */}
                                {(() => {
                                   // Extract unique slots from timetable
                                   const uniqueSlots = new Map<string, { start: string, end: string, sortKey: string }>();
                                   timetable.forEach(t => {
                                     // Use start_time as key to group duplicates
                                     const key = t.slot_id; 
                                     if (!uniqueSlots.has(key) && t.start_time) {
                                         // Create a comparable sort key (HH:MM string works if 24h)
                                         uniqueSlots.set(key, { 
                                           start: t.start_time.slice(0, 5), 
                                           end: t.end_time?.slice(0, 5) || '??:??',
                                           sortKey: t.start_time
                                         });
                                     }
                                   });
                                   
                                   // Convert to array and sort
                                   const sortedSlots = Array.from(uniqueSlots.entries())
                                     .map(([id, times]) => ({ id, time: `${times.start} - ${times.end}`, sortKey: times.sortKey }))
                                     .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

                                   // Fallback if no data (avoids empty screen on first load/no data)
                                   const rowsToRender = sortedSlots.length > 0 ? sortedSlots : [
                                      { id: 'p1', time: '09:30 - 10:20' },
                                      { id: 'p2', time: '10:20 - 11:10' },
                                   ];

                                   return (
                                     <View>
                                       {rowsToRender.map((row, rowIdx) => {
                                          return (
                                              <View key={row.id} style={{ flexDirection: 'row', marginBottom: verticalScale(12), alignItems: 'center' }}>
                                                  {/* Time Column */}
                                                  <View style={{ width: scale(80), paddingRight: scale(12), justifyContent: 'center' }}>
                                                      <Text style={{ fontSize: normalizeFont(11), fontWeight: '700', color: isDark ? '#FFF' : '#082020', textAlign: 'center' }}>{row.time.split(' - ')[0]}</Text>
                                                      <Text style={{ fontSize: normalizeFont(10),  color: isDark ? '#94A3B8' : '#64748B', textAlign: 'center' }}>to</Text>
                                                      <Text style={{ fontSize: normalizeFont(11), fontWeight: '700', color: isDark ? '#FFF' : '#082020', textAlign: 'center' }}>{row.time.split(' - ')[1]}</Text>
                                                  </View>
            
                                                  {/* Schedule Cells */}
                                                  {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day, colIdx) => {
                                                      const slotData = timetable.find(t => 
                                                          t.day?.toUpperCase().startsWith(day) && 
                                                          t.slot_id === row.id
                                                      );
                                                      
                                                      const hasClass = !!slotData;
                                                      
                                                      return (
                                                          <View key={colIdx} style={{ 
                                                              width: scale(140), 
                                                              height: verticalScale(60),
                                                              backgroundColor: hasClass ? (isDark ? '#0F766E' : '#F0FDFA') : 'transparent',
                                                              borderRadius: moderateScale(12),
                                                              borderWidth: 1,
                                                              borderColor: hasClass ? '#0D9488' : (isDark ? '#334155' : '#E2E8F0'),
                                                              padding: scale(8),
                                                              marginRight: scale(8),
                                                              justifyContent: 'center'
                                                          }}>
                                                              {hasClass ? (
                                                                  <>
                                                                      <Text numberOfLines={1} style={{ fontSize: normalizeFont(12), fontWeight: '700', color: isDark ? '#FFF' : '#0F766E' }}>{slotData.subject?.name || 'Subject'}</Text>
                                                                      <Text style={{ fontSize: normalizeFont(10), color: isDark ? '#99F6E4' : '#0D9488', marginTop: verticalScale(2) }}>{slotData.target_dept}-{slotData.target_section}</Text>
                                                                  </>
                                                              ) : (
                                                                  <Text style={{ fontSize: normalizeFont(11), color: isDark ? '#334155' : '#CBD5E1', textAlign: 'center', fontStyle: 'italic' }}>- Free -</Text>
                                                              )}
                                                          </View>
                                                      );
                                                  })}
                                              </View>
                                          );
                                       })}
                                     </View>
                                   );
                                })()}
                            </View>
                        </ScrollView>
                        
                        {/* Legend / Info */}
                        <Text style={{ textAlign: 'center', color: '#rgba(255,255,255,0.6)', fontSize: 11, marginTop: 12 }}>
                             Swipe horizontal to view full week • Data synced from central db
                        </Text>
                        
                        {/* Holidays Section */}
                        <Text style={[styles.sectionTitle, { color: isDark ? '#94A3B8' : '#64748B', marginTop: 32 }]}>UPCOMING HOLIDAYS & EVENTS</Text>
                        
                        {holidays.length === 0 ? (
                            <View style={{ padding: scale(20), alignItems: 'center', opacity: 0.5 }}>
                                <Text style={{ color: isDark ? '#FFF' : '#000' }}>No upcoming events.</Text>
                            </View>
                        ) : (
                            holidays.map((h, i) => (
                                <View key={i} style={{ 
                                    flexDirection: 'row', 
                                    alignItems: 'center', 
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFF', 
                                    padding: scale(16), 
                                    borderRadius: moderateScale(16), 
                                    marginBottom: verticalScale(12),
                                    borderWidth: 1,
                                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'transparent'
                                }}>
                                    <View style={{ 
                                        width: scale(48), height: scale(48), 
                                        borderRadius: moderateScale(12), 
                                        backgroundColor: h.type === 'holiday' ? 'rgba(239, 68, 68, 0.1)' : (h.type === 'exam' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(59, 130, 246, 0.1)'), 
                                        alignItems: 'center', justifyContent: 'center',
                                        marginRight: scale(16)
                                    }}>
                                        <Text style={{ 
                                            fontSize: normalizeFont(18), fontWeight: '800',
                                            color: h.type === 'holiday' ? '#EF4444' : (h.type === 'exam' ? '#F59E0B' : '#3B82F6')
                                        }}>
                                            {new Date(h.date).getDate()}
                                        </Text>
                                        <Text style={{ 
                                            fontSize: normalizeFont(9), fontWeight: '700', textTransform: 'uppercase',
                                            color: h.type === 'holiday' ? '#EF4444' : (h.type === 'exam' ? '#F59E0B' : '#3B82F6')
                                        }}>
                                            {new Date(h.date).toLocaleString('default', { month: 'short' })}
                                        </Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: isDark ? '#FFF' : '#0F172A', fontWeight: '700', fontSize: normalizeFont(15) }}>{h.title}</Text>
                                        <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: normalizeFont(13), marginTop: verticalScale(2) }}>{h.description || 'College Event'}</Text>
                                    </View>
                                    <View style={{ backgroundColor: isDark ? '#334155' : '#F1F5F9', paddingHorizontal: scale(10), paddingVertical: verticalScale(4), borderRadius: moderateScale(100) }}>
                                        <Text style={{ fontSize: normalizeFont(10), color: isDark ? '#CBD5E1' : '#475569', fontWeight: '600', textTransform: 'uppercase' }}>{h.type}</Text>
                                    </View>
                                </View>
                            ))
                        )}

                        <View style={{ height: 100 }} />
                    </ScrollView>
              </View>
          </View>
      </Modal>

      {/* --- Help Modal (Interactive Guide) --- */}
      <Modal 
        visible={helpModalVisible} 
        animationType="slide" 
        transparent={false} 
        onRequestClose={() => {
            if (helpTopic) setHelpTopic(null);
            else setHelpModalVisible(false);
        }}
      >
           <View style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }}>
               <LinearGradient
                   colors={['#0D4A4A', '#1A6B6B', '#0F3D3D']}
                   style={{ paddingTop: insets.top + verticalScale(16), paddingBottom: verticalScale(16), paddingHorizontal: scale(20) }}
               >
                   <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: scale(16) }}>
                        <TouchableOpacity 
                          style={{ width: scale(44), height: scale(44), borderRadius: moderateScale(14), backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
                          onPress={() => {
                              if (helpTopic) setHelpTopic(null);
                              else setHelpModalVisible(false);
                          }}
                        >
                          <Ionicons name={helpTopic ? "arrow-back" : "close"} size={normalizeFont(24)} color="#FFF" />
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: normalizeFont(20), fontWeight: '700', color: '#FFF' }}>
                                {helpTopic === 'home' ? 'Home & Schedule' : 
                                 helpTopic === 'notifs' ? 'Notifications' : 
                                 helpTopic === 'swaps' ? 'Swaps & Subs' : 
                                 helpTopic === 'profile' ? 'Profile & Tools' : 'Help Center'}
                            </Text>
                            <Text style={{ fontSize: normalizeFont(13), color: 'rgba(255,255,255,0.7)' }}>
                                {helpTopic ? 'Detailed Info' : 'Complete User Guide'}
                            </Text>
                        </View>
                   </View>
               </LinearGradient>

                <ScrollView contentContainerStyle={{ padding: scale(24), paddingBottom: verticalScale(60) }}>
                    {!helpTopic && (
                        /* --- MAIN MENU --- */
                        <View>
                           <View style={{ marginBottom: verticalScale(24) }}>
                               <Text style={{ fontSize: normalizeFont(16), color: isDark ? '#94A3B8' : '#64748B', lineHeight: verticalScale(24) }}>
                                   Select a topic below to view the detailed user manual.
                               </Text>
                           </View>

                           {[
                               { id: 'home', icon: 'home', title: 'Home & Timetable', desc: 'Managing your daily schedule and attendance.' },
                               { id: 'myclass', icon: 'school', title: 'My Class Hub', desc: 'Comprehensive monitoring for Class Incharges.' },
                               { id: 'notifs', icon: 'notifications', title: 'Notifications & Alerts', desc: 'Managing requests and system updates.' },
                               { id: 'swaps', icon: 'swap-horizontal', title: 'Swaps & Substitutions', desc: 'Workflows for exchanging classes.' },
                               { id: 'history', icon: 'time', title: 'History & Logs', desc: 'Tracking your past classes and swaps.' },
                               { id: 'profile', icon: 'person', title: 'Profile & Utilities', desc: 'Digital ID, Leaves, and Reports.' },
                           ].map((item, idx) => (
                               <TouchableOpacity 
                                    key={idx}
                                    onPress={() => setHelpTopic(item.id)}
                                    activeOpacity={0.7}
                                    style={{ 
                                        flexDirection: 'row', 
                                        alignItems: 'center', 
                                        padding: scale(16), 
                                        backgroundColor: isDark ? '#1E293B' : '#FFF',
                                        marginBottom: verticalScale(16),
                                        borderRadius: moderateScale(16),
                                        borderWidth: 1,
                                        borderColor: isDark ? '#334155' : '#E2E8F0',
                                        elevation: 2
                                    }}
                               >
                                   <View style={{ width: scale(48), height: scale(48), borderRadius: moderateScale(12), backgroundColor: isDark ? '#334155' : '#F0FDFA', alignItems: 'center', justifyContent: 'center', marginRight: scale(16) }}>
                                        <Ionicons name={item.icon as any} size={normalizeFont(24)} color="#0D9488" />
                                   </View>
                                   <View style={{ flex: 1 }}>
                                       <Text style={{ fontSize: normalizeFont(16), fontWeight: '700', color: isDark ? '#FFF' : '#0F172A', marginBottom: verticalScale(4) }}>{item.title}</Text>
                                       <Text style={{ fontSize: normalizeFont(13), color: isDark ? '#94A3B8' : '#64748B' }}>{item.desc}</Text>
                                   </View>
                                   <Ionicons name="chevron-forward" size={normalizeFont(20)} color={isDark ? '#64748B' : '#CBD5E1'} />
                               </TouchableOpacity>
                           ))}
                        </View>
                    )}

                    {helpTopic && (
                        /* --- DETAILED VIEWS --- */
                        <View>
                           {helpTopic === 'home' && (
                               <>
                                 <View style={{ marginBottom: 24 }}>
                                     <Text style={{ fontSize: 15, color: isDark ? '#E2E8F0' : '#475569', lineHeight: 26 }}>
                                         The **Home Screen** is designed to give you instant access to your classes without clutter.
                                     </Text>
                                 </View>
                                 
                                 <View style={{ backgroundColor: isDark ? '#1E293B' : '#FFF', padding: 20, borderRadius: 16, marginBottom: 20 }}>
                                     <Text style={{ fontWeight: '800', color: '#0D9488', marginBottom: 12, fontSize: 18 }}>1. Live Timetable</Text>
                                     <Text style={{ fontSize: 14, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 24 }}>
                                         Your daily classes are displayed in a vertical timeline. {"\n\n"}
                                         • **Current Class**: Highlighted with a large card at the top. This represents the class happening *right now*. Tap anywhere on this card to immediately open the Attendance Scanner. {"\n"}
                                         • **Upcoming Classes**: Listed below with time slots (e.g., 10:00 AM - 11:00 AM). You can tap these to view details or request a swap ahead of time. {"\n"}
                                         • **Past Classes**: Dimmed out to indicate completion.
                                     </Text>
                                 </View>

                                 <View style={{ backgroundColor: isDark ? '#1E293B' : '#FFF', padding: 20, borderRadius: 16, marginBottom: 20 }}>
                                     <Text style={{ fontWeight: '800', color: '#0D9488', marginBottom: 12, fontSize: 18 }}>2. Sync Status</Text>
                                     <Text style={{ fontSize: 14, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 24 }}>
                                         It is vital to know if your attendance data is reaching the server. {"\n\n"}
                                         • **Cloud Icon (Solid)**: You are online. All changes sync instantly. {"\n"}
                                         • **Cloud Icon (Slashed)**: You are offline. Don't worry, the app automatically saves everything to local storage. It will push the data to the server the moment you reconnect.
                                     </Text>
                                 </View>
                               </>
                           )}

                           {helpTopic === 'myclass' && (
                               <>
                                 <View style={{ marginBottom: 24 }}>
                                     <Text style={{ fontSize: 15, color: isDark ? '#E2E8F0' : '#475569', lineHeight: 26 }}>
                                         The **My Class Hub** is a dashboard specifically for Class Incharges. It provides a bird's-eye view of your assigned class's performance.
                                     </Text>
                                 </View>
                                 
                                 <View style={{ backgroundColor: isDark ? '#1E293B' : '#FFF', padding: 20, borderRadius: 16, marginBottom: 20 }}>
                                     <Text style={{ fontWeight: '800', color: '#0D9488', marginBottom: 12, fontSize: 18 }}>1. Class Metrics</Text>
                                     <Text style={{ fontSize: 14, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 24 }}>
                                         At the top, you see aggregate data for your section: {"\n"}
                                         • **Total Strength**: Number of students enrolled. {"\n"}
                                         • **Avg Attendance**: The class average for the current semester.
                                     </Text>
                                 </View>

                                 <View style={{ backgroundColor: isDark ? '#1E293B' : '#FFF', padding: 20, borderRadius: 16 }}>
                                     <Text style={{ fontWeight: '800', color: '#0D9488', marginBottom: 12, fontSize: 18 }}>2. Watchlist & Trends</Text>
                                     <Text style={{ fontSize: 14, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 24 }}>
                                         • **Watchlist**: Automatically flags students with low attendance (below 75%). Tap a student card to send a warning notification. {"\n"}
                                         • **Weekly Trends**: A graph showing attendance patterns over the last 7 days. Use this to identify low-attendance days (e.g., Fridays or Mondays).
                                     </Text>
                                 </View>
                               </>
                           )}

                           {helpTopic === 'notifs' && (
                               <>
                                 <View style={{ marginBottom: 24 }}>
                                     <Text style={{ fontSize: 15, color: isDark ? '#E2E8F0' : '#475569', lineHeight: 26 }}>
                                         The **Notifications Screen** is where collaboration happens. It handles all incoming requests and system alerts.
                                     </Text>
                                 </View>
                                 
                                 <View style={{ backgroundColor: isDark ? '#1E293B' : '#FFF', padding: 20, borderRadius: 16, marginBottom: 20 }}>
                                     <Text style={{ fontWeight: '800', color: '#0D9488', marginBottom: 12, fontSize: 18 }}>1. Handling Requests</Text>
                                     <Text style={{ fontSize: 14, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 24 }}>
                                         When a colleague Requests a Swap or Substitution, a dedicated card appears at the top. {"\n\n"}
                                         • **ACCEPT**: By tapping this, you agree to take their class. The schedule is automatically updated for both of you. {"\n"}
                                         • **DECLINE**: Removes the request. The requester will be notified that you are unavailable.
                                     </Text>
                                 </View>

                                 <View style={{ backgroundColor: isDark ? '#1E293B' : '#FFF', padding: 20, borderRadius: 16 }}>
                                     <Text style={{ fontWeight: '800', color: '#0D9488', marginBottom: 12, fontSize: 18 }}>2. Bulk Actions</Text>
                                     <Text style={{ fontSize: 14, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 24 }}>
                                         To manage a cluttered inbox: {"\n"}
                                         • **Swipe Left**: Delete a single notification. {"\n"}
                                         • **Long Press**: Enter "Selection Mode". Tap multiple items and delete them all at once.
                                     </Text>
                                 </View>
                               </>
                           )}

                           {helpTopic === 'swaps' && (
                               <>
                                 <View style={{ marginBottom: 24 }}>
                                     <Text style={{ fontSize: 15, color: isDark ? '#E2E8F0' : '#475569', lineHeight: 26 }}>
                                         The **Swap System** is a formal way to exchange classes without administrative friction.
                                     </Text>
                                 </View>
                                 
                                 <View style={{ backgroundColor: isDark ? '#1E293B' : '#FFF', padding: 20, borderRadius: 16, marginBottom: 20 }}>
                                     <Text style={{ fontWeight: '800', color: '#0D9488', marginBottom: 12, fontSize: 18 }}>1. Requesting a Substitution</Text>
                                     <Text style={{ fontSize: 14, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 24 }}>
                                         If you need to miss a class: {"\n"}
                                         1. Navigate to **Home Screen {'->'} Timetable**. {"\n"}
                                         2. Tap the class you want to give away. {"\n"}
                                         3. Select **Request Substitution**. {"\n"}
                                         4. Choose a faculty member from the list.
                                     </Text>
                                 </View>

                                 <View style={{ backgroundColor: isDark ? '#1E293B' : '#FFF', padding: 20, borderRadius: 16 }}>
                                     <Text style={{ fontWeight: '800', color: '#0D9488', marginBottom: 12, fontSize: 18 }}>2. History Tracking</Text>
                                     <Text style={{ fontSize: 14, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 24 }}>
                                         The **Swap History** screen acts as your logbook. {"\n\n"}
                                         • **Sent Requests**: See if your requests have been Accepted, Declined, or are still Pending. {"\n"}
                                         • **Received Requests**: Review classes you have taken for others. This is useful for year-end reporting.
                                     </Text>
                                 </View>
                               </>
                           )}

                           {helpTopic === 'history' && (
                               <>
                                 <View style={{ marginBottom: 24 }}>
                                     <Text style={{ fontSize: 15, color: isDark ? '#E2E8F0' : '#475569', lineHeight: 26 }}>
                                         The **History Screen** acts as your digital register, archiving all classes you have conducted.
                                     </Text>
                                 </View>
                                 
                                 <View style={{ backgroundColor: isDark ? '#1E293B' : '#FFF', padding: 20, borderRadius: 16, marginBottom: 20 }}>
                                     <Text style={{ fontWeight: '800', color: '#0D9488', marginBottom: 12, fontSize: 18 }}>1. Class logs</Text>
                                     <Text style={{ fontSize: 14, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 24 }}>
                                         Every time you submit attendance (Manual or Scan), a permanent log is created. {"\n"}
                                         • **Details**: Tap any specific date to see the list of students present/absent. {"\n"}
                                         • **Editing**: You generally cannot edit past logs once synced, but you can view them for reporting.
                                     </Text>
                                 </View>

                                 <View style={{ backgroundColor: isDark ? '#1E293B' : '#FFF', padding: 20, borderRadius: 16 }}>
                                     <Text style={{ fontWeight: '800', color: '#0D9488', marginBottom: 12, fontSize: 18 }}>2. Date Sorting</Text>
                                     <Text style={{ fontSize: 14, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 24 }}>
                                         • **Sections**: Logs are grouped by "Today", "Yesterday", "This Week", and "Older". {"\n"}
                                         • **Offline**: These logs are cached locally, so you can view your teaching history even without internet.
                                     </Text>
                                 </View>
                               </>
                           )}

                           {helpTopic === 'profile' && (
                               <>
                                 <View style={{ marginBottom: 24 }}>
                                     <Text style={{ fontSize: 15, color: isDark ? '#E2E8F0' : '#475569', lineHeight: 26 }}>
                                         Your personal settings and college services.
                                     </Text>
                                 </View>
                                 
                                 <View style={{ backgroundColor: isDark ? '#1E293B' : '#FFF', padding: 20, borderRadius: 16, marginBottom: 20 }}>
                                     <Text style={{ fontWeight: '800', color: '#0D9488', marginBottom: 12, fontSize: 18 }}>1. Digital ID</Text>
                                     <Text style={{ fontSize: 14, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 24 }}>
                                         Your official ID. **Note**: For security, this card is now only available when you are online to ensure verification of active status. Offline access has been disabled.
                                     </Text>
                                 </View>

                                 <View style={{ backgroundColor: isDark ? '#1E293B' : '#FFF', padding: 20, borderRadius: 16 }}>
                                     <Text style={{ fontWeight: '800', color: '#0D9488', marginBottom: 12, fontSize: 18 }}>2. Leaves & Reports</Text>
                                     <Text style={{ fontSize: 14, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 24 }}>
                                         • **Apply for Leave**: Submits a formal leave request to the HOD. Note that you should still arrange substitutions for your classes using the Swap feature. {"\n"}
                                         • **Report Issue**: If you encounter a bug, use this to attach a screenshot and send it to our dev team.
                                     </Text>
                                 </View>
                               </>
                           )}

                           <View style={{ height: 60 }} />
                        </View>
                    )}
               </ScrollView>
           </View>
      </Modal>

      {/* --- Report Modal --- */}
      <Modal visible={reportModalVisible} animationType="slide" transparent onRequestClose={() => setReportModalVisible(false)}>
          <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFF', borderWidth: 1, borderColor: isDark ? '#334155' : 'transparent' }]}>
                  
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(16) }}>
                      <View style={{ width: scale(40), height: scale(40), borderRadius: moderateScale(10), backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2', alignItems: 'center', justifyContent: 'center', marginRight: scale(12) }}>
                          <Ionicons name="warning" size={normalizeFont(20)} color="#EF4444" />
                      </View>
                      <View>
                          <Text style={[styles.modalTitle, { color: isDark ? '#FFF' : '#0F172A', marginBottom: verticalScale(2), fontSize: normalizeFont(18) }]}>Report Issue</Text>
                          <Text style={{ fontSize: normalizeFont(12), color: isDark ? '#94A3B8' : '#64748B' }}>Help us improve the system</Text>
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
                             <Image source={{ uri: reportImage }} style={{ width: scale(40), height: scale(40), borderRadius: moderateScale(8) }} />
                             <View style={{ justifyContent: 'center' }}>
                                 <Text style={{ color: '#10B981', fontSize: normalizeFont(13), fontWeight: '600' }}>Image Attached</Text>
                                 <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: normalizeFont(11) }}>Tap to change</Text>
                             </View>
                          </>
                      ) : (
                          <>
                            <View style={{ width: scale(32), height: scale(32), borderRadius: moderateScale(100), backgroundColor: isDark ? '#334155' : '#E2E8F0', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="image" size={normalizeFont(16)} color="#94A3B8" />
                            </View>
                            <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: normalizeFont(13), fontWeight: '600' }}>
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
  section: { marginBottom: verticalScale(24), paddingHorizontal: scale(20) },
  sectionTitle: { fontSize: normalizeFont(12), fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: verticalScale(12), marginLeft: scale(4) },
  menuCard: { borderRadius: moderateScale(16), overflow: 'hidden', shadowColor: '#64748B', shadowOffset: { width: 0, height: verticalScale(4) }, shadowOpacity: 0.05, shadowRadius: moderateScale(12), elevation: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: scale(16) },
  menuItemBorder: { borderBottomWidth: 1 },
  menuIconContainer: { width: scale(32), height: scale(32), borderRadius: moderateScale(8), justifyContent: 'center', alignItems: 'center', marginRight: scale(14) },
  menuContent: { flex: 1 },
  menuLabel: { fontSize: normalizeFont(15), fontWeight: '600' },
  menuValue: { fontSize: normalizeFont(13), marginTop: verticalScale(2) },
  logoutContainer: { marginTop: verticalScale(10) },
  versionText: { textAlign: 'center', fontSize: normalizeFont(12), marginTop: verticalScale(24), fontWeight: '500' },
  
  // Modal & Toast
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: scale(24) },
  modalCard: { borderRadius: moderateScale(24), padding: scale(24) },
  modalCardFull: { borderRadius: moderateScale(24), padding: scale(24), maxHeight: '80%' },
  modalTitle: { fontSize: normalizeFont(20), fontWeight: '700', marginBottom: verticalScale(12) },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: verticalScale(16) },
  inputLabel: { fontSize: normalizeFont(11), fontWeight: '700', marginBottom: verticalScale(6), letterSpacing: 0.5 },
  input: { borderRadius: moderateScale(12), padding: scale(12), borderWidth: 1, fontSize: normalizeFont(15), borderColor: '#E2E8F0', marginBottom: verticalScale(16) },
  dateBtn: { padding: scale(12), borderRadius: moderateScale(12), borderWidth: 1, borderColor: '#334155', alignItems: 'center' },
  photoUpload: { height: verticalScale(80), borderWidth: 2, borderStyle: 'dashed', borderRadius: moderateScale(12), justifyContent: 'center', alignItems: 'center', gap: scale(8) },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: verticalScale(12), gap: scale(12) },
  cancelBtn: { paddingVertical: verticalScale(12), paddingHorizontal: scale(16) },
  cancelText: { color: '#64748B', fontWeight: '600' },
  saveBtn: { backgroundColor: '#0F766E', paddingVertical: verticalScale(12), paddingHorizontal: scale(24), borderRadius: moderateScale(12), alignItems: 'center' },
  saveText: { color: '#FFF', fontWeight: '700' },
  
  // Toast
  toastContainer: { position: 'absolute', top: verticalScale(60), left: scale(20), right: scale(20), zIndex: 100, alignItems: 'center' },
  toastContent: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: scale(16), paddingVertical: verticalScale(12), borderRadius: moderateScale(100), shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: moderateScale(10), elevation: 5, gap: scale(8), borderWidth: 1, borderColor: '#E2E8F0' },
  toastText: { fontWeight: '600', color: '#0F766E', fontSize: normalizeFont(13) },

  // Schedule Table
  tableRow: { flexDirection: 'row' },
  cellFixed: { width: scale(70), padding: scale(12), borderWidth: 0.5, alignItems: 'center', justifyContent: 'center' },
  cell: { width: scale(90), padding: scale(12), borderWidth: 0.5, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: normalizeFont(13), textAlign: 'center' },
  cellTextBold: { fontSize: normalizeFont(13), fontWeight: '800', textAlign: 'center' },
  
  // Date Picker
  dateOption: { paddingVertical: verticalScale(16), borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // Background Orbs
  orb: {
    position: 'absolute',
    borderRadius: moderateScale(200),
  },
  orb1: {
    width: scale(300),
    height: scale(300),
    backgroundColor: 'rgba(61, 220, 151, 0.15)',
    top: -verticalScale(100),
    right: -scale(100),
  },
  orb2: {
    width: scale(250),
    height: scale(250),
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    bottom: verticalScale(200),
    left: -scale(80),
  },
  orb3: {
    width: scale(180),
    height: scale(180),
    backgroundColor: 'rgba(61, 220, 151, 0.08)',
    bottom: verticalScale(400),
    right: -scale(40),
  },
});


