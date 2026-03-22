import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface LocationPermissionModalProps {
  visible: boolean;
  onGrant: () => void;
  onDeny: () => void;
}

export const LocationPermissionModal: React.FC<LocationPermissionModalProps> = ({
  visible,
  onGrant,
  onDeny,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDeny}
    >
      <BlurView intensity={90} tint="dark" style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalAvatarPlaceholder}>
            <Ionicons name="location" size={normalizeFont(32)} color="#3DDC97" />
          </View>

          <Text style={styles.modalName}>Location Required</Text>
          <Text style={styles.modalDescription}>
            To securely broadcast your attendance using your Digital ID Card, we require location permissions. We don't track your location—this is just an Android system requirement for using Bluetooth scanning.
          </Text>

          <View style={styles.buttonStack}>
            <TouchableOpacity
              style={[styles.actionButton, styles.grantButton]}
              onPress={onGrant}
            >
              <Ionicons name="shield-checkmark" size={normalizeFont(18)} color="#0D4A4A" style={styles.buttonIcon} />
              <Text style={styles.grantButtonText}>Grant Permission</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.denyButton]}
              onPress={onDeny}
            >
              <Text style={styles.denyButtonText}>Not Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
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
    backgroundColor: "rgba(61, 220, 151, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: verticalScale(20),
  },
  modalName: {
    color: "#FFF",
    fontSize: normalizeFont(20),
    fontWeight: '700',
    marginBottom: verticalScale(12),
    textAlign: "center",
  },
  modalDescription: {
    color: "rgba(255,255,255,0.7)",
    fontSize: normalizeFont(14),
    lineHeight: verticalScale(20),
    textAlign: "center",
    marginBottom: verticalScale(28),
    paddingHorizontal: scale(8),
  },
  buttonStack: {
    width: "100%",
    gap: verticalScale(12),
  },
  actionButton: {
    borderRadius: moderateScale(14),
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: verticalScale(14),
    flexDirection: "row",
    width: "100%",
  },
  buttonIcon: {
    marginRight: scale(6),
  },
  grantButton: {
    backgroundColor: "#3DDC97",
  },
  grantButtonText: {
    color: "#0D4A4A",
    fontSize: normalizeFont(16),
    fontWeight: '700',
  },
  denyButton: {
    backgroundColor: "transparent",
    borderColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
  },
  denyButtonText: {
    color: "#FFF",
    fontSize: normalizeFont(15),
    fontWeight: '600',
  },
});
