import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";

import { useTheme } from "../../../contexts";
import { scale, verticalScale, moderateScale, normalizeFont } from "../../../utils/responsive";
import { supabase } from "../../../config/supabase";
import { ZenToast } from "../../../components/ZenToast";
import { ConfirmationModal } from "../../../components/ConfirmationModal";
import {
  getPermissions,
  deletePermission,
  updatePermission,
  type Permission,
} from "../services/inchargeService";
import { CustomDateTimePicker } from "../components/CustomDateTimePicker";

export const ManagePermissionsScreen: React.FC = () => {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [permissions, setPermissions] = useState<
    (Permission & { student?: { full_name: string; roll_no: string } })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "active">("active");

  // UI State
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "warning";
  }>({
    visible: false,
    message: "",
    type: "success",
  });
  const [permissionToDelete, setPermissionToDelete] = useState<string | null>(
    null,
  );

  // Edit State
  const [editingPermission, setEditingPermission] = useState<
    (Permission & { student?: { full_name: string; roll_no: string } }) | null
  >(null);
  const [editStartDate, setEditStartDate] = useState(new Date());
  const [editEndDate, setEditEndDate] = useState(new Date());
  const [editReason, setEditReason] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "od" | "leave">("all");
  const [showFilters, setShowFilters] = useState(false);

  const filteredPermissions = permissions.filter((p) => {
    const matchesStatus = filter === "all" || p.is_active;
    const matchesType = typeFilter === "all" || p.type === typeFilter;
    return matchesStatus && matchesType;
  });

  const colors = {
    bg: isDark ? "#0F172A" : "#F8FAFC",
    card: isDark ? "#1E293B" : "#FFFFFF",
    text: isDark ? "#FFFFFF" : "#0F172A",
    textSec: isDark ? "#94A3B8" : "#64748B",
    border: isDark ? "#334155" : "#E2E8F0",
    delete: "#EF4444",
    leave: isDark ? "#F97316" : "#EA580C",
    od: isDark ? "#818CF8" : "#4F46E5",
  };

  const loadPermissions = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const data = await getPermissions(user.id);
      setPermissions(data);
    } catch (error) {
      console.error(error);
      setToast({
        visible: true,
        message: "Failed to load permissions",
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPermissions();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadPermissions();
  };

  const startEdit = (
    perm: Permission & { student?: { full_name: string; roll_no: string } },
  ) => {
    setEditingPermission(perm);
    setEditStartDate(new Date(perm.start_date));
    setEditEndDate(new Date(perm.end_date));
    setEditReason(perm.reason || "");
  };

  const handleUpdate = async () => {
    if (!editingPermission) return;

    // Basic validation
    if (editEndDate < editStartDate) {
      setToast({
        visible: true,
        message: "End date cannot be before start date",
        type: "warning",
      });
      return;
    }

    try {
      setLoading(true);
      await updatePermission(editingPermission.id, {
        start_date: editStartDate.toISOString().split("T")[0],
        end_date: editEndDate.toISOString().split("T")[0],
        reason: editReason,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingPermission(null);
      loadPermissions(); // Refresh list
    } catch (error: any) {
      setToast({
        visible: true,
        message: error.message || "Could not update permission",
        type: "error",
      });
      setLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    setPermissionToDelete(id);
  };

  const confirmDelete = async () => {
    if (!permissionToDelete) return;

    try {
      await deletePermission(permissionToDelete);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setToast({
        visible: true,
        message: "Permission revoked",
        type: "success",
      });
      loadPermissions();
    } catch (error) {
      setToast({
        visible: true,
        message: "Failed to revoke permission",
        type: "error",
      });
    } finally {
      setPermissionToDelete(null);
    }
  };

  const renderItem = ({
    item,
  }: {
    item: Permission & { student?: { full_name: string; roll_no: string } };
  }) => {
    const isLeave = item.type === "leave";
    const color = isLeave ? colors.leave : colors.od;
    const isActive = item.is_active;

    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: isActive ? 1 : 0.6,
          },
        ]}
      >
        <View style={[styles.cardHeader, { borderBottomColor: colors.border }]}>
          <View style={styles.headerLeft}>
            <View
              style={[
                styles.typeBadge,
                {
                  backgroundColor: isLeave
                    ? "rgba(249, 115, 22, 0.1)"
                    : "rgba(99, 102, 241, 0.1)",
                },
              ]}
            >
              <Text style={[styles.typeText, { color: color }]}>
                {item.type.toUpperCase()}
              </Text>
            </View>
            {!isActive && (
              <View style={[styles.badge, { backgroundColor: colors.border }]}>
                <Text style={[styles.badgeText, { color: colors.textSec }]}>
                  REVOKED
                </Text>
              </View>
            )}
          </View>
          {isActive && (
            <View style={{ flexDirection: "row", gap: scale(12) }}>
              <TouchableOpacity
                onPress={() => startEdit(item)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="create-outline"
                  size={normalizeFont(20)}
                  color={colors.textSec}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDelete(item.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="trash-outline"
                  size={normalizeFont(20)}
                  color={colors.delete}
                />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <Text style={[styles.studentName, { color: colors.text }]}>
            {item.student?.full_name || "Unknown Student"}
          </Text>
          <Text style={[styles.rollNo, { color: colors.textSec }]}>
            {item.student?.roll_no || "No Roll No"}
          </Text>

          <View style={styles.dateRow}>
            <Ionicons
              name="calendar-outline"
              size={normalizeFont(16)}
              color={colors.textSec}
            />
            <Text style={[styles.dateText, { color: colors.text }]}>
              {item.start_date}{" "}
              {item.start_date !== item.end_date && ` - ${item.end_date}`}
            </Text>
          </View>

          {item.type === "od" && (
            <View style={styles.detailsRow}>
              {item.category && (
                <View style={[styles.chip, { borderColor: colors.border }]}>
                  <Text style={[styles.chipText, { color: colors.textSec }]}>
                    {item.category.replace("_", " ")}
                  </Text>
                </View>
              )}
              {item.start_time && (
                <Text style={[styles.timeText, { color: colors.textSec }]}>
                  {item.start_time.slice(0, 5)} - {item.end_time?.slice(0, 5)}
                </Text>
              )}
            </View>
          )}

          {item.reason && (
            <Text
              style={[styles.reason, { color: colors.textSec }]}
              numberOfLines={2}
            >
              "{item.reason}"
            </Text>
          )}
        </View>
      </View>
    );
  };

  // Date Picker State
  const [pickerType, setPickerType] = useState<"start" | "end" | null>(null);

  const onDateChange = (date: Date) => {
    if (pickerType === "start") {
      setEditStartDate(date);
    } else if (pickerType === "end") {
      setEditEndDate(date);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + verticalScale(16), borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={normalizeFont(24)} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Manage Permissions
        </Text>
        <View style={{ flexDirection: "row", gap: scale(12) }}>
          <TouchableOpacity onPress={() => setShowFilters(!showFilters)}>
            <Ionicons
              name={showFilters ? "filter" : "filter-outline"}
              size={normalizeFont(20)}
              color={colors.text}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={onRefresh}>
            <Ionicons name="refresh" size={normalizeFont(20)} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Tabs - Collapsible */}
      {showFilters && (
        <View>
          <View
            style={[
              styles.tabs,
              {
                backgroundColor: colors.card,
                marginHorizontal: scale(16),
                marginTop: verticalScale(16),
                borderRadius: moderateScale(12),
                padding: scale(4),
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.tab,
                filter === "active" && {
                  backgroundColor: isDark ? "#334155" : "#F1F5F9",
                },
              ]}
              onPress={() => setFilter("active")}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: filter === "active" ? colors.text : colors.textSec,
                    fontWeight: filter === "active" ? "600" : "400",
                  },
                ]}
              >
                Active Only
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tab,
                filter === "all" && {
                  backgroundColor: isDark ? "#334155" : "#F1F5F9",
                },
              ]}
              onPress={() => setFilter("all")}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: filter === "all" ? colors.text : colors.textSec,
                    fontWeight: filter === "all" ? "600" : "400",
                  },
                ]}
              >
                History (All)
              </Text>
            </TouchableOpacity>
          </View>

          <View
            style={{
              flexDirection: "row",
              marginHorizontal: scale(16),
              marginTop: verticalScale(12),
              marginBottom: verticalScale(4),
              gap: scale(8),
            }}
          >
            {["all", "od", "leave"].map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setTypeFilter(t as any)}
                style={{
                  paddingHorizontal: scale(16),
                  paddingVertical: verticalScale(8),
                  borderRadius: moderateScale(20),
                  backgroundColor:
                    typeFilter === t
                      ? t === "leave"
                        ? colors.leave
                        : t === "od"
                          ? colors.od
                          : "#10B981" // Green for All
                      : "transparent",
                  borderWidth: 1,
                  borderColor: typeFilter === t ? "transparent" : colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: normalizeFont(13),
                    fontWeight: "600",
                    color: typeFilter === t ? "#FFFFFF" : colors.textSec,
                    textTransform: "capitalize",
                  }}
                >
                  {t === "od" ? "OD" : t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      ) : (
        <FlatList
          data={filteredPermissions}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ color: colors.textSec }}>
                No permissions found
              </Text>
            </View>
          }
        />
      )}

      {/* Edit Modal */}
      <Modal
        visible={!!editingPermission}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditingPermission(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.modalContainer, { backgroundColor: colors.bg }]}
        >
          {/* Dynamic Header with Safe Area */}
          <View
            style={[
              styles.modalHeader,
              {
                borderBottomColor: colors.border,
                backgroundColor: colors.card,
                paddingTop: insets.top + verticalScale(20), // Ensure safe area + padding
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Edit Permission
            </Text>
            <TouchableOpacity
              onPress={() => setEditingPermission(null)}
              style={{
                padding: scale(4),
                borderRadius: moderateScale(20),
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(0,0,0,0.05)",
              }}
            >
              <Ionicons name="close" size={normalizeFont(24)} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            {editingPermission && (
              <View style={{ gap: verticalScale(24) }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: scale(16),
                  }}
                >
                  <View
                    style={[
                      styles.avatar,
                      {
                        backgroundColor: isDark ? "#334155" : "#E2E8F0",
                        width: scale(50),
                        height: scale(50),
                        borderRadius: moderateScale(25),
                        alignItems: "center",
                        justifyContent: "center",
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: normalizeFont(18),
                        fontWeight: "700",
                        color: colors.textSec,
                      }}
                    >
                      {editingPermission.student?.full_name
                        ?.substring(0, 2)
                        .toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text
                      style={[
                        styles.staticText,
                        { color: colors.text, fontSize: normalizeFont(18) },
                      ]}
                    >
                      {editingPermission.student?.full_name}
                    </Text>
                    <Text style={{ color: colors.textSec, marginTop: verticalScale(2) }}>
                      {editingPermission.student?.roll_no}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: scale(12) }}>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor:
                          editingPermission.type === "leave"
                            ? "rgba(249, 115, 22, 0.1)"
                            : "rgba(99, 102, 241, 0.1)",
                        paddingHorizontal: scale(12),
                        paddingVertical: verticalScale(6),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        {
                          color:
                            editingPermission.type === "leave"
                              ? colors.leave
                              : colors.od,
                          fontSize: normalizeFont(13),
                        },
                      ]}
                    >
                      {editingPermission.type.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.datePickerRow}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.subLabel,
                        { color: colors.textSec, marginBottom: verticalScale(8) },
                      ]}
                    >
                      From Date
                    </Text>
                    <TouchableOpacity
                      onPress={() => setPickerType("start")}
                      style={[
                        styles.dateInput,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.card,
                        },
                      ]}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={normalizeFont(20)}
                        color={colors.textSec}
                      />
                      <Text style={{ color: colors.text, fontWeight: "500" }}>
                        {editStartDate.toLocaleDateString()}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.subLabel,
                        { color: colors.textSec, marginBottom: verticalScale(8) },
                      ]}
                    >
                      To Date
                    </Text>
                    <TouchableOpacity
                      onPress={() => setPickerType("end")}
                      style={[
                        styles.dateInput,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.card,
                        },
                      ]}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={20}
                        color={colors.textSec}
                      />
                      <Text style={{ color: colors.text, fontWeight: "500" }}>
                        {editEndDate.toLocaleDateString()}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View>
                  <Text
                    style={[
                      styles.subLabel,
                      { color: colors.textSec, marginBottom: verticalScale(8) },
                    ]}
                  >
                    Reason
                  </Text>
                  <TextInput
                    style={[
                      styles.reasonInput,
                      {
                        borderColor: colors.border,
                        color: colors.text,
                        backgroundColor: colors.card,
                      },
                    ]}
                    multiline
                    numberOfLines={3}
                    value={editReason}
                    onChangeText={setEditReason}
                    placeholder="Enter reason..."
                    placeholderTextColor={colors.textSec}
                  />
                </View>

                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    {
                      backgroundColor:
                        editingPermission.type === "leave"
                          ? colors.leave
                          : colors.od,
                      shadowColor:
                        editingPermission.type === "leave"
                          ? colors.leave
                          : colors.od,
                      shadowOpacity: 0.3,
                      shadowRadius: moderateScale(8),
                      elevation: 4,
                    },
                  ]}
                  onPress={handleUpdate}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.saveBtnText}>Update Permission</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Nested Date Picker Logic */}
        {pickerType && (
          <CustomDateTimePicker
            visible={!!pickerType}
            mode="date"
            value={pickerType === "start" ? editStartDate : editEndDate}
            onChange={onDateChange}
            onClose={() => setPickerType(null)}
            isDark={isDark}
            minimumDate={pickerType === "end" ? editStartDate : undefined}
          />
        )}
      </Modal>

      <ConfirmationModal
        visible={!!permissionToDelete}
        title="Revoke Permission"
        message="Are you sure you want to revoke this permission? This action cannot be undone."
        onConfirm={confirmDelete}
        onCancel={() => setPermissionToDelete(null)}
        confirmLabel="Revoke"
        isDestructive
        isDark={isDark}
      />

      <ZenToast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(16),
    paddingBottom: verticalScale(16),
    borderBottomWidth: 1,
  },
  backBtn: { padding: scale(8), marginLeft: scale(-8) },
  headerTitle: { fontSize: normalizeFont(18), fontWeight: "700" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: verticalScale(40),
  },
  list: { padding: scale(16), paddingBottom: verticalScale(40) },
  card: {
    borderRadius: moderateScale(16),
    borderWidth: 1,
    marginBottom: verticalScale(16),
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: scale(12),
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: "row",
    gap: scale(8),
  },
  typeBadge: {
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(8),
  },
  typeText: {
    fontSize: normalizeFont(12),
    fontWeight: "700",
  },
  badge: {
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(8),
  },
  badgeText: { fontSize: normalizeFont(11), fontWeight: "600" },
  cardBody: { padding: scale(16), gap: verticalScale(4) },
  studentName: { fontSize: normalizeFont(16), fontWeight: "600" },
  rollNo: { fontSize: normalizeFont(13), marginBottom: verticalScale(8) },
  dateRow: { flexDirection: "row", alignItems: "center", gap: scale(6) },
  dateText: { fontSize: normalizeFont(14), fontWeight: "500" },
  detailsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(12),
    marginTop: verticalScale(8),
  },
  chip: {
    borderWidth: 1,
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(2),
    borderRadius: moderateScale(4),
  },
  chipText: { fontSize: normalizeFont(11), fontWeight: "500", textTransform: "capitalize" },
  timeText: { fontSize: normalizeFont(13) },
  reason: { fontStyle: "italic", fontSize: normalizeFont(13), marginTop: verticalScale(8), opacity: 0.8 },
  tabs: { flexDirection: "row", borderRadius: moderateScale(12) },
  tab: { flex: 1, paddingVertical: verticalScale(10), alignItems: "center", borderRadius: moderateScale(10) },
  tabText: { fontSize: normalizeFont(14) },
  // Modal Styles
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: scale(16),
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: normalizeFont(18), fontWeight: "700" },
  modalContent: { padding: scale(20) },
  sectionLabel: {
    fontSize: normalizeFont(12),
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: verticalScale(8),
  },
  subLabel: { fontSize: normalizeFont(12), fontWeight: "500" },
  staticText: { fontSize: normalizeFont(16), fontWeight: "500" },
  datePickerRow: { flexDirection: "row", gap: scale(16) },
  reasonInput: {
    borderWidth: 1,
    borderRadius: moderateScale(8),
    padding: scale(12),
    height: verticalScale(100),
    textAlignVertical: "top",
    fontSize: normalizeFont(15),
  },
  saveBtn: {
    marginTop: verticalScale(24),
    paddingVertical: verticalScale(14),
    borderRadius: moderateScale(12),
    alignItems: "center",
  },
  saveBtnText: { color: "white", fontSize: normalizeFont(16), fontWeight: "bold" },
  dateInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(8),
    borderWidth: 1,
    borderRadius: moderateScale(8),
    padding: scale(12),
    height: verticalScale(50),
  },
  avatar: {
    // defined inline for dynamic styling
  },
});
