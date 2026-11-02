/**
 * Password prompt shown when Firebase requires a recent login (for example
 * before changing the account email).
 */

import { useState } from "react";
import {
  Alert,
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import CustomInput from "./CustomInput";
import Colors from "../../constants/colors";

/**
 * Modal asking the user to re-enter their password.
 *
 * @param {Object} props
 * @param {boolean} props.visible - whether the modal is shown
 * @param {() => void} props.onCancel - called when the user cancels
 * @param {(password: string) => Promise<void>} props.onConfirm - called with
 *   the typed password; the Confirm button shows "Verifying..." and is
 *   disabled until it finishes
 */
export default function ReauthModal({ visible, onCancel, onConfirm }) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /**
   * Clears the typed password and tells the parent the user cancelled.
   */
  const handleCancel = () => {
    setPassword("");
    onCancel();
  };

  /**
   * Requires a password, then calls onConfirm with it. The password field is
   * cleared only if onConfirm succeeds; the submitting state is always reset.
   */
  const handleConfirm = async () => {
    if (!password) {
      Alert.alert("Please enter your password");
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(password);
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleCancel}
    >
      <View style={styles.modalPopup}>
        <View style={styles.modalPopupContent}>
          <Text style={styles.Text}>
            For your security, please confirm your password to continue.
          </Text>
          <CustomInput
            label="password"
            style={styles.inputView}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <View style={styles.checkoutFormBtns}>
            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={handleCancel}
              disabled={submitting}
            >
              <Text style={styles.logoutBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleConfirm}
              disabled={submitting}
            >
              <Text style={styles.logoutBtnText}>
                {submitting ? "Verifying..." : "Confirm"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const { width, height } = Dimensions.get("window");
/**
 * Base font size, scaled up for wider screens (phones < 380px, large phones, tablets > 600px).
 */
let textStyle = 12;
if (width >= 380 && width <= 600) textStyle = 16;
else if (width > 600) textStyle = 20;

const styles = StyleSheet.create({
  Text: {
    color: "#ffffff",
    fontSize: textStyle,
    justifyContent: "flex-start",
  },
  checkoutFormBtns: {
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "black",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 6,
    shadowOpacity: 0.25,
  },
  inputView: {
    width: width * 0.8,
    backgroundColor: Colors.surface,
    borderRadius: 15,
    height: height * 0.06,
    paddingLeft: width * 0.05,
    color: "#ffffff",
    fontSize: textStyle,
    marginBottom: height * 0.02,
  },
  logoutBtn: {
    width: width * 0.6,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    height: height * 0.07,
    alignItems: "center",
    justifyContent: "center",
    marginTop: height * 0.02,
    marginBottom: height * 0.02,
    elevation: 6,
    shadowColor: "black",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 6,
    shadowOpacity: 0.25,
  },
  logoutBtnText: {
    color: "#ffffff",
    fontSize: textStyle,
  },
  modalPopup: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: width * 0.05,
  },
  modalPopupContent: {
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 560,
    maxHeight: height * 0.8,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  submitBtn: {
    width: width * 0.6,
    backgroundColor: Colors.accent,
    borderRadius: 20,
    elevation: 6,
    shadowColor: "black",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 6,
    shadowOpacity: 0.25,
    marginTop: height * 0.02,
    height: height * 0.07,
    alignItems: "center",
    justifyContent: "center",
  },
});
