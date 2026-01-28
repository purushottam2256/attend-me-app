/**
 * PermissionScreen - Add Leave or OD for students
 *
 * Features:
 * - Switch between Leave and OD
 * - Select Student (Dropdown/Search)
 * - Date/Time Pickers
 * - Overlap Check
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
// import DateTimePicker from "@react-native-community/datetimepicker";
import { CustomDateTimePicker } from '../components/CustomDateTimePicker';
import * as Haptics from "expo-haptics";

import { useTheme } from "../../../contexts";
import { supabase } from "../../../config/supabase";
import { StudentSelectionList } from '../components/StudentSelectionList';
import {
  getClassStudents,
  addPermission,
  getAssignedClass,
  type StudentAggregate,
} from "../services/inchargeService";

type PermissionType = "leave" | "od";
type ODCategory = "dept_work" | "club_work" | "event" | "drive" | "other";

export const PermissionScreen: React.FC = () => {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  // State
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [students, setStudents] = useState<StudentAggregate[]>([]);

  // Form State
  const [type, setType] = useState<PermissionType>("leave");
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [startTime, setStartTime] = useState(new Date()); // Default 9:30 AM
  const [endTime, setEndTime] = useState(new Date()); // Default 4:00 PM
  const [category, setCategory] = useState<ODCategory>("dept_work");
  const [reason, setReason] = useState("");

  // Date Picker Visibility
  const [showStartDate, setShowStartDate] = useState(false);
  const [showEndDate, setShowEndDate] = useState(false);
  const [showStartTime, setShowStartTime] = useState(false);
  const [showEndTime, setShowEndTime] = useState(false);

  // Load students on mount
  useEffect(() => {
    loadStudents();

    // Set default times
    const start = new Date();
    start.setHours(9, 30, 0, 0);
    setStartTime(start);

    const end = new Date();
    end.setHours(16, 0, 0, 0);
    setEndTime(end);
  }, []);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const classInfo = await getAssignedClass(user.id);
      
      if (!classInfo) {
        Alert.alert("Error", "No class assigned to you as Incharge.");
        return;
      }

      const classStudents = await getClassStudents(classInfo.dept, classInfo.year, classInfo.section);
      setStudents(classStudents);
    } catch (error) {
      console.error("Error loading students:", error);
      Alert.alert("Error", "Failed to load student list");
    } finally {
      setLoading(false);
    }
  };

  const toggleStudentSelection = (id: string) => {
    const newSet = new Set(selectedStudentIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedStudentIds(newSet);
  };

  const handleSubmit = async () => {
    if (selectedStudentIds.size === 0) {
      Alert.alert("Required", "Please select at least one student");
      return;
    }

    if (type === "od" && !reason.trim() && category === "other") {
      Alert.alert("Required", "Please specify a reason for Other category");
      return;
    }

    setSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const promises = Array.from(selectedStudentIds).map(async (studentId) => {
        return addPermission({
            student_id: studentId,
            type,
            start_date: startDate.toISOString().split("T")[0],
            end_date: endDate.toISOString().split("T")[0],
            start_time:
              type === "od" ? startTime.toTimeString().split(" ")[0] : undefined,
            end_time:
              type === "od" ? endTime.toTimeString().split(" ")[0] : undefined,
            category: type === "od" ? category : undefined,
            reason: reason.trim(),
            granted_by: user.id,
          });
      });

      await Promise.all(promises);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Success",
        `${type === "leave" ? "Leave" : "OD"} granted for ${selectedStudentIds.size} student(s)`,
        [{ text: "OK", onPress: () => navigation.goBack() }],
      );
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      console.error(error);
      Alert.alert("Error", error.message || "Failed to grant permissions. Some permissions may have overlapped.");
    } finally {
      setSubmitting(false);
    }
  };

  // Colors
  const colors = {
    bg: isDark ? "#0F172A" : "#F8FAFC",
    card: isDark ? "#1E293B" : "#FFFFFF",
    text: isDark ? "#FFFFFF" : "#0F172A",
    textSec: isDark ? "#94A3B8" : "#64748B",
    border: isDark ? "#334155" : "#E2E8F0",
    
    // Professional Palettes
    leave: {
        primary: "#F97316", // Orange-500
        dark: "#C2410C",    // Orange-700
        bg: isDark ? "rgba(249, 115, 22, 0.15)" : "#FFF7ED", // Orange-50
        border: "#FB923C",
    },
    od: {
        primary: "#6366F1", // Indigo-500
        dark: "#4338CA",    // Indigo-700
        bg: isDark ? "rgba(99, 102, 241, 0.15)" : "#EEF2FF", // Indigo-50
        border: "#818CF8",
    },
    accent: "#3DDC97",
  };

  const renderStudentPicker = () => (
    <Modal
      visible={showStudentModal}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowStudentModal(false)}
    >
      <View style={[styles.modalContent, { backgroundColor: colors.bg, flex: 1, padding: 0, borderRadius: 0 }]}>
          <View style={{ 
            padding: 16, 
            borderBottomWidth: 1, 
            borderBottomColor: colors.border, 
            flexDirection: 'row', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            backgroundColor: colors.card,
          }}>
            <TouchableOpacity onPress={() => setShowStudentModal(false)}>
              <Text style={{ color: colors.textSec, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 0, fontSize: 17 }]}>
              Select Students ({selectedStudentIds.size})
            </Text>
            <TouchableOpacity onPress={() => setShowStudentModal(false)}>
              <Text style={{ color: type === 'leave' ? colors.leave.primary : colors.od.primary, fontWeight: '600', fontSize: 16 }}>Done</Text>
            </TouchableOpacity>
          </View>
          
          <View style={{ flex: 1 }}>
            <StudentSelectionList
              students={students}
              selectedIds={selectedStudentIds}
              onToggle={toggleStudentSelection}
              activeColor={type === 'leave' ? colors.leave.primary : colors.od.primary}
              activeBgColor={type === 'leave' ? colors.leave.bg : colors.od.bg}
            />
          </View>

          {/* Floating Done Button */}
          {selectedStudentIds.size > 0 && (
            <View style={{ position: 'absolute', bottom: 30, left: 0, right: 0, alignItems: 'center', pointerEvents: 'box-none' }}>
              <TouchableOpacity 
                style={{
                  backgroundColor: type === 'leave' ? colors.leave.primary : colors.od.primary,
                  paddingHorizontal: 32,
                  paddingVertical: 14,
                  borderRadius: 30,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 4.65,
                  elevation: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8
                }}
                onPress={() => setShowStudentModal(false)}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark" size={20} color="#FFF" />
                <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '700' }}>
                  Done ({selectedStudentIds.size})
                </Text>
              </TouchableOpacity>
            </View>
          )}
      </View>
    </Modal>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 16, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Grant Permission
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Type Selector */}
        <View style={[styles.typeContainer, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[
              styles.typeBtn,
              type === "leave" && {
                backgroundColor: colors.leave.bg,
                borderColor: colors.leave.border,
                borderWidth: 1,
              },
            ]}
            onPress={() => setType("leave")}
          >
            <Ionicons
              name="calendar"
              size={20}
              color={type === "leave" ? colors.leave.dark : colors.textSec}
            />
            <Text
              style={[
                styles.typeText,
                {
                  color: type === "leave" ? colors.leave.dark : colors.textSec,
                  fontWeight: type === "leave" ? "700" : "500",
                },
              ]}
            >
              Leave Request
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.typeBtn,
              type === "od" && {
                backgroundColor: colors.od.bg,
                borderColor: colors.od.border,
                borderWidth: 1,
              },
            ]}
            onPress={() => setType("od")}
          >
            <Ionicons
              name="briefcase"
              size={20}
              color={type === "od" ? colors.od.dark : colors.textSec}
            />
            <Text
              style={[
                styles.typeText,
                {
                  color: type === "od" ? colors.od.dark : colors.textSec,
                  fontWeight: type === "od" ? "700" : "500",
                },
              ]}
            >
              On Duty (OD)
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form Fields */}
        <View style={styles.form}>
          {/* Student Selector */}
          <Text style={[styles.label, { color: colors.textSec }]}>Student</Text>
          <TouchableOpacity
            style={[
              styles.input,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => setShowStudentModal(true)}
          >
            {selectedStudentIds.size > 0 ? (
              <View>
                <Text style={[styles.inputText, { color: colors.text }]}>
                  {selectedStudentIds.size} Students Selected
                </Text>
                <Text style={[styles.helperText, { color: colors.textSec }]}>
                  Tap to view list
                </Text>
              </View>
            ) : (
              <Text style={[styles.placeholder, { color: colors.textSec }]}>
                Select students
              </Text>
            )}
            <Ionicons name="chevron-down" size={20} color={colors.textSec} />
          </TouchableOpacity>

          {/* Dates */}
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={[styles.label, { color: colors.textSec }]}>
                From Date
              </Text>
              <TouchableOpacity
                style={[
                  styles.input,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                onPress={() => setShowStartDate(true)}
              >
                <Text style={[styles.inputText, { color: colors.text }]}>
                  {startDate.toLocaleDateString()}
                </Text>
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={colors.textSec}
                />
              </TouchableOpacity>
            </View>
            <View style={styles.col}>
              <Text style={[styles.label, { color: colors.textSec }]}>
                To Date
              </Text>
              <TouchableOpacity
                style={[
                  styles.input,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                onPress={() => setShowEndDate(true)}
              >
                <Text style={[styles.inputText, { color: colors.text }]}>
                  {endDate.toLocaleDateString()}
                </Text>
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={colors.textSec}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Time (OD Only) */}
          {type === "od" && (
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={[styles.label, { color: colors.textSec }]}>
                  Start Time
                </Text>
                <TouchableOpacity
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => setShowStartTime(true)}
                >
                  <Text style={[styles.inputText, { color: colors.text }]}>
                    {startTime.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                  <Ionicons
                    name="time-outline"
                    size={18}
                    color={colors.textSec}
                  />
                </TouchableOpacity>
              </View>
              <View style={styles.col}>
                <Text style={[styles.label, { color: colors.textSec }]}>
                  End Time
                </Text>
                <TouchableOpacity
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => setShowEndTime(true)}
                >
                  <Text style={[styles.inputText, { color: colors.text }]}>
                    {endTime.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                  <Ionicons
                    name="time-outline"
                    size={18}
                    color={colors.textSec}
                  />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Category (OD Only) */}
          {type === "od" && (
            <>
              <Text style={[styles.label, { color: colors.textSec }]}>
                Category
              </Text>
              <View style={styles.chipsContainer}>
                {(
                  [
                    "dept_work",
                    "club_work",
                    "event",
                    "drive",
                    "other",
                  ] as ODCategory[]
                ).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.chip,
                      {
                        borderColor:
                          category === cat ? colors.od.primary : colors.border,
                        backgroundColor:
                          category === cat
                            ? colors.od.bg
                            : "transparent",
                      },
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        {
                          color: category === cat ? colors.od.dark : colors.textSec,
                        },
                      ]}
                    >
                      {cat
                        .replace("_", " ")
                        .replace(/\b\w/g, (l) => l.toUpperCase())}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Reason */}
          <Text style={[styles.label, { color: colors.textSec }]}>
            Reason {type === "od" && category === "other" && "*"}
          </Text>
          <TextInput
            style={[
              styles.textArea,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            placeholder="Enter reason..."
            placeholderTextColor={colors.textSec}
            multiline
            numberOfLines={3}
            value={reason}
            onChangeText={setReason}
          />
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            {
              backgroundColor: type === "leave" ? colors.leave.primary : colors.od.primary,
              opacity: submitting ? 0.7 : 1,
            },
          ]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitBtnText}>
              Grant {type === "leave" ? "Leave" : "OD"}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Pickers */}
      {/* Pickers */}
      <CustomDateTimePicker
        visible={showStartDate}
        mode="date"
        value={startDate}
        onClose={() => setShowStartDate(false)}
        onChange={(date) => {
          setStartDate(date);
          if (date > endDate) setEndDate(date);
        }}
        isDark={isDark}
      />
      <CustomDateTimePicker
        visible={showEndDate}
        mode="date"
        value={endDate}
        onClose={() => setShowEndDate(false)}
        onChange={(date) => {
          setEndDate(date);
        }}
        minimumDate={startDate}
        isDark={isDark}
      />
      <CustomDateTimePicker
        visible={showStartTime}
        mode="time"
        value={startTime}
        onClose={() => setShowStartTime(false)}
        onChange={(date) => setStartTime(date)}
        isDark={isDark}
      />
      <CustomDateTimePicker
        visible={showEndTime}
        mode="time"
        value={endTime}
        onClose={() => setShowEndTime(false)}
        onChange={(date) => setEndTime(date)}
        isDark={isDark}
      />


      {renderStudentPicker()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  typeContainer: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 12,
    marginBottom: 24,
  },
  typeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
  },
  typeText: {
    fontSize: 15,
  },
  form: {
    gap: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: -8,
  },
  input: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  inputText: {
    fontSize: 15,
    fontWeight: "500",
  },
  placeholder: {
    fontSize: 15,
  },
  helperText: {
    fontSize: 12,
    marginTop: 2,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  col: {
    flex: 1,
    gap: 8,
  },
  chipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  textArea: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 80,
    textAlignVertical: "top",
    fontSize: 15,
  },
  submitBtn: {
    marginTop: 32,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalContent: {
    height: "70%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
  },
  studentList: {
    flex: 1,
  },
  studentItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: "600",
  },
  studentRoll: {
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    marginTop: 16,
    paddingVertical: 14,
    backgroundColor: "#334155",
    borderRadius: 12,
    alignItems: "center",
  },
  closeBtnText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
