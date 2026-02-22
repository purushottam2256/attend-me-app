/**
 * ScanScreen - Premium BLE Attendance Scanning Interface
 *
 * Design Philosophy:
 * - Minimal: Clean lines, generous whitespace
 * - Premium: Deep gradients, subtle shadows
 * - Polished: Micro-animations, smooth transitions
 *
 * States:
 * - HANDSHAKE: Initial verification (2s)
 * - SCANNING: Active radar mode
 * - SUBMITTING: Processing submission
 * - SUCCESS: Completion animation
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  StatusBar,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  Modal,
  Vibration,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useNavigation,
  useRoute,
  useFocusEffect,
} from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  RadarAnimation,
  ControlCluster,
  InstructionsModal,
  HeadcountModal,
  StudentList,
  OverrideModal,
  ScanBlockedModal,
  type BlockReason,
} from "../components";
import { ZenToast } from "@components/ZenToast";
import { PulsingDots } from "@components/ui/LoadingAnimation";
import { scale, verticalScale, moderateScale, normalizeFont } from "@utils/responsive";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Screen states
type ScanState = "HANDSHAKE" | "SCANNING" | "SUBMITTING" | "SUCCESS";

// Timer presets in seconds
const TIMER_PRESETS = [60, 180, 300, 600]; // 1, 3, 5, 10 minutes

import { useAttendance, type AttendanceStudent } from "../hooks";
import { useBLE } from "../hooks/useBLE";
import { isBLEReady } from "@services/bleService";
import {
  Gradients,
  Primary,
  Success,
  Danger,
  Neutral,
} from "@constants/Theme";
import {
  getTodaySchedule,
  type TimetableSlot,
} from "@services/dashboardService";
import { supabase } from "@config/supabase";
import { useTheme } from "@contexts";

// =============================================================================
// PREMIUM SCANNER - Deep Teal Theme (Same as Home Page)
// =============================================================================

const COLORS = {
  // Gradient background (Deep Teal - SAME AS HOME PAGE)
  gradientStart: "#0D4A4A",
  gradientMid: "#1A6B6B",
  gradientEnd: "#0F3D3D",

  // Accent (Mint Green)
  accent: "#3DDC97",
  accentGlow: "rgba(61, 220, 151, 0.25)",
  accentSubtle: "rgba(61, 220, 151, 0.12)",

  // Surfaces (Glassmorphism)
  surface: "rgba(255, 255, 255, 0.08)",
  surfaceElevated: "rgba(255, 255, 255, 0.12)",
  surfacePressed: "rgba(255, 255, 255, 0.05)",

  // Text (High contrast)
  textPrimary: "#FFFFFF",
  textSecondary: "rgba(255, 255, 255, 0.70)",
  textMuted: "rgba(255, 255, 255, 0.45)",

  // Borders
  border: "rgba(255, 255, 255, 0.12)",
  borderSubtle: "rgba(255, 255, 255, 0.06)",

  // Status Colors
  success: "#34C759",
  danger: "#FF6B6B",
  warning: "#FFD93D",
  info: "#5AC8FA",
};

// Theme-aware colors for cards and lists
const getThemeColors = (isDark: boolean) => ({
  ...COLORS,
  // Cards (Pure black with subtle border for depth)
  cardBackground: isDark ? "#1C1C1E" : "rgba(255, 255, 255, 0.95)",
  cardBackgroundElevated: isDark ? "#2C2C2E" : "#FFFFFF",
  cardBorder: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)",

  // List backgrounds
  listBackground: isDark ? "#000000" : "#F2F2F7",
  surfaceSolid: isDark ? "#000000" : "#FFFFFF",

  // Text on cards
  textOnCard: isDark ? "#FFFFFF" : "#1C1C1E",
  textSecondaryOnCard: isDark
    ? "rgba(255, 255, 255, 0.6)"
    : "rgba(0, 0, 0, 0.55)",
});

export const ScanScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();

  // Theme-aware colors
  const COLORS = getThemeColors(isDark);

  // State for dynamically fetched live class (when not passed via route)
  const [liveClassData, setLiveClassData] = useState<TimetableSlot | null>(
    null,
  );
  const [loadingLiveClass, setLoadingLiveClass] = useState(false);
  const [noLiveClassError, setNoLiveClassError] = useState<string | null>(null);

  // Use route classData if provided, otherwise use fetched liveClassData
  const routeClassData = route.params?.classData;
  const existingAttendance = route.params?.existingAttendance;
  const isManualLegacy = route.params?.manual;

  // Failsafe: Redirect to ManualEntry if manual param is present (legacy or stale calls)
  useEffect(() => {
    if (isManualLegacy && routeClassData) {
      navigation.replace("ManualEntry", {
        classData: routeClassData,
        existingAttendance,
      });
    }
  }, [isManualLegacy, routeClassData, navigation, existingAttendance]);

  const classData = routeClassData || liveClassData;

  // Auto-fetch current live class if not provided via route
  useEffect(() => {
    const fetchLiveClass = async () => {
      if (routeClassData) return; // Already have class data from route

      setLoadingLiveClass(true);
      setNoLiveClassError(null);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setNoLiveClassError("Not authenticated");
          return;
        }

        const schedule = await getTodaySchedule(user.id);

        // Find the current live class
        const now = new Date();
        const currentTimeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

        const liveClass = schedule.find((slot) => {
          return (
            currentTimeStr >= slot.start_time && currentTimeStr <= slot.end_time
          );
        });

        if (liveClass) {

          setLiveClassData(liveClass);
        } else {
          setNoLiveClassError("No live class right now");
        }
      } catch (err) {
        console.error("[ScanScreen] Error fetching live class:", err);
        setNoLiveClassError("Failed to load schedule");
      } finally {
        setLoadingLiveClass(false);
      }
    };

    fetchLiveClass();
  }, [routeClassData]);

  const subjectName = classData?.subject?.name || "Loading...";
  const [batchOverride, setBatchOverride] = useState<'full' | null>(null);
  const effectiveBatch = batchOverride === 'full' ? null : (classData?.batch ?? null);
  const batchLabel = effectiveBatch === 1 ? 'B1' : effectiveBatch === 2 ? 'B2' : 'All';

  // Stable identifier for focus effect (excludes batch)
  const baseSection = classData
    ? `${classData.target_dept || "CSE"}-${classData.target_year || "3"}-${classData.target_section || "A"}`
    : "Loading...";
  const baseClassKey = `${subjectName}_${baseSection}`;

  // Display identifier (includes batch) - used for storage keys and UI
  const displaySection = `${baseSection}${effectiveBatch ? ` (${batchLabel})` : ''}`;
  const classKey = `${subjectName}_${displaySection}`;
  
  const endTime = classData?.end_time || "00:00";

  // UI State
  const [scanState, setScanState] = useState<ScanState>("HANDSHAKE");
  const [isScanning, setIsScanning] = useState(false);
  const [isAutoPilot, setIsAutoPilot] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(180);
  const [timerPresetIndex, setTimerPresetIndex] = useState(1);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showHeadcount, setShowHeadcount] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [previousAttendance, setPreviousAttendance] = useState<{
    className: string;
    takenAt: string;
  } | null>(null);

  // Scan blocked state
  const [showBlocked, setShowBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState<BlockReason>("no_class");
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'warning' | 'info' }>({
      visible: false,
      message: '',
      type: 'info'
  });

  // Show blocked modal when no live class
  useEffect(() => {
    if (noLiveClassError && !routeClassData) {

      
      const now = new Date();
      const currentHour = now.getHours();
      
      // If after 4 PM (16:00), show Day Complete instead of Break Time
      if (currentHour >= 16) {
        setBlockReason("after_hours");
      } else {
        setBlockReason("no_class");
      }
      
      setShowBlocked(true);
    }
  }, [noLiveClassError, routeClassData]);

  // Validation state for handshake checks
  const [validationStatus, setValidationStatus] = useState({
    rosterLoaded: false,
    bleAvailable: true,
    scheduleValid: true,
    noPreviousScan: true,
  });

  // BLE Modal State
  const [showBleModal, setShowBleModal] = useState(false);
  const [bleError, setBleError] = useState({ title: "", message: "" });
  const [retryTrigger, setRetryTrigger] = useState(0);

  const handleBleRetry = async () => {
    // 1. Re-check immediately
    const bleCheck = await isBLEReady();

    if (bleCheck.ready) {

      setShowBleModal(false);
      // Force handshake restart
      handshakeProgress.setValue(0);
      handshakeRotation.setValue(0);
      setRetryTrigger((prev) => prev + 1);
    } else {

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setBleError({
        title: "Still Unavailable",
        message:
          bleCheck.reason === "poweredOff" ||
          bleCheck.reason === "bluetooth_off"
            ? "Bluetooth is turned off. Please enable it in Control Center."
            : "Permission is denied. Please enable in Settings.",
      });
    }
  };

  // College hours configuration
  const COLLEGE_START_HOUR = 8;
  const COLLEGE_START_MINUTE = 30;
  const COLLEGE_END_HOUR = 17;
  const COLLEGE_END_MINUTE = 0;

  // Real data from Supabase
  const {
    students,
    loading: studentsLoading,
    error: studentsError,
    presentCount,
    odCount,
    absentCount,
    pendingCount,
    totalCount,
    updateStudentStatus,
    submitAttendance: submitToSupabase,
    refreshStudents,
    isOfflineMode,
  } = useAttendance({ classData, batchOverride });

  // Animations
  const handshakeRotation = useRef(new Animated.Value(0)).current;
  const handshakeProgress = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;

  // Reset state when screen comes into focus and check for previous attendance
  useFocusEffect(
    useCallback(() => {
      // Reset to initial state
      setScanState("HANDSHAKE");
      setIsScanning(false);
      setShowHeadcount(false);
      setShowOverride(false);
      refreshStudents();
      // Reset animations
      handshakeProgress.setValue(0);
      handshakeRotation.setValue(0);
      contentOpacity.setValue(0);
      headerOpacity.setValue(0);

      // Check for previous attendance
      const checkPreviousAttendance = async (key: string, name: string) => {
        try {
          const stored = await AsyncStorage.getItem(
            `@attend_me/attendance_${key}`,
          );
          if (stored) {
            const data = JSON.parse(stored);
            setPreviousAttendance({
              className: name,
              takenAt: data.takenAt,
            });
            // Show confirmation popup
            setShowOverride(true);
          } else {
             setPreviousAttendance(null);
             setShowOverride(false);
          }
        } catch (error) {

        }
      };

      // Validate scan timing
      const validateScanTiming = () => {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTimeMinutes = currentHour * 60 + currentMinute;

        const collegeStartMinutes =
          COLLEGE_START_HOUR * 60 + COLLEGE_START_MINUTE;
        const collegeEndMinutes = COLLEGE_END_HOUR * 60 + COLLEGE_END_MINUTE;

        // Check if before college hours
        if (currentTimeMinutes < collegeStartMinutes) {
          setBlockReason("before_hours");
          setShowBlocked(true);
          return false;
        }

        // Check if after college hours
        if (currentTimeMinutes > collegeEndMinutes) {
          setBlockReason("after_hours");
          setShowBlocked(true);
          return false;
        }

        return true;
      };

      // Only validate if not in manual mode (late attendance) or skipValidation
      const isManualMode = route.params?.manual === true;
      const skipValidation = route.params?.skipValidation === true;
      if (!isManualMode && !skipValidation) {
        validateScanTiming();
      }

      checkPreviousAttendance(classKey, `${subjectName} - ${displaySection}`);
    }, [
      // Only depend on base identifiers to prevent reset on batch toggle
      baseClassKey, 
      subjectName,
      baseSection,
      // Still need these for initial setup
      handshakeProgress,
      handshakeRotation,
      contentOpacity,
      headerOpacity,
      route.params?.manual,
      // Note: classData is needed for validation logic inside, but we don't want to re-run on every small change
      // Ideally, rely on baseClassKey which changes when classData identity changes
    ]),
  );

  // Dedicated effect for Batch Switching
  // Updates attendance check without resetting the whole screen
  useEffect(() => {
     const checkPrevious = async () => {
        try {
          const stored = await AsyncStorage.getItem(`@attend_me/attendance_${classKey}`);
          if (stored) {
             const data = JSON.parse(stored);
             setPreviousAttendance({
               className: `${subjectName} - ${displaySection}`,
               takenAt: data.takenAt,
             });
             setShowOverride(true);
             setIsScanning(false); // Stop scanning if we found previous data
             setScanState("HANDSHAKE");
          } else {
             setPreviousAttendance(null);
             if (scanState === 'HANDSHAKE') {
                setShowOverride(false);
             }
          }
        } catch (e) { }
     };
     
     if (scanState !== 'SUBMITTING' && scanState !== 'SUCCESS') {
        checkPrevious();
     }
  }, [batchOverride, classKey]);

  // Handshake phase animation (waits for override decision and validation)
  useEffect(() => {
    // Don't run handshake if scan is blocked - just show the blocked modal
    if (showBlocked) {
      return;
    }

    if (scanState === "HANDSHAKE" && !showOverride) {
      // Update validation status based on current state
      setValidationStatus((prev) => ({
        ...prev,
        rosterLoaded: !studentsLoading && students.length > 0,
        noPreviousScan: !previousAttendance,
      }));

      // Rotation animation
      Animated.loop(
        Animated.timing(handshakeRotation, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();

      // Progress animation
      Animated.timing(handshakeProgress, {
        toValue: 1,
        duration: 2500, // Slightly longer to allow checks
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();

      // Transition to scanning after validation checks pass
      const timeout = setTimeout(async () => {
        // 1. Check if break time (no live class)
        if (noLiveClassError || !classData) {
          handshakeRotation.stopAnimation();
          setBlockReason("no_class");
          setShowBlocked(true);
          return;
        }

        // 2. Check BLE/Bluetooth status using bleService directly
        const bleCheck = await isBLEReady();


        if (!bleCheck.ready) {
          handshakeRotation.stopAnimation();

          let title = "Bluetooth Required";
          let message = "Please enable Bluetooth to continue.";

          if (
            bleCheck.reason === "bluetooth_off" ||
            bleCheck.reason === "poweredOff"
          ) {
            title = "Bluetooth Off";
            message = "Please turn on Bluetooth to scan for student devices.";
          } else if (
            bleCheck.reason === "unauthorized" ||
            bleCheck.reason === "denied"
          ) {
            title = "Permission Denied";
            message =
              "Please grant Bluetooth permission in your device settings.";
          }

          setBleError({ title, message });
          setShowBleModal(true);
          return;
        }

        // 3. Check if roster is loaded
        if (studentsLoading) {
          // Still loading - wait and retry
          return;
        }

        if (students.length === 0) {
          handshakeRotation.stopAnimation();
          handshakeRotation.stopAnimation();
          setToast({ visible: true, message: 'Could not load student roster. Please try again.', type: 'error' });
          return;
          return;
        }

        // All checks passed - proceed to scanning
        handshakeRotation.stopAnimation();

        const hideInstructions = await AsyncStorage.getItem(
          "@attend_me/hide_scan_instructions",
        );
        if (!hideInstructions) {
          setShowInstructions(true);
        }

        setScanState("SCANNING");
        setIsScanning(true);

        Animated.parallel([
          Animated.timing(contentOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(headerOpacity, {
            toValue: 1,
            duration: 400,
            delay: 200,
            useNativeDriver: true,
          }),
        ]).start();
      }, 2500);

      return () => clearTimeout(timeout);
    }
  }, [
    scanState,
    showOverride,
    handshakeRotation,
    handshakeProgress,
    contentOpacity,
    headerOpacity,
    studentsLoading,
    students.length,
    previousAttendance,
  ]);

  // Timer countdown - auto-submit when timer ends
  useEffect(() => {
    if (!isScanning || isAutoPilot || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Timer ended - auto-submit attendance

          setIsScanning(false);
          // Trigger submit after a small delay to ensure state updates
          setTimeout(() => {
            handleSubmitPress();
          }, 100);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isScanning, isAutoPilot, timeRemaining]);

  // Real BLE scanning integration
  const {
    bleState,
    isScanning: bleIsScanning,
    permissionsGranted,
    detectedCount: bleDetectedCount,
    error: bleHookError,
    startBLEScan,
    stopBLEScan,
    requestPermissions,
    studentsWithUUID,
  } = useBLE({
    students: students.map((s) => ({
      id: s.id,
      name: s.name,
      rollNumber: s.rollNo,
      bluetooth_uuid: s.bleUUID || null,
      isPresent: s.status === "present",
    })),
    onStudentDetected: (studentId) => {

      const student = students.find((s) => s.id === studentId);
      
      // FIX: Do not overwrite OD or Leave status
      if (student?.status === 'od' || student?.status === 'leave') {

        return;
      }


      updateStudentStatus(studentId, "present");

    },
    // Only enable BLE when: scanning, in SCANNING state, classData loaded, roster loaded, no break time error
    enabled:
      isScanning &&
      scanState === "SCANNING" &&
      !!classData &&
      students.length > 0 &&
      !noLiveClassError,
  });

  // BLE scanning is controlled by the `enabled` prop in useBLE hook
  // No manual sync needed - just toggle isScanning state

  // Cleanup BLE when screen loses focus (React Navigation keeps screens mounted)
  useFocusEffect(
    useCallback(() => {
      // On focus - nothing extra needed
      return () => {
        // On blur - stop BLE scanning using both hook and direct bleService call

        stopBLEScan();
        setIsScanning(false);
        // Also directly stop via bleService to ensure it's stopped
        import("@services/bleService").then(({ stopScanning }) => {
          stopScanning();

        });
      };
    }, [stopBLEScan]),
  );

  // Update validation status based on BLE state
  useEffect(() => {
    setValidationStatus((prev) => ({
      ...prev,
      bleAvailable: bleState === "on",
    }));
  }, [bleState]);

  // Auto-resume scanning when Bluetooth turns on (after being off)
  const prevBleStateRef = useRef<string>(bleState);
  useEffect(() => {
    const prevState = prevBleStateRef.current;
    prevBleStateRef.current = bleState;

    // If BLE was off/unauthorized and now is on, and we're in SCANNING state
    if (
      (prevState === "off" || prevState === "unauthorized") &&
      bleState === "on"
    ) {


      // If we're in SCANNING state and have data, auto-start
      if (scanState === "SCANNING" && classData && students.length > 0) {

        setIsScanning(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  }, [bleState, scanState, classData, students.length]);

  // Handlers
  const handleToggleScan = useCallback(() => {
    // If starting scan (or resuming from pause)
    if (!isScanning) {
      // Only check for break time if we're first starting (not in SCANNING state yet)
      // If scanState is already SCANNING, user is resuming from pause - allow it
      if (scanState !== "SCANNING" && (noLiveClassError || !classData)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setShowBlocked(true);
        setBlockReason("no_class");
        return;
      }

      // Check if Bluetooth is definitely off (allow 'on', 'unknown', 'resetting')
      if (
        bleState === "off" ||
        bleState === "unauthorized" ||
        bleState === "unsupported"
      ) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const msg =
          bleState === "unauthorized"
            ? "Please grant Bluetooth permission."
            : bleState === "unsupported"
              ? "Bluetooth is not supported."
              : "Please turn on Bluetooth.";
        setToast({ visible: true, message: msg, type: "error" });
        return;
      }

      // Check if roster is loaded (only for first start, not pause/resume)
      if (scanState !== "SCANNING" && students.length === 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setToast({
          visible: true,
          message: "Please wait for student roster to load",
          type: "info",
        });
        return;
      }
    }

    setIsScanning((prev) => !prev);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [
    isScanning,
    scanState,
    bleState,
    students.length,
    noLiveClassError,
    classData,
  ]);

  const handleRescan = useCallback(() => {
    refreshStudents();
    setTimeRemaining(TIMER_PRESETS[timerPresetIndex]);
    setIsScanning(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [timerPresetIndex, refreshStudents]);

  const handleTimerPress = useCallback(() => {
    const nextIndex = (timerPresetIndex + 1) % TIMER_PRESETS.length;
    setTimerPresetIndex(nextIndex);
    setTimeRemaining(TIMER_PRESETS[nextIndex]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [timerPresetIndex]);

  const handleAutoPilotToggle = useCallback(() => {
    setIsAutoPilot((prev) => !prev);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const handleInstructionsClose = useCallback(() => {
    setShowInstructions(false);
  }, []);

  const handleDontShowAgain = useCallback(async () => {
    await AsyncStorage.setItem("@attend_me/hide_scan_instructions", "true");
    setShowInstructions(false);
  }, []);

  const handleSubmitPress = useCallback(() => {
    setIsScanning(false);
    setShowHeadcount(true);
  }, []);

  const handleConfirmSubmit = useCallback(() => {
    setShowHeadcount(false);
    setScanState("SUBMITTING");

    // Save attendance to Supabase and redirect
    const saveAndRedirect = async () => {
      try {
        // Submit to Supabase
        const { success, error } = await submitToSupabase();

        if (!success) {
          console.error("Supabase submit failed:", error);
          // Still save locally as backup
        }

        // Also save locally for override check
        const now = new Date();
        const takenAt = now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        });
        await AsyncStorage.setItem(
          `@attend_me/attendance_${classKey}`,
          JSON.stringify({
            takenAt,
            presentCount,
            absentCount,
            date: now.toISOString(),
          }),
        );

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Vibration.vibrate(400); // Strict vibration feedback

        // Redirect immediately
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate("Home");
        }
      } catch (err) {
        console.error("Failed to save attendance:", err);
      }
    };

    // Small delay for UI feedback
    setTimeout(saveAndRedirect, 500);
  }, [navigation, classKey, presentCount, absentCount, submitToSupabase]);

  const handleCancel = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate("Home");
    }
  }, [navigation]);

  const handleOverrideConfirm = useCallback(async () => {
    // Clear the stored attendance record
    await AsyncStorage.removeItem(`@attend_me/attendance_${classKey}`);
    setPreviousAttendance(null);
    setShowOverride(false);
    // Reset animation values for fresh start
    handshakeProgress.setValue(0);
    handshakeRotation.setValue(0);
    // The useEffect will now trigger and start handshake animation
  }, [classKey, handshakeProgress, handshakeRotation]);

  const handleOverrideCancel = useCallback(() => {
    setShowOverride(false);
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate("Home");
    }
  }, [navigation]);

  const handleStudentStatusChange = useCallback(
    (
      studentId: string,
      newStatus: "pending" | "present" | "absent" | "od" | "leave",
    ) => {
      updateStudentStatus(studentId, newStatus);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [updateStudentStatus],
  );

  // Render handshake phase
  const renderHandshake = () => {
    const rotation = handshakeRotation.interpolate({
      inputRange: [0, 1],
      outputRange: ["0deg", "360deg"],
    });

    const progressWidth = handshakeProgress.interpolate({
      inputRange: [0, 1],
      outputRange: ["0%", "100%"],
    });

    return (
      <View style={[styles.handshakeContainer, { paddingTop: insets.top }]}>
        {/* Animated circles */}
        <View style={styles.handshakeVisual}>
          <Animated.View
            style={[styles.outerRing, { transform: [{ rotate: rotation }] }]}
          >
            <View style={styles.ringSegment} />
          </Animated.View>
          <View style={styles.innerCircle}>
            <Ionicons name="bluetooth" size={normalizeFont(40)} color={COLORS.accent} />
          </View>
        </View>

        <Text style={styles.handshakeTitle}>Securing Class</Text>
        <Text style={styles.handshakeSubtitle}>
          {subjectName} • {displaySection}
        </Text>

        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <Animated.View
            style={[styles.progressBar, { width: progressWidth }]}
          />
        </View>

        <Text style={styles.handshakeStatus}>
          Downloading roster • Verifying Bluetooth
        </Text>

        <TouchableOpacity
          style={{ marginTop: verticalScale(40), padding: scale(10) }}
          onPress={() =>
            navigation.navigate("ManualEntry", {
              classData,
              existingAttendance,
            })
          }
        >
          <Text style={{ color: COLORS.accent, fontWeight: "600" }}>
            Switch to Manual Entry
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Render success phase
  const renderSuccess = () => (
    <View style={[styles.successContainer, { paddingTop: insets.top }]}>
      <Animated.View
        style={[styles.successCircle, { transform: [{ scale: successScale }] }]}
      >
        <Ionicons name="checkmark" size={normalizeFont(64)} color="#FFFFFF" />
      </Animated.View>
      <Text style={styles.successTitle}>Attendance Submitted!</Text>
      <View style={styles.successStats}>
        <View style={styles.successStatItem}>
          <Text style={styles.successStatValue}>{presentCount}</Text>
          <Text style={styles.successStatLabel}>Present</Text>
        </View>
        <View style={styles.successDivider} />
        <View style={styles.successStatItem}>
          <Text style={[styles.successStatValue, { color: COLORS.danger }]}>
            {absentCount}
          </Text>
          <Text style={styles.successStatLabel}>Absent</Text>
        </View>
      </View>
      <Text style={styles.successSubtext}>Returning to dashboard...</Text>
    </View>
  );

  // Render submitting phase
  const renderSubmitting = () => (
    <View style={[styles.successContainer, { paddingTop: insets.top }]}>
      <View style={styles.submittingSpinner}>
        <PulsingDots size="large" color={COLORS.accent} />
      </View>
      <Text style={styles.handshakeTitle}>Submitting Attendance</Text>
      <Text style={styles.handshakeSubtitle}>Please wait...</Text>
    </View>
  );

  // Render scanning phase
  const renderScanning = () => (
    <Animated.View
      style={[styles.scanningContainer, { opacity: contentOpacity }]}
    >
      {/* Header */}
      <Animated.View
        style={[
          styles.header,
          { paddingTop: insets.top + verticalScale(12), opacity: headerOpacity },
        ]}
      >
        <TouchableOpacity style={styles.backButton} onPress={handleCancel}>
          <Ionicons name="chevron-back" size={normalizeFont(24)} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{subjectName}</Text>
          <Text style={styles.headerSubtitle}>{displaySection}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: scale(8) }}>

          {isOfflineMode && (
            <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: scale(6),
                paddingHorizontal: scale(4),
                opacity: 0.9
            }}>
                <Ionicons name="cloud-offline" size={normalizeFont(16)} color="#FF9F0A" />
                <Text style={{ color: '#FF9F0A', fontSize: normalizeFont(12), fontWeight: '600', letterSpacing: 0.5 }}>OFFLINE</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.menuButton}
            onPress={handleAutoPilotToggle}
          >
            <Ionicons
              name={isAutoPilot ? "flash" : "flash-outline"}
              size={normalizeFont(22)}
              color={isAutoPilot ? COLORS.accent : COLORS.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Radar Zone */}
      <View style={styles.radarZone}>
        <RadarAnimation
          detected={presentCount}
          total={totalCount}
          isScanning={isScanning}
          isAutoPilot={isAutoPilot}
          size={SCREEN_WIDTH * 0.55} // Responsive size
        />

        <ControlCluster
          timeRemaining={timeRemaining}
          isScanning={isScanning}
          isAutoPilot={isAutoPilot}
          endTime={endTime}
          currentBatch={effectiveBatch === 1 ? 'b1' : effectiveBatch === 2 ? 'b2' : 'full'}
          onToggleScan={handleToggleScan}
          onRescan={handleRescan}
          onTimerPress={handleTimerPress}
          onBatchPress={() => {
            // Toggle between scheduled batch and full class
            setBatchOverride(prev => prev === 'full' ? null : 'full');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }}
        />
      </View>

      {/* Student List Zone */}
      <View
        style={[
          styles.listZone,
          { backgroundColor: isDark ? "#0A0A0A" : "#F8FAFC" },
        ]}
      >
        <StudentList
          students={students}
          onStatusChange={handleStudentStatusChange}
        />
      </View>

      {/* Bottom Action Bar */}
      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: insets.bottom + verticalScale(16),
            backgroundColor: isDark
              ? "rgba(10, 10, 10, 0.98)"
              : "rgba(248, 250, 252, 0.98)",
            borderTopColor: isDark
              ? "rgba(255,255,255,0.08)"
              : "rgba(0,0,0,0.05)",
          },
        ]}
      >
        <View style={styles.bottomStats}>
          <View style={styles.bottomStatItem}>
            <Text style={[styles.bottomStatValue, { color: COLORS.success }]}>
              {presentCount}
            </Text>
            <Text
              style={[
                styles.bottomStatLabel,
                { color: isDark ? "rgba(255,255,255,0.6)" : "#6B7280" },
              ]}
            >
              Present
            </Text>
          </View>
          <View style={styles.bottomStatItem}>
            <Text style={[styles.bottomStatValue, { color: COLORS.danger }]}>
              {absentCount}
            </Text>
            <Text
              style={[
                styles.bottomStatLabel,
                { color: isDark ? "rgba(255,255,255,0.6)" : "#6B7280" },
              ]}
            >
              Absent
            </Text>
          </View>
          <View style={styles.bottomStatItem}>
            <Text style={[styles.bottomStatValue, { color: "#3B82F6" }]}>
              {odCount}
            </Text>
            <Text
              style={[
                styles.bottomStatLabel,
                { color: isDark ? "rgba(255,255,255,0.6)" : "#6B7280" },
              ]}
            >
              OD
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.submitButton, isOfflineMode && { backgroundColor: '#FF9F0A' }]}
          onPress={handleSubmitPress}
        >
          <Text style={styles.submitButtonText}>{isOfflineMode ? 'Save & Sync Later' : 'Submit'}</Text>
          <Ionicons name={isOfflineMode ? "cloud-upload" : "arrow-forward"} size={normalizeFont(18)} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={[COLORS.gradientStart, COLORS.gradientMid, COLORS.gradientEnd]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Decorative orbs - same as home page */}
      <View style={[styles.orb, styles.orb1]} />
      <View style={[styles.orb, styles.orb2]} />
      <View style={[styles.orb, styles.orb3]} />

      {scanState === "HANDSHAKE" && renderHandshake()}
      {scanState === "SCANNING" && renderScanning()}
      {scanState === "SUBMITTING" && renderSubmitting()}
      {scanState === "SUCCESS" && renderSuccess()}

      {/* Modals */}
      <InstructionsModal
        visible={showInstructions}
        onClose={handleInstructionsClose}
        onDontShowAgain={handleDontShowAgain}
      />

      <HeadcountModal
        visible={showHeadcount}
        detectedCount={presentCount}
        absentCount={absentCount}
        onSubmit={handleConfirmSubmit}
        onCancel={() => setShowHeadcount(false)}
        onRescan={() => {
          setShowHeadcount(false);
          handleRescan();
        }}
      />

      <OverrideModal
        visible={showOverride}
        className={previousAttendance?.className || ""}
        takenAt={previousAttendance?.takenAt || ""}
        onOverride={handleOverrideConfirm}
        onCancel={handleOverrideCancel}
      />

      <ScanBlockedModal
        visible={showBlocked}
        reason={blockReason}
        currentTime={new Date().toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })}
        onClose={() => {
          setShowBlocked(false);
          navigation.goBack();
        }}
        onTakePreviousAttendance={() => {
          setShowBlocked(false);
          // Navigate to home and let user select a class for late attendance
          navigation.reset({
            index: 0,
            routes: [{ name: "Main", params: { screen: "Home" } }],
          });
        }}
      />

      {/* BLE Error Modal */}
      <Modal
        visible={showBleModal}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <BlurView intensity={90} tint="dark" style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View
              style={[
                styles.modalAvatarPlaceholder,
                {
                  backgroundColor: "rgba(245, 158, 11, 0.15)",
                  marginBottom: verticalScale(24),
                },
              ]}
            >
              <Ionicons name="bluetooth" size={normalizeFont(32)} color="#F59E0B" />
            </View>

            <Text style={styles.modalName}>
              {bleError.title || "Bluetooth Issue"}
            </Text>
            <Text
              style={[
                styles.modalRoll,
                { textAlign: "center", marginBottom: verticalScale(24) },
              ]}
            >
              {bleError.message || "Please enable Bluetooth."}
            </Text>

            <View style={{ flexDirection: "row", gap: scale(12), width: "100%" }}>
              <TouchableOpacity
                style={[
                  styles.bulkButton,
                  {
                    backgroundColor: "transparent",
                    borderColor: "rgba(255,255,255,0.2)",
                    borderWidth: 1,
                  },
                ]}
                onPress={() => navigation.navigate("Home" as never)}
              >
                <Text style={[styles.bulkText, { color: "#FFF" }]}>
                  Go Back
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.bulkButton,
                  {
                    backgroundColor: "#3DDC97",
                    borderColor: "#3DDC97",
                    flex: 1.5,
                  },
                ]}
                onPress={handleBleRetry}
              >
                <Text style={[styles.bulkText, { color: "#0D4A4A" }]}>
                  Retry
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </BlurView>
      </Modal>

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
  container: {
    flex: 1,
  },

  // Decorative orbs (same as home page)
  orb: {
    position: "absolute",
    borderRadius: moderateScale(200),
  },
  orb1: {
    width: SCREEN_WIDTH * 0.8,
    height: SCREEN_WIDTH * 0.8,
    backgroundColor: "rgba(61, 220, 151, 0.15)",
    top: -SCREEN_WIDTH * 0.25,
    right: -SCREEN_WIDTH * 0.25,
  },
  orb2: {
    width: SCREEN_WIDTH * 0.65,
    height: SCREEN_WIDTH * 0.65,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    bottom: SCREEN_WIDTH * 0.5,
    left: -SCREEN_WIDTH * 0.2,
  },
  orb3: {
    width: SCREEN_WIDTH * 0.5,
    height: SCREEN_WIDTH * 0.5,
    backgroundColor: "rgba(61, 220, 151, 0.08)",
    bottom: SCREEN_WIDTH * 1.0,
    right: -SCREEN_WIDTH * 0.1,
  },

  // Handshake styles
  handshakeContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: scale(32),
  },
  handshakeVisual: {
    width: scale(140),
    height: scale(140),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: verticalScale(32),
  },
  outerRing: {
    position: "absolute",
    width: scale(140),
    height: scale(140),
    borderRadius: moderateScale(70),
    borderWidth: 3,
    borderColor: "transparent",
    borderTopColor: COLORS.accent,
    borderRightColor: "rgba(61, 220, 151, 0.3)",
  },
  ringSegment: {
    position: "absolute",
    width: scale(10),
    height: scale(10),
    borderRadius: moderateScale(5),
    backgroundColor: COLORS.accent,
    top: verticalScale(-3),
    left: "50%",
    marginLeft: scale(-5),
  },
  innerCircle: {
    width: scale(100),
    height: scale(100),
    borderRadius: moderateScale(50),
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  handshakeTitle: {
    fontSize: normalizeFont(28),
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: verticalScale(8),
    letterSpacing: -0.5,
  },
  handshakeSubtitle: {
    fontSize: normalizeFont(16),
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginBottom: verticalScale(32),
  },
  progressContainer: {
    width: SCREEN_WIDTH - scale(80),
    height: verticalScale(4),
    backgroundColor: COLORS.surface,
    borderRadius: moderateScale(2),
    overflow: "hidden",
    marginBottom: verticalScale(16),
  },
  progressBar: {
    height: "100%",
    backgroundColor: COLORS.accent,
    borderRadius: moderateScale(2),
  },
  handshakeStatus: {
    fontSize: normalizeFont(13),
    fontWeight: "500",
    color: COLORS.textMuted,
  },

  // Success styles
  successContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: scale(32),
  },
  successCircle: {
    width: scale(120),
    height: scale(120),
    borderRadius: moderateScale(60),
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: verticalScale(32),
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: verticalScale(12) },
    shadowOpacity: 0.4,
    shadowRadius: moderateScale(24),
    elevation: 12,
  },
  successTitle: {
    fontSize: normalizeFont(28),
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: verticalScale(24),
    letterSpacing: -0.5,
  },
  successStats: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: verticalScale(24),
  },
  successStatItem: {
    alignItems: "center",
    paddingHorizontal: scale(24),
  },
  successStatValue: {
    fontSize: normalizeFont(36),
    fontWeight: "800",
    color: COLORS.accent,
  },
  successStatLabel: {
    fontSize: normalizeFont(14),
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginTop: verticalScale(4),
  },
  successDivider: {
    width: 1,
    height: verticalScale(50),
    backgroundColor: COLORS.border,
  },
  successSubtext: {
    fontSize: normalizeFont(14),
    fontWeight: "500",
    color: COLORS.textMuted,
  },
  submittingSpinner: {
    width: scale(80),
    height: scale(80),
    backgroundColor: COLORS.surface,
    borderRadius: moderateScale(40),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: verticalScale(24),
  },

  // Scanning styles
  scanningContainer: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(16),
    paddingBottom: verticalScale(16),
  },
  backButton: {
    width: scale(40),
    height: scale(40),
    borderRadius: moderateScale(12),
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: normalizeFont(22),
    fontWeight: "700",
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: normalizeFont(15),
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginTop: verticalScale(4),
  },
  menuButton: {
    width: scale(40),
    height: scale(40),
    borderRadius: moderateScale(12),
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  radarZone: {
    alignItems: "center",
    paddingVertical: verticalScale(16),
    paddingBottom: verticalScale(24),
  },
  listZone: {
    flex: 2,
    marginTop: verticalScale(8),
    borderTopLeftRadius: moderateScale(28),
    borderTopRightRadius: moderateScale(28),
    overflow: "hidden",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(16),
    backgroundColor: "rgba(248, 250, 252, 0.98)",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  bottomStats: {
    flexDirection: "row",
    gap: scale(16),
  },
  bottomStatItem: {
    alignItems: "center",
    minWidth: scale(50),
  },
  bottomStatValue: {
    fontSize: normalizeFont(20),
    fontWeight: "800",
  },
  bottomStatLabel: {
    fontSize: normalizeFont(10),
    fontWeight: "600",
    color: "#6B7280",
    marginTop: verticalScale(2),
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(8),
    backgroundColor: COLORS.gradientStart,
    paddingHorizontal: scale(28),
    paddingVertical: verticalScale(16),
    borderRadius: moderateScale(16),
    shadowColor: COLORS.gradientStart,
    shadowOffset: { width: 0, height: verticalScale(4) },
    shadowOpacity: 0.3,
    shadowRadius: moderateScale(8),
    elevation: 4,
  },
  submitButtonText: {
    fontSize: normalizeFont(16),
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: scale(20),
  },
  modalCard: {
    width: "85%",
    backgroundColor: "rgba(30,30,30,0.9)",
    borderRadius: moderateScale(24),
    padding: scale(24),
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  modalAvatarPlaceholder: {
    width: scale(64),
    height: scale(64),
    borderRadius: moderateScale(32),
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: verticalScale(16),
  },
  modalName: {
    color: "#FFF",
    fontSize: normalizeFont(20),
    fontWeight: "bold",
    marginBottom: verticalScale(4),
    textAlign: "center",
  },
  modalRoll: { color: "rgba(255,255,255,0.6)", fontSize: normalizeFont(16), marginBottom: verticalScale(16) },
  modalInfo: { color: "rgba(255,255,255,0.5)", fontSize: normalizeFont(14), marginBottom: verticalScale(4) },
  bulkButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(12),
    borderWidth: 1,
  },
  bulkText: { fontWeight: "600", fontSize: normalizeFont(14) },
});

export default ScanScreen;
