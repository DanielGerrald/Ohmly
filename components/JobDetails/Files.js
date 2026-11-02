/**
 * "Files" tab of the job details modal: attach documents (PDF/JPEG) to a
 * job and view the ones already submitted.
 */

import {
  Alert,
  Dimensions,
  View,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { useEffect, useMemo, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import { Text, Avatar, Chip, Icon } from "react-native-paper";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { useSQLiteContext } from "expo-sqlite";

import { selectCategoryLabelSqlite } from "../../Database/LabelDatabase";
import moment from "moment";
import {
  deleteAttachmentSqlite,
  insertAttachmentSqlite,
  updateAttachmentSqlite,
} from "../../Database/AttachmentDatabase";
import { lastLoggedinUserSqlite } from "../../Database/UserDatabase";
import Loading from "../ui/Loading";
import AttachmentSubmit from "./AttachmentSubmit";
import Colors from "../../constants/colors";

/**
 * For open jobs: a "Select Files" button (pick a label, then a document),
 * the "Submit Attachments" button, the list of files not yet submitted and
 * the list of submitted ones. For completed jobs: a read-only list of all
 * files. Tap a file to open it; long-press an unsubmitted file to delete.
 *
 * The attachment folder id (`workOrderId`) is the part of the job's
 * reference_code after the "-".
 *
 * @param {Object} props
 * @param {Array<Object>} props.selectedJob - job row in a one-item array
 * @param {() => Promise<void>} props.fetchFiles - reloads `files` from SQLite
 * @param {Array<Object>} props.files - this job's document attachments
 */
export default function Files({ selectedJob, fetchFiles, files }) {
  const db = useSQLiteContext();
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [labels, setLabels] = useState([]);
  const workOrderId = selectedJob[0].reference_code.split("-")[1];
  const [token, setToken] = useState([]);

  useEffect(() => {
    fetchLabels();
    fetchFiles();
  }, []);

  /**
   * Loads the document label choices (type_group "Document Label") from SQLite.
   */
  const fetchLabels = async () => {
    try {
      const result = await selectCategoryLabelSqlite(
        db,
        "type_group",
        "Document Label",
      );
      const formattedLabels = result.map((item) => ({
        type_id: item.type_id,
        type_label: item.type_label,
      }));
      setLabels(formattedLabels);
    } catch (error) {
      console.error("Error loading labels:", error);
    }
  };

  /**
   * Lets the user pick a document and saves it as an unsubmitted attachment.
   *
   * How it works: also loads the user's token for the submit button. Opens
   * the system document picker (PDF or JPEG). On iOS the picked file is
   * copied into the app's documents folder so it stays available. A row is
   * created with syncStatus "No" (not submitted yet). If a file with the
   * same URI is already listed, the user is asked whether to replace it;
   * otherwise it's inserted into SQLite and the list reloads. The label
   * popup is always closed at the end.
   *
   * @param {number} labelId - chosen label's type_id
   * @param {string} label - chosen label's text
   */
  const pickFile = async (labelId, label) => {
    try {
      const lastLoggedIn = await lastLoggedinUserSqlite(db);
      setToken(lastLoggedIn.idToken);
      let result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: false,
        multiple: false,
        type: ["application/pdf", "image/jpeg"],
      });

      if (!result.canceled) {
        if (Platform.OS === "ios") {
          const documentDirectoryUri =
            FileSystem.documentDirectory + result.assets[0].name;
          await FileSystem.copyAsync({
            from: result.assets[0].uri,
            to: documentDirectoryUri,
          });
          result.assets[0].uri = documentDirectoryUri;
        }

        result.assets[0].fileName = result.assets[0].name;
        delete result.assets[0].name;

        const selectedFiles = result.assets.map((asset) => ({
          label_id: labelId,
          uri: asset.uri,
          fileName: asset.fileName || "Unnamed file",
          label: label,
          assignment_id: selectedJob[0].id,
          type: "File",
          mimeType: asset.mimeType,
          assignment_ref_id: workOrderId,
          date: moment().unix(),
          syncStatus: "No",
        }));

        const updatedFiles = [...files];
        for (const file of selectedFiles) {
          const existingFileIndex = updatedFiles.findIndex(
            (f) => f.uri === file.uri,
          );

          if (existingFileIndex > -1) {
            Alert.alert(
              "File Already Exists",
              `The file "${file.fileName}" already exists. Do you want to replace it?`,
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Replace",
                  style: "destructive",
                  onPress: async () => {
                    updatedFiles[existingFileIndex] = file;
                    await updateAttachmentSqlite(db, file);
                    await fetchFiles();
                  },
                },
              ],
            );
          } else {
            setLoading(true);
            updatedFiles.push(file);
            await insertAttachmentSqlite(db, file);
            await fetchFiles();
            setLoading(false);
          }
        }
      }
    } catch (error) {
      console.error("Error picking file:", error);
    } finally {
      setModalVisible(false);
    }
  };

  /**
   * Asks for confirmation, then deletes the attachment row from SQLite and
   * reloads the list.
   *
   * @param {number} id - attachment id
   */
  const deleteFile = (id) => {
    Alert.alert("Delete File", "Are you sure you want to delete this file?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteAttachmentSqlite(db, id);
            await fetchFiles();
          } catch (error) {
            console.error("Error deleting document:", error);
            Alert.alert("Error", "There was an issue deleting the Document.");
          }
        },
      },
    ]);
  };

  /**
   * Opens a file using the system share/preview sheet (works on Android
   * where file:// links can't be opened directly).
   *
   * @param {string} uri - local file URI
   */
  const openFile = async (uri) => {
    try {
      // A raw file:// URI can't be passed through Linking.openURL on Android —
      // targeting API 24+ blocks exposing file:// paths via Intent
      // (FileUriExposedException). expo-sharing wraps the file in a
      // FileProvider content:// URI on Android, so use it on both platforms.
      await Sharing.shareAsync(uri);
    } catch (error) {
      console.error("Error opening file:", error);
      Alert.alert("Error", "There was a problem opening the file.");
    }
  };

  /**
   * Opens the "Select a Label Category" popup.
   */
  const showModal = () => {
    setModalVisible(true);
  };

  /**
   * Files added on this device but not submitted yet (syncStatus "No").
   */
  const notSubmittedFiles = useMemo(() => {
    return files.filter((file) => file?.syncStatus === "No");
  }, [files]);

  /**
   * Files that were submitted: uploaded ("Yes") or waiting for internet ("Pending").
   */
  const submittedFiles = useMemo(() => {
    return files.filter(
      (file) =>
        file?.syncStatus === "Yes" || file?.syncStatus === "Pending",
    );
  }, [files]);

  if (selectedJob[0].status_label !== "Completed") {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={"height"}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.jobNavContent}>
            <Modal
              visible={modalVisible}
              onRequestClose={() => setModalVisible(false)}
              animationType={"slide"}
              transparent={true}
            >
              {loading && <Loading />}
              {!loading && (
                <View style={styles.modalPopup}>
                  <View style={styles.modalPopupContent}>
                    <Text style={styles.Text}>Select a Label Category</Text>
                    {labels.map((label, index) => (
                      <TouchableOpacity
                        key={index}
                        onPress={() => {
                          pickFile(label.type_id, label.type_label);
                        }}
                      >
                        <Chip
                          icon={() => (
                            <Icon source="tag" color={Colors.success} size={20} />
                          )}
                          style={styles.chip}
                        >
                          <Text variant="labelLarge" style={styles.chipText}>
                            {" "}
                            {label.type_label}
                          </Text>
                        </Chip>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      onPress={() => setModalVisible(false)}
                      style={styles.logoutBtn}
                    >
                      <Text style={styles.logoutBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </Modal>
            <TouchableOpacity
              onPress={() => showModal()}
              style={styles.submitBtn}
            >
              <View style={styles.rowView}>
                <Avatar.Icon
                  style={styles.avatarIconImage}
                  icon="file-multiple"
                  size={30}
                />
                <Text style={styles.logoutBtnText}>Select Files</Text>
              </View>
            </TouchableOpacity>

            <AttachmentSubmit
              token={token}
              attachments={files}
              refreshAttachments={fetchFiles}
            />

            {notSubmittedFiles && (
              <View style={styles.thumbnailView}>
                {notSubmittedFiles.map((file, index) => (
                  <TouchableOpacity
                    key={index.toString()}
                    onPress={() => openFile(file.uri)}
                    onLongPress={() => deleteFile(file.id)}
                  >
                    <View style={styles.rowView}>
                      <View style={styles.fileIconRow}>
                        <Avatar.Icon
                          style={styles.avatarIconBtn}
                          icon="file-document"
                          size={45}
                        />
                      </View>
                      <View style={styles.fileTextRow}>
                        <Text style={styles.TextDescript}>
                          {file.fileName}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.labelView}>
                      <Chip
                        icon={() => (
                          <Icon source="tag" color={Colors.success} size={20} />
                        )}
                        style={styles.chip}
                      >
                        <Text variant="labelSmall" style={styles.chipText}> {file.label}</Text>
                      </Chip>
                      <Chip
                        icon={() => (
                          <Icon source="clock" color={"green"} size={20} />
                        )}
                        style={styles.chip}
                      >
                        <Text variant="labelSmall" style={styles.chipText}>{moment().format("L")}</Text>
                      </Chip>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {submittedFiles && submittedFiles.length > 0 && (
              <>
                <View style={styles.rowView}>
                  <View style={styles.horizontalRule} />
                </View>
                <View style={styles.rowView}>
                  <Text style={styles.TextTitle}>Submitted Documents</Text>
                </View>

                {submittedFiles.map((file, index) => (
                  <View style={styles.thumbnailView} key={index}>
                    <TouchableOpacity
                      key={index}
                      onPress={() => openFile(file.uri)}
                    >
                      <View style={styles.rowView}>
                        <View style={styles.fileIconRow}>
                          <Avatar.Icon
                            style={styles.avatarIconBtn}
                            icon="file-document"
                            size={45}
                          />
                        </View>
                        <View style={styles.fileTextRow}>
                          <Text style={styles.TextDescript}>
                            {file.fileName}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.labelView}>
                        <Chip
                          icon={() => (
                            <Icon source="tag" color={Colors.success} size={20} />
                          )}
                          style={styles.chip}
                        >
                          <Text variant="labelSmall" style={styles.chipText}> {file.label}</Text>
                        </Chip>
                        <Chip
                          icon={() => (
                            <Icon source="clock" color={"green"} size={20} />
                          )}
                          style={styles.chip}
                        >
                          <Text variant="labelSmall" style={styles.chipText}>
                            {moment().format("L")}
                          </Text>
                        </Chip>
                        {file.syncStatus === "Pending" && (
                          <Chip style={styles.chip} textStyle={styles.chipText} icon="cloud-upload">
                            Pending
                          </Chip>
                        )}
                      </View>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  } else {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={"height"}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.jobNavContent}>
            <View style={styles.thumbnailView}>
              {files.map((file, index) => (
                <TouchableOpacity
                  key={index.toString()}
                  onPress={() => openFile(file.uri)}
                >
                  <View style={styles.rowView}>
                    <View style={styles.fileIconRow}>
                      <Avatar.Icon
                        style={styles.avatarIconBtn}
                        icon="file-document"
                        size={45}
                      />
                    </View>
                    <View style={styles.fileTextRow}>
                      <Text style={styles.TextDescript}>
                        {file.fileName}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.labelView}>
                    <Chip
                      icon={() => (
                        <Icon source="tag" color={Colors.success} size={20} />
                      )}
                      style={styles.chip}
                    >
                      <Text variant="labelSmall" style={styles.chipText}> {file.label}</Text>
                    </Chip>
                    <Chip
                      icon={() => (
                        <Icon source="clock" color={"green"} size={20} />
                      )}
                      style={styles.chip}
                    >
                      <Text variant="labelSmall" style={styles.chipText}>
                        {moment.unix(file.date).format("L")}
                      </Text>
                    </Chip>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }
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
  TextDescript: {
    color: Colors.textSecondary,
    fontSize: textStyle,
  },
  TextTitle: {
    color: "#ffffff",
    fontSize: textStyle + 5,
    justifyContent: "flex-start",
  },
  avatarIconBtn: {
    backgroundColor: Colors.accent,
    elevation: 6,
    shadowColor: "black",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 6,
    shadowOpacity: 0.25,
  },
  avatarIconImage: {
    backgroundColor: Colors.accent,
  },
  chip: {
    backgroundColor: Colors.primary,
    margin: "1%",
    borderRadius: 15,
  },
  chipText: {
    color: "#ffffff",
  },
  container: {
    flexGrow: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    paddingHorizontal: width * 0.05,
  },
  fileIconRow: { padding: 10 },
  fileTextRow: { width: "85%", paddingRight: 10 },
  horizontalRule: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.muted,
    marginBottom: 10,
    marginTop: 15,
  },
  jobNavContent: {
    marginVertical: height * 0.03,
    flexGrow: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
  },
  labelView: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
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
  rowView: {
    flexDirection: "row",
    alignItems: "center",
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
  thumbnailView: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
});
