import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
  Platform,
  Linking,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scale, verticalScale, moderateScale, normalizeFont } from '../../../utils/responsive';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface BluetoothRequiredModalProps {
  visible: boolean;
  errorTitle: string;
  errorMessage: string;
  onGoBack: () => void;
  onRetry: () => void;
}

export const BluetoothRequiredModal: React.FC<BluetoothRequiredModalProps> = ({
  visible,
  errorTitle,
  errorMessage,
  onGoBack,
  onRetry,
}) => {
  const insets = useSafeAreaInsets();

  const handleOpenSettings = async () => {
    try {
      if (Platform.OS === 'android') {
        await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
      } else {
        await Linking.openSettings();
      }
    } catch (error) {
      console.error('Failed to open settings:', error);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {}}
    >
      <BlurView intensity={90} tint="dark" style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalAvatarPlaceholder}>
            <Ionicons name="bluetooth" size={normalizeFont(32)} color="#F59E0B" />
          </View>

          <Text style={styles.modalName}>{errorTitle || "Bluetooth Required"}</Text>
          <Text style={styles.modalDescription}>
            {errorMessage || "Attendance scanning requires Bluetooth. Please enable it in Settings to continue."}
          </Text>

          <View style={styles.buttonStack}>
            <TouchableOpacity
              style={[styles.actionButton, styles.settingsButton]}
              onPress={handleOpenSettings}
            >
              <Ionicons name="settings-outline" size={normalizeFont(18)} color="#0D4A4A" style={styles.buttonIcon} />
              <Text style={styles.settingsButtonText}>Enable in Settings</Text>
            </TouchableOpacity>

            <View style={styles.rowButtons}>
              <TouchableOpacity
                style={[styles.actionButton, styles.backButton]}
                onPress={onGoBack}
              >
                <Text style={styles.backButtonText}>Go Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.retryButton]}
                onPress={onRetry}
              >
                <Text style={styles.retryButtonText}>I've Enabled It</Text>
              </TouchableOpacity>
            </View>
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
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: verticalScale(20),
  },
  modalName: {
    color: "#FFF",
    fontSize: normalizeFont(20),
    fontWeight: '700',
    marginBottom: verticalScale(8),
    textAlign: "center",
  },
  modalDescription: {
    color: "rgba(255,255,255,0.7)",
    fontSize: normalizeFont(15),
    lineHeight: verticalScale(22),
    textAlign: "center",
    marginBottom: verticalScale(28),
    paddingHorizontal: scale(8),
  },
  buttonStack: {
    width: "100%",
    gap: verticalScale(12),
  },
  rowButtons: {
    flexDirection: "row",
    gap: scale(12),
    width: "100%",
  },
  actionButton: {
    borderRadius: moderateScale(14),
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: verticalScale(14),
  },
  buttonIcon: {
    marginRight: scale(6),
  },
  settingsButton: {
    backgroundColor: "#3DDC97",
    width: "100%",
    flexDirection: "row",
  },
  settingsButtonText: {
    color: "#0D4A4A",
    fontSize: normalizeFont(16),
    fontWeight: '700',
  },
  backButton: {
    flex: 1,
    backgroundColor: "transparent",
    borderColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
  },
  backButtonText: {
    color: "#FFF",
    fontSize: normalizeFont(15),
    fontWeight: '600',
  },
  retryButton: {
    flex: 1.2,
    backgroundColor: "rgba(61, 220, 151, 0.15)",
    borderColor: "rgba(61, 220, 151, 0.3)",
    borderWidth: 1,
  },
  retryButtonText: {
    color: "#3DDC97",
    fontSize: normalizeFont(15),
    fontWeight: '700',
  },
});
