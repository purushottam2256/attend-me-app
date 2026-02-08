import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../../../contexts";

interface DigitalIdCardProps {
  user: {
    name: string;
    email: string;
    dept: string;
    role: string;
    photoUrl?: string;
  };
  onEdit?: () => void;
}

const { width } = Dimensions.get("window");
const CARD_ASPECT_RATIO = 1.586;
const CARD_WIDTH = width - 40;
const CARD_HEIGHT = CARD_WIDTH / CARD_ASPECT_RATIO;

export const DigitalIdCard: React.FC<DigitalIdCardProps> = ({
  user,
  onEdit,
}) => {
  const { isDark } = useTheme();

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

  // Theme-aware colors
  // Dark: Deep Teal | Light: Dark Professional Mint (Teal 700-600-800)
  const gradientColors = isDark
    ? ["#0D4A4A", "#1A6B6B", "#0F3D3D"]
    : ["#0F766E", "#0D9488", "#115E59"];

  const borderColor = isDark
    ? "rgba(255,255,255,0.3)" 
    : "rgba(0,0,0,0.2)";

  const [imageError, setImageError] = React.useState(false);
  
  // Reset error if url changes
  React.useEffect(() => {
      setImageError(false);
  }, [user.photoUrl]);

  return (
    <View style={styles.container}>
      {/* Glow Effect */}
      <View style={styles.glowContainer}>
        <LinearGradient
          colors={
            isDark
              ? ["rgba(61, 220, 151, 0.4)", "rgba(13, 74, 74, 0.3)"]
              : ["rgba(16, 185, 129, 0.4)", "rgba(5, 150, 105, 0.3)"]
          }
          style={styles.glow}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </View>

      <View style={[styles.cardContainer, { borderColor, borderWidth: 2 }]}>
        {/* Theme Aware Gradient Background */}
        <LinearGradient
          colors={gradientColors as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Noise/Texture Overlay (simulated with white opacity) */}
        <View style={styles.noiseOverlay} />

        {/* Holographic Border Gradient */}
        <LinearGradient
          colors={[
            "rgba(255,255,255,0.4)",
            "rgba(255,255,255,0)",
            "rgba(255,255,255,0.1)",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.borderGradient}
        />

        {/* Content */}
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoRow}>
              {/* Fallback to Icon if image fails, but try to use local asset */}
              <View style={styles.logoContainer}>
                <Image
                  source={require("../../../../assets/college-logo.png")}
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
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Ionicons name="wifi" size={18} color="rgba(255,255,255,0.6)" />
              {onEdit && (
                <TouchableOpacity onPress={onEdit}>
                  <Ionicons name="pencil" size={18} color="#FFF" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.body}>
            {/* Left: Photo */}
            <View style={styles.photoContainer}>
              {/* Always render Placeholder Gradient (Background) */}
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

              {/* Overlay Image if available */}
              {user.photoUrl && !imageError ? (
                <Image
                  source={{ uri: user.photoUrl }}
                  style={[StyleSheet.absoluteFill, styles.photoImage]}
                  resizeMode="cover"
                  onError={(e) => {
                      console.log('Image load error:', e.nativeEvent.error);
                      setImageError(true);
                  }}
                />
              ) : null}
            </View>

            {/* Right: Details */}
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
                  <Text style={styles.value}>{user.dept || "CSE"}</Text>
                </View>
                <View style={styles.column}>
                  <Text style={styles.label}>FACULTY ID</Text>
                  <Text
                    style={[styles.value, { fontSize: 10 }]}
                    numberOfLines={1}
                  >
                    {user.email || "N/A"}
                  </Text>
                </View>
              </View>

              <View style={styles.roleContainer}>
                <Text style={styles.roleText}>{formatRole(user.role)}</Text>
              </View>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            {/* Chip removed */}
            <View />
            <Text style={styles.collegeCode}>CODE: MRCE</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginVertical: 24,
  },
  glowContainer: {
    position: "absolute",
    top: 15,
    width: CARD_WIDTH * 0.85,
    height: CARD_HEIGHT * 0.85,
    borderRadius: 20,
    zIndex: -1,
  },
  glow: {
    flex: 1,
    borderRadius: 20,
    opacity: 0.5,
  },
  cardContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  noiseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  borderGradient: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: "transparent",
    zIndex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
    zIndex: 2,
    justifyContent: "space-between",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoContainer: {
    width: 40,
    height: 40,
    backgroundColor: "#FFF",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  logoImage: {
    width: 36,
    height: 36,
  },
  institutionName: {
    color: "#3DDC97", // Accent
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  institutionSub: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 2,
  },
  body: {
    flexDirection: "row",
    flex: 1,
    gap: 20,
    alignItems: "center",
  },
  photoContainer: {
    width: CARD_WIDTH * 0.25,
    height: CARD_WIDTH * 0.32,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  photoPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  photoInitials: {
    fontSize: 28,
    fontWeight: "700",
    color: "#475569",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  details: {
    flex: 1,
    height: "100%",
    justifyContent: "center",
    gap: 12,
  },
  label: {
    color: "rgba(61, 220, 151, 0.8)", // Mint tint
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 2,
  },
  valueName: {
    color: "#FFF",
    fontSize: 24, // Increased back to large
    fontWeight: "700", // Consistent bold weight
    letterSpacing: 0.5,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    marginBottom: 4,
  },
  value: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    gap: 20,
  },
  column: {
    flex: 1,
  },
  roleContainer: {
    backgroundColor: "rgba(61, 220, 151, 0.15)",
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: "rgba(61, 220, 151, 0.3)",
  },
  roleText: {
    color: "#3DDC97",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  chip: {
    width: 36,
    height: 26,
    borderRadius: 4,
    backgroundColor: "#F59E0B", // Gold/Copper chip color
    opacity: 0.9,
    borderColor: "rgba(0,0,0,0.2)",
    borderWidth: 1,
  },
  collegeCode: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    fontWeight: "700",
    fontFamily: "monospace",
  },
});
