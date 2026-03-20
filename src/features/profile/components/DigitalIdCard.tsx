import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Image,
  Animated,
  Easing,
  Modal,
  TouchableWithoutFeedback,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import QRCode from 'react-native-qrcode-svg';

import { useTheme } from "@contexts";
import {
  scale,
  verticalScale,
  moderateScale,
  normalizeFont,
} from "@utils/responsive";

interface DigitalIdCardProps {
  user: {
    name: string;
    email: string;
    dept: string;
    role: string;
    photoUrl?: string;
    userId?: string; // Supabase user ID for QR code
  };
  onEdit?: () => void;
}

const { width } = Dimensions.get("window");
const CARD_ASPECT_RATIO = 1.3; // Taller card to fit QR safely without overlapping
const CARD_WIDTH = width - scale(40);
const CARD_HEIGHT = CARD_WIDTH / CARD_ASPECT_RATIO;

export const DigitalIdCard: React.FC<DigitalIdCardProps> = ({
  user,
  onEdit,
}) => {
  const { isDark } = useTheme();
  const [imageError, setImageError] = React.useState(false);
  const [isQRModalVisible, setIsQRModalVisible] = React.useState(false);

  // Shimmer animation
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Reset error if url changes
  useEffect(() => {
    setImageError(false);
  }, [user.photoUrl]);

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-CARD_WIDTH, CARD_WIDTH * 2],
  });

  const formatRole = (role: string) => {
    switch (role?.toLowerCase()) {
      case "faculty":
        return "FACULTY";
      case "class_incharge":
        return "CLASS INCHARGE";
      case "lab_incharge":
        return "LAB INCHARGE";
      case "hod":
        return "HEAD OF DEPT";
      case "management":
        return "MANAGEMENT";
      default:
        return role?.toUpperCase() || "FACULTY";
    }
  };

  // Premium green gradient palette
  const gradientColors = ["#0D4F4F", "#0F766E", "#134E4A"] as const;

  const accentColor = "#3DDC97";

  return (
    <View style={styles.container}>
      {/* Outer Glow */}
      <View style={styles.glowContainer}>
        <LinearGradient
          colors={
            isDark
              ? ["rgba(61,220,151,0.35)", "rgba(12,45,72,0.25)"]
              : ["rgba(16,185,129,0.35)", "rgba(5,150,105,0.25)"]
          }
          style={styles.glow}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </View>

      <View
        style={[
          styles.cardContainer,
          {
            borderColor: isDark
              ? "rgba(61,220,151,0.25)"
              : "rgba(61,220,151,0.35)",
          },
        ]}
      >
        {/* Background Gradient */}
        <LinearGradient
          colors={gradientColors as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Decorative circles for depth */}
        <View style={styles.decoCircle1} />
        <View style={styles.decoCircle2} />

        {/* Content */}
        <View style={styles.content}>
          {/* ── HEADER ── */}
          <View style={styles.header}>
            <View style={styles.logoRow}>
              <View style={styles.logoContainer}>
                <Image
                  source={require("@assets/college-logo.png")}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </View>
              <View>
                <Text style={styles.institutionName}>MALLA REDDY</Text>
                <Text style={styles.institutionSub}>
                  COLLEGE OF ENGINEERING
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: scale(10) }}>
              {onEdit && (
                <TouchableOpacity
                  onPress={onEdit}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name="pencil"
                    size={normalizeFont(16)}
                    color="rgba(255,255,255,0.7)"
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── BODY ── */}
          <View style={styles.body}>
            {/* Photo */}
            <View style={styles.photoContainer}>
              <LinearGradient
                colors={["#E2E8F0", "#CBD5E1"]}
                style={[StyleSheet.absoluteFill, styles.photoPlaceholder]}
              >
                {!user.photoUrl && (
                  <Text style={styles.photoInitials}>
                    {user.name
                      ? user.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()
                      : "U"}
                  </Text>
                )}
              </LinearGradient>
              {user.photoUrl && !imageError ? (
                <Image
                  source={{ uri: user.photoUrl }}
                  style={[StyleSheet.absoluteFill, styles.photoImage]}
                  resizeMode="cover"
                  onError={(e) => {
                    console.log("Image load error:", e.nativeEvent.error);
                    setImageError(true);
                  }}
                />
              ) : null}
              {/* Photo border glow */}
              <View style={styles.photoBorderGlow} />
            </View>

            {/* Details */}
            <View style={styles.details}>
              <View>
                <Text style={styles.label}>NAME</Text>
                <Text
                  style={styles.valueName}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {user.name || "Faculty Member"}
                </Text>
              </View>

              <View style={styles.row}>
                <View style={styles.column}>
                  <Text style={styles.label}>DEPARTMENT</Text>
                  <Text
                    style={styles.value}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {user.dept || "CSE"}
                  </Text>
                </View>
                <View style={styles.column}>
                  <Text style={styles.label}>FACULTY ID</Text>
                  <Text
                    style={[styles.value, { fontSize: normalizeFont(10) }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {user.email || "N/A"}
                  </Text>
                </View>
              </View>

              <View style={styles.roleContainer}>
                <View style={styles.roleDot} />
                <Text style={styles.roleText}>{formatRole(user.role)}</Text>
              </View>
            </View>
          </View>

          {/* ── FOOTER ── */}
          <View style={styles.footer}>
            <Text style={styles.collegeCode}>MRCE • 2024-25</Text>
            {/* Real QR Code */}
            <TouchableOpacity 
              activeOpacity={0.8}
              onPress={() => setIsQRModalVisible(true)}
              style={{
                width: scale(46),
                height: scale(46),
                backgroundColor: '#FFF', // White background required for QR scannability
                borderRadius: moderateScale(6),
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: 'rgba(61,220,151,0.25)',
                overflow: 'hidden',
              }}>
              <QRCode 
                value={user.userId || user.email || 'placeholder'} 
                size={scale(40)} 
                color="#000" 
                backgroundColor="#FFF" 
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* QR Code Modal Overlay */}
      <Modal
        visible={isQRModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsQRModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsQRModalVisible(false)}>
          <View style={[styles.modalOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.6)' }]}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalContent, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: isDark ? '#FFF' : '#0F172A' }]}>Scan ID</Text>
                  <TouchableOpacity onPress={() => setIsQRModalVisible(false)} style={styles.closeButton}>
                    <Ionicons name="close" size={normalizeFont(24)} color={isDark ? '#94A3B8' : '#64748B'} />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.largeQRContainer}>
                  <QRCode 
                    value={user.userId || user.email || 'placeholder'} 
                    size={scale(200)} 
                    color="#000" 
                    backgroundColor="#FFF" 
                  />
                </View>
                <Text style={[styles.modalSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  {user.email}
                </Text>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginVertical: verticalScale(20),
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: scale(24),
  },
  modalContent: {
    width: '100%',
    borderRadius: moderateScale(24),
    padding: scale(24),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(10) },
    shadowOpacity: 0.3,
    shadowRadius: moderateScale(20),
    elevation: 10,
  },
  modalHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(24),
  },
  modalTitle: {
    fontSize: normalizeFont(20),
    fontWeight: '700',
  },
  closeButton: {
    padding: scale(4),
  },
  largeQRContainer: {
    backgroundColor: '#FFF',
    padding: scale(16),
    borderRadius: moderateScale(16),
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    marginBottom: verticalScale(16),
  },
  modalSubtitle: {
    fontSize: normalizeFont(14),
    fontWeight: '500',
  },
  glowContainer: {
    position: "absolute",
    top: verticalScale(18),
    width: CARD_WIDTH * 0.88,
    height: CARD_HEIGHT * 0.88,
    borderRadius: moderateScale(24),
    zIndex: -1,
  },
  glow: {
    flex: 1,
    borderRadius: moderateScale(24),
    opacity: 0.6,
  },
  cardContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: moderateScale(18),
    overflow: "hidden",
    position: "relative",
    borderWidth: 1.5,
    elevation: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
  },
  // Decorative depth circles
  decoCircle1: {
    position: "absolute",
    top: -CARD_HEIGHT * 0.3,
    right: -CARD_WIDTH * 0.15,
    width: CARD_WIDTH * 0.55,
    height: CARD_WIDTH * 0.55,
    borderRadius: CARD_WIDTH * 0.275,
    backgroundColor: "rgba(61,220,151,0.06)",
  },
  decoCircle2: {
    position: "absolute",
    bottom: -CARD_HEIGHT * 0.25,
    left: -CARD_WIDTH * 0.1,
    width: CARD_WIDTH * 0.4,
    height: CARD_WIDTH * 0.4,
    borderRadius: CARD_WIDTH * 0.2,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  // Shimmer
  shimmerStrip: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    zIndex: 3,
    pointerEvents: "none",
  },
  shimmerBar: {
    position: "absolute",
    top: 0,
    left: 0,
    width: CARD_WIDTH * 0.5,
    height: "100%",
  },
  content: {
    flex: 1,
    padding: scale(18),
    zIndex: 2,
    justifyContent: "space-between",
  },
  // Header
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(10),
  },
  logoContainer: {
    width: scale(36),
    height: scale(36),
    backgroundColor: "#FFF",
    borderRadius: moderateScale(18),
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  logoImage: {
    width: scale(32),
    height: scale(32),
  },
  institutionName: {
    color: "#3DDC97",
    fontSize: normalizeFont(13),
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  institutionSub: {
    color: "rgba(255,255,255,0.7)",
    fontSize: normalizeFont(7.5),
    fontWeight: "700",
    letterSpacing: 2.5,
    marginTop: verticalScale(1),
  },
  // Body
  body: {
    flexDirection: "row",
    flex: 1,
    gap: scale(16),
    alignItems: "center",
  },
  photoContainer: {
    width: CARD_WIDTH * 0.24,
    height: CARD_WIDTH * 0.3,
    borderRadius: moderateScale(10),
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(61,220,151,0.3)",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  photoPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  photoInitials: {
    fontSize: normalizeFont(26),
    fontWeight: "800",
    color: "#475569",
    letterSpacing: 1,
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  photoBorderGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: moderateScale(10),
    borderWidth: 1,
    borderColor: "rgba(61,220,151,0.15)",
  },
  details: {
    flex: 1,
    height: "100%",
    justifyContent: "center",
    gap: verticalScale(8),
  },
  label: {
    color: "rgba(61,220,151,0.75)",
    fontSize: normalizeFont(7.5),
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: verticalScale(1),
  },
  valueName: {
    color: "#FFF",
    fontSize: normalizeFont(22),
    fontWeight: "800",
    letterSpacing: 0.3,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  value: {
    color: "#FFF",
    fontSize: normalizeFont(13),
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  row: {
    flexDirection: "row",
    gap: scale(16),
  },
  column: {
    flex: 1,
  },
  roleContainer: {
    backgroundColor: "rgba(61,220,151,0.12)",
    alignSelf: "flex-start",
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(100),
    borderWidth: 1,
    borderColor: "rgba(61,220,151,0.25)",
    flexDirection: "row",
    alignItems: "center",
    gap: scale(6),
  },
  roleDot: {
    width: scale(5),
    height: scale(5),
    borderRadius: scale(2.5),
    backgroundColor: "#3DDC97",
  },
  roleText: {
    color: "#3DDC97",
    fontSize: normalizeFont(9),
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  // Footer
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chipContainer: {
    borderRadius: moderateScale(4),
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  chip: {
    width: scale(36),
    height: scale(26),
    borderRadius: moderateScale(4),
    justifyContent: "center",
    alignItems: "center",
    padding: scale(3),
  },
  chipLines: {
    flex: 1,
    justifyContent: "space-between",
    width: "100%",
  },
  chipLine: {
    height: 1.5,
    backgroundColor: "rgba(0,0,0,0.15)",
    borderRadius: 1,
  },
  collegeCode: {
    color: "rgba(255,255,255,0.4)",
    fontSize: normalizeFont(9),
    fontWeight: "700",
    letterSpacing: 2,
  },
});
