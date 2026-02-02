import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface ZenToastProps {
  message: string;
  visible: boolean;
  onHide: () => void;
  actionLabel?: string;
  onAction?: () => void;
  type?: "success" | "error" | "warning" | "info";
}

export const ZenToast: React.FC<ZenToastProps> = ({
  message,
  visible,
  onHide,
  actionLabel,
  onAction,
  type = "success",
}) => {
  const onHideRef = React.useRef(onHide);
  const onActionRef = React.useRef(onAction);

  useEffect(() => {
    onHideRef.current = onHide;
    onActionRef.current = onAction;
  }, [onHide, onAction]);

  useEffect(() => {
    if (visible) {
      const duration = onActionRef.current ? 5000 : 3000;
      const timer = setTimeout(() => {
        if (onHideRef.current) onHideRef.current();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!visible) return null;

  const getIcon = () => {
    switch (type) {
      case "error":
        return "alert-circle";
      case "warning":
        return "warning";
      case "info":
        return "information-circle";
      default:
        return "checkmark-circle";
    }
  };

  const getColor = () => {
    switch (type) {
      case "error":
        return "#EF4444";
      case "warning":
        return "#F59E0B";
      case "info":
        return "#3B82F6";
      default:
        return "#0F766E";
    }
  };

  return (
    <View style={styles.toastContainer}>
      <View
        style={[
          styles.toastContent,
          { borderLeftColor: getColor(), borderLeftWidth: 4 },
        ]}
      >
        <Ionicons name={getIcon()} size={20} color={getColor()} />
        <Text style={[styles.toastText, { color: getColor() }]}>{message}</Text>
        
        {onAction && (
          <View style={styles.actionContainer}>
            <View style={[styles.divider, { backgroundColor: getColor() + '30' }]} />
            <Text 
              style={[styles.actionText, { color: getColor() }]} 
              onPress={() => {
                onAction();
                // Optionally hide after action
                // onHide(); 
              }}
            >
              {actionLabel || "Retry"}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  toastContainer: {
    position: "absolute",
    // Top position controlled by parent wrapper or default
    // top: 60, 
    left: 20,
    right: 20,
    zIndex: 9999,
    alignItems: "center",
  },
  toastContent: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
    gap: 12,
    width: "100%",
  },
  toastText: {
    fontWeight: "600",
    fontSize: 14,
    flex: 1,
  },
  actionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  divider: {
    width: 1,
    height: 20,
  },
  actionText: {
    fontWeight: "700",
    fontSize: 14,
    textTransform: 'uppercase',
  }
});
