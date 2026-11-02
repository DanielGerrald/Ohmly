/**
 * "Submit Attachments" button shown under the Files and Photos tabs.
 */

import {
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { attachmentsProcess } from "./AttachmentsProcess";
import { useSQLiteContext } from "expo-sqlite";
import Colors from "../../constants/colors";

/**
 * Shows a "Submit Attachments" button when there are attachments added on
 * the device that haven't been submitted yet (syncStatus "No"), and a
 * "Processing..." spinner while they upload.
 *
 * @param {Object} props
 * @param {string} props.token - Firebase ID token
 * @param {Array<Object>} props.attachments - attachments currently listed
 * @param {() => Promise<void>} props.refreshAttachments - reloads the list
 *   after uploading
 */
export default function AttachmentSubmit({
  token,
  attachments,
  refreshAttachments,
}) {
  const db = useSQLiteContext();

  const { processPendingAttachments, isProcessing } = attachmentsProcess(
    db,
    token,
    attachments,
    refreshAttachments,
  );

  const pendingAttachments = attachments.filter(
    (att) => att.syncStatus === "No" || att.syncStatus === "Pending",
  );
  const showSubmitButton = pendingAttachments.some(
    (att) => att.syncStatus === "No",
  );

  return (
    <View>
      {showSubmitButton && !isProcessing && (
        <TouchableOpacity
          style={styles.submitBtnAttachment}
          onPress={processPendingAttachments}
        >
          <Text style={styles.logoutBtnText}>Submit Attachments</Text>
        </TouchableOpacity>
      )}
      {isProcessing && (
        <TouchableOpacity style={styles.submitBtnAttachment} disabled>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.logoutBtnText}>Processing...</Text>
        </TouchableOpacity>
      )}
    </View>
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
  logoutBtnText: {
    color: "#ffffff",
    fontSize: textStyle,
  },
  submitBtnAttachment: {
    width: width * 0.6,
    backgroundColor: Colors.accent,
    borderRadius: 20,
    height: height * 0.07,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
    marginBottom: height * 0.025,
    elevation: 6,
    shadowColor: "black",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 6,
    shadowOpacity: 0.25,
  },
});
