/**
 * "Final Check-Out" tab of the job details modal.
 *
 * Shows the job's work log (check-in/out history), the completion
 * checklist form used to close out a job, and, for completed jobs, a
 * summary of what was submitted with an option to reopen the job.
 */

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Avatar } from "react-native-paper";
import { format, fromUnixTime, getUnixTime } from "date-fns";

import CustomInput from "../ui/CustomInput";
import SignatureScreen from "../../screens/SignatureScreen";
import {
  deleteFinalCheckOutSqlite,
  insertFinalCheckOutSqlite,
  postFinalCheckListApi,
  postFinalCheckoutApi,
  updateFinalCheckOutSqlite,
} from "../../Database/FinalCheckOutDatabase";
import {
  patchAssignmentApi,
  selectWorkOrderSqlite,
  updateWorkOrderSqlite,
} from "../../Database/WorkOrderDatabase";
import { lastLoggedinUserSqlite } from "../../Database/UserDatabase";
import { useSQLiteContext } from "expo-sqlite";
import * as Network from "expo-network";
import { useJob } from "../Context";
import Colors from "../../constants/colors";

/**
 * One line of the completed-job summary: an icon, a label and value, plus
 * an optional muted second line (e.g. the description for a "Yes" answer).
 *
 * @param {Object} props
 * @param {string} props.icon - Material icon name
 * @param {string} props.label
 * @param {string} props.value
 * @param {string} [props.secondaryLabel]
 * @param {string} [props.secondaryValue] - second line is hidden if empty
 */
function SummaryRow({ icon, label, value, secondaryLabel, secondaryValue }) {
  return (
    <View style={styles.workLogEntry}>
      <View style={styles.rowView}>
        <Avatar.Icon
          style={styles.avatarIconCheckout}
          icon={icon}
          size={30}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.TextDescript}>
            {label}:{"\n"}
            {` ${value}`}
          </Text>
          {secondaryValue ? (
            <Text style={styles.textMuted}>
              {secondaryLabel}:{"\n"}
              {` ${secondaryValue}`}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/**
 * Renders, depending on state:
 * - A "Work Log" switch that shows every check-in/out with time and comment.
 * - For completed jobs: the submitted checklist summary (date, answers,
 *   notes, manager name, signature) and a "Reopen Job" button.
 * - When the form is open: switches for Service Performed*, Material
 *   Installed*, Final Walkthrough* and Return Needed, with description
 *   boxes, misc notes, Manager Name*, a Manager Signoff (signature) button
 *   and a "Final Check Out" submit button. (* = required)
 *
 * @param {Object} props
 * @param {boolean} props.checkoutFormVisible - whether the form is shown
 * @param {Function} props.setCheckoutFormVisible - shows/hides the form
 * @param {Array<Object>} props.checkInOutData - the job's visits
 * @param {Object|null} props.finalCheckoutData - previously saved checklist
 * @param {Array<Object>} props.selectedJob - job row in a one-item array
 * @param {() => void} props.onDismiss - closes the whole job modal
 */
export default function FinalCheckOut({
  checkoutFormVisible,
  setCheckoutFormVisible,
  checkInOutData,
  finalCheckoutData,
  selectedJob,
  onDismiss,
}) {
  const db = useSQLiteContext();
  const { setJobResult } = useJob();
  const [workLog, setWorkLog] = useState(false);
  const [servicePerf, setServicePerf] = useState(false);
  const [materialInst, setMaterialInst] = useState(false);
  const [walkthrough, setWalkthrough] = useState(false);
  const [returnNeeded, setReturnNeeded] = useState(false);
  const [showSignatureScreen, setShowSignatureScreen] = useState(false);
  const [signature, setSignature] = useState("");
  const [forceValidate, setForceValidate] = useState(false);
  const [formData, setFormData] = useState({
    service_perf: "",
    desc_service_perf: "",
    material_inst: "",
    desc_material_inst: "",
    assignment_100: "",
    walkThrough_comp: "",
    return_needed: "",
    desc_return_needed: "",
    desc_misc_notes: "",
    manager_name: "",
    signature_base64: "",
    signature_size: "",
    signature_md5: "",
    signature_modification_time: "",
    assignment_id: "",
  });

  /**
   * Updates one text field of the form.
   *
   * @param {string} name - field key (e.g. "desc_service_perf")
   * @param {string} value - new text
   */
  const handleInputChange = (name, value) => {
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  // Pre-fill the form with the previously submitted checkout when editing
  // (e.g. after reopening a completed job) — a brand-new checkout has no
  // finalCheckoutData yet, so this leaves the blank defaults untouched. Only
  // fills once per time the form becomes visible, so a background sync
  // re-fetching the same data mid-edit doesn't clobber unsaved changes.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!checkoutFormVisible) {
      prefilledRef.current = false;
      return;
    }
    if (prefilledRef.current || !finalCheckoutData) return;
    prefilledRef.current = true;

    setServicePerf(finalCheckoutData.service_perf === "1");
    setMaterialInst(finalCheckoutData.material_inst === "1");
    setWalkthrough(finalCheckoutData.walkThrough_comp === "1");
    setReturnNeeded(finalCheckoutData.return_needed === "1");
    setSignature(finalCheckoutData.signature_base64 || "");
    setFormData((prev) => ({
      ...prev,
      desc_service_perf: finalCheckoutData.desc_service_perf || "",
      desc_material_inst: finalCheckoutData.desc_material_inst || "",
      desc_return_needed: finalCheckoutData.desc_return_needed || "",
      desc_misc_notes: finalCheckoutData.desc_misc_notes || "",
      manager_name: finalCheckoutData.manager_name || "",
    }));
  }, [checkoutFormVisible, finalCheckoutData]);

  /**
   * Validates and submits the completion checklist.
   *
   * How it works:
   * 1. Turns on validation highlighting for all fields.
   * 2. Requires descriptions of service performed and materials installed,
   *    the manager's name, the three required switches and a signature;
   *    shows an alert and stops if anything is missing.
   * 3. Converts the switches to "1"/"0" strings and stamps the time.
   * 4. Saves locally first, so nothing is lost offline: deletes any older
   *    checklist for this job, inserts the new one as "Pending", marks the
   *    job "Completed" in SQLite and refreshes the job list (the job moves to
   *    the Completed tab).
   * 5. If online: uploads the checklist; if that works, also posts the
   *    completion record and sets `completed: 1` on the job in Firebase, and
   *    marks the checklist synced ("Yes"). Otherwise it stays "Pending" and
   *    the background sync uploads it later.
   * 6. Closes the form and the job modal.
   */
  async function onSubmit() {
    setForceValidate(true);
    if (!servicePerf) setServicePerf(true);
    if (!materialInst) setMaterialInst(true);

    /**
     * Converts a switch value to the "1"/"0" strings stored in the database.
     */
    const boolToString = (val) => (val ? "1" : "0");

    const payload = {
      ...formData,
      service_perf: servicePerf,
      material_inst: materialInst,
      assignment_100: "1",
      walkThrough_comp: walkthrough,
      return_needed: returnNeeded,
      signature_base64: signature,
      assignment_id: selectedJob[0]?.id,
    };

    const requiredFields = [
      "desc_service_perf",
      "desc_material_inst",
      "manager_name",
    ];

    const missingFields = requiredFields.filter(
      (field) => !payload[field] || !payload[field].trim(),
    );

    if (missingFields.length > 0) {
      Alert.alert("Please fill in all required fields.");
      return;
    }
    if (
      servicePerf === false ||
      materialInst === false ||
      walkthrough === false
    ) {
      Alert.alert("Please fill in all required fields");
      return;
    }

    if (!signature) {
      Alert.alert("Missing Signature", "Manager signature is required.");
      return;
    }

    setForceValidate(false);

    try {
      const userData = await lastLoggedinUserSqlite(db);
      const apiPayload = {
        ...payload,
        service_perf: boolToString(servicePerf),
        material_inst: boolToString(materialInst),
        assignment_100: "1",
        walkThrough_comp: boolToString(walkthrough),
        return_needed: boolToString(returnNeeded),
        modified_date: getUnixTime(new Date()),
        syncStatus: "Pending",
      };

      // Delete any prior submission first so editing and resubmitting after
      // a reopen replaces it instead of leaving a stale duplicate row.
      await deleteFinalCheckOutSqlite(db, apiPayload.assignment_id);
      await insertFinalCheckOutSqlite(db, apiPayload);
      await updateWorkOrderSqlite(
        db,
        "status_label",
        "Completed",
        "id",
        apiPayload.assignment_id,
      );

      const sqliteJobs = await selectWorkOrderSqlite(
        db,
        "localId",
        userData.localId,
      );
      setJobResult(sqliteJobs);

      const networkState = await Network.getNetworkStateAsync();
      const online = Boolean(
        networkState?.isConnected && networkState?.isInternetReachable,
      );
      let submittedStatus = "Pending";

      if (online) {
        try {
          const listRes = await postFinalCheckListApi(
            userData.idToken,
            apiPayload,
          );
          if (listRes) {
            submittedStatus = "Yes";
            try {
              await postFinalCheckoutApi(
                userData.idToken,
                apiPayload.desc_misc_notes,
                apiPayload.assignment_id,
              );
              await patchAssignmentApi(
                userData.idToken,
                apiPayload.assignment_id,
                { completed: 1 },
              );
            } catch {
              console.log(
                "postFinalCheckoutApi failed after posting the final check list succeeded",
              );
            }
          }
        } catch {
          console.log("postFinalCheckListApi failed");
          submittedStatus = "Pending";
        }
      }

      await updateFinalCheckOutSqlite(
        db,
        "syncStatus",
        submittedStatus,
        "assignment_id",
        apiPayload.assignment_id,
      );

      setCheckoutFormVisible(false);
      onDismiss();
    } catch (err) {
      Alert.alert("Submission Error", err.message);
    }
  }

  /**
   * Reopens a completed job so its final check-out can be edited.
   *
   * After confirmation (requires internet), sets `completed: 0` on the job in
   * Firebase, changes its local status back to "Scheduled", refreshes the job
   * list (it moves back to Active Jobs) and opens the form, which is
   * pre-filled with the previous answers.
   */
  function handleReopen() {
    Alert.alert(
      "Reopen Job",
      "This will move the job back to Active Jobs so you can edit the final checkout. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reopen",
          style: "destructive",
          onPress: async () => {
            try {
              const networkState = await Network.getNetworkStateAsync();
              const online = Boolean(
                networkState?.isConnected &&
                  networkState?.isInternetReachable,
              );
              if (!online) {
                Alert.alert(
                  "No internet connection",
                  "Please try again when you have internet access.",
                );
                return;
              }

              const userData = await lastLoggedinUserSqlite(db);
              await patchAssignmentApi(userData.idToken, selectedJob[0].id, {
                completed: 0,
              });
              await updateWorkOrderSqlite(
                db,
                "status_label",
                "Scheduled",
                "id",
                selectedJob[0].id,
              );

              const sqliteJobs = await selectWorkOrderSqlite(
                db,
                "localId",
                userData.localId,
              );
              setJobResult(sqliteJobs);

              setCheckoutFormVisible(true);
            } catch (err) {
              Alert.alert("Reopen Error", err.message);
            }
          },
        },
      ],
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={"height"}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.jobNavContent}>
          <View style={styles.rowView}>
            <Text style={styles.switchLabel}>Work Log</Text>
            <Switch
              style={styles.switch}
              value={workLog}
              onValueChange={(value) => setWorkLog(value)}
              trackColor={{ false: "#999", true: Colors.accent }}
              thumbColor={workLog ? Colors.accent : "#f4f3f4"}
            />
          </View>
          {workLog && (
            <>
              {[...checkInOutData]
                .reverse()
                .map((checkin) => {
                  const isCheckIn = checkin.departing === 0;
                  return (
                    <View style={styles.workLogEntry} key={checkin.id}>
                      <View style={styles.rowView}>
                        <Avatar.Icon
                          style={styles.avatarIconCheckout}
                          icon={isCheckIn ? "login" : "logout"}
                          size={30}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.Text}>
                            {isCheckIn ? "Checked In" : "Checked Out"} —{" "}
                            {format(
                              fromUnixTime(checkin.visit_date),
                              "MMM d, yyyy h:mm a",
                            )}
                          </Text>
                          <Text style={styles.TextDescript}>
                            {checkin.comment || "No comment left"}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
            </>
          )}

          {!checkoutFormVisible &&
            finalCheckoutData &&
            selectedJob[0]?.status_label === "Completed" && (
            <>
              <View style={styles.horizontalRule} />
              <Text style={styles.TextTitle}>Final Checkout Summary</Text>
              <View style={styles.horizontalRule} />

              {finalCheckoutData.modified_date ? (
                <SummaryRow
                  icon="calendar-check"
                  label="Completed"
                  value={format(
                    fromUnixTime(finalCheckoutData.modified_date),
                    "MMM d, yyyy h:mm a",
                  )}
                />
              ) : null}

              <SummaryRow
                icon="wrench"
                label="Service Performed"
                value={finalCheckoutData.service_perf === "1" ? "Yes" : "No"}
                secondaryLabel="Service Description"
                secondaryValue={
                  finalCheckoutData.service_perf === "1"
                    ? finalCheckoutData.desc_service_perf
                    : null
                }
              />

              <SummaryRow
                icon="package-variant-closed"
                label="Material Installed"
                value={finalCheckoutData.material_inst === "1" ? "Yes" : "No"}
                secondaryLabel="Material Description"
                secondaryValue={
                  finalCheckoutData.material_inst === "1"
                    ? finalCheckoutData.desc_material_inst
                    : null
                }
              />

              <SummaryRow
                icon="walk"
                label="Walkthrough Complete"
                value={
                  finalCheckoutData.walkThrough_comp === "1" ? "Yes" : "No"
                }
              />

              <SummaryRow
                icon="keyboard-return"
                label="Return Needed"
                value={finalCheckoutData.return_needed === "1" ? "Yes" : "No"}
                secondaryLabel="Return Reason"
                secondaryValue={
                  finalCheckoutData.return_needed === "1"
                    ? finalCheckoutData.desc_return_needed
                    : null
                }
              />

              {finalCheckoutData.desc_misc_notes ? (
                <SummaryRow
                  icon="note-text"
                  label="Misc Notes"
                  value={finalCheckoutData.desc_misc_notes}
                />
              ) : null}

              <View style={styles.horizontalRule} />

              <SummaryRow
                icon="account-tie"
                label="Manager Sign-off"
                value={finalCheckoutData.manager_name}
              />

              {finalCheckoutData.signature_base64 ? (
                <View style={{ marginTop: 10, alignItems: "center" }}>
                  <Text style={styles.textMuted}>Signature</Text>
                  <View style={{ backgroundColor: "#ffffff", borderRadius: 8, marginTop: 8, padding: 4 }}>
                    <Image
                      source={{ uri: finalCheckoutData.signature_base64 }}
                      style={{ width: 300, height: 100 }}
                      resizeMode="contain"
                    />
                  </View>
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.logoutBtn}
                onPress={handleReopen}
              >
                <Text style={styles.logoutBtnText}>Reopen Job</Text>
              </TouchableOpacity>
            </>
          )}

          {checkoutFormVisible && (
            <>
              <View style={styles.rowView}>
                <Text style={styles.switchLabel}>Service Performed *</Text>
                <Switch
                  style={styles.switch}
                  value={servicePerf}
                  onValueChange={(value) => setServicePerf(value)}
                  trackColor={{ false: "#999", true: Colors.accent }}
                  thumbColor={servicePerf ? Colors.accent : "#f4f3f4"}
                />
              </View>
              {servicePerf && (
                <CustomInput
                  label="desc_service_perf"
                  required={true}
                  forceValidate={forceValidate}
                  style={styles.inputAreaView}
                  value={formData.desc_service_perf}
                  placeholder="Describe service performed..."
                  multiline={true}
                  onChangeText={(text) => {
                    handleInputChange("desc_service_perf", text);
                  }}
                  maxLength={40}
                />
              )}

              <View style={styles.rowView}>
                <Text style={styles.switchLabel}>Material Installed *</Text>
                <Switch
                  style={styles.switch}
                  value={materialInst}
                  onValueChange={(value) => setMaterialInst(value)}
                  trackColor={{ false: "#999", true: Colors.accent }}
                  thumbColor={materialInst ? Colors.accent : "#f4f3f4"}
                />
              </View>
              {materialInst && (
                <CustomInput
                  label="desc_material_inst"
                  required={true}
                  forceValidate={forceValidate}
                  style={styles.inputAreaView}
                  value={formData.desc_material_inst}
                  placeholder="Describe materials installed..."
                  multiline={true}
                  onChangeText={(text) => {
                    handleInputChange("desc_material_inst", text);
                  }}
                  maxLength={40}
                />
              )}
              <View style={styles.rowView}>
                <Text style={styles.switchLabel}>
                  Walkthrough Complete *
                </Text>
                <Switch
                  style={styles.switch}
                  value={walkthrough}
                  onValueChange={(value) => setWalkthrough(value)}
                  trackColor={{ false: "#999", true: Colors.accent }}
                  thumbColor={walkthrough ? Colors.accent : "#f4f3f4"}
                />
              </View>
              {forceValidate && !walkthrough && (
                <CustomInput
                  label="walkthrough"
                  required={true}
                  value={formData.walkThrough_comp}
                  forceValidate={forceValidate}
                />
              )}
              <View style={styles.rowView}>
                <Text style={styles.switchLabel}>Return Needed</Text>
                <Switch
                  style={styles.switch}
                  trackColor={{ false: "#999", true: Colors.accent }}
                  thumbColor={returnNeeded ? Colors.accent : "#f4f3f4"}
                  onValueChange={(value) => setReturnNeeded(value)}
                  value={returnNeeded}
                />
              </View>
              {returnNeeded && (
                <CustomInput
                  label="desc_return_needed"
                  required={returnNeeded}
                  style={styles.inputAreaView}
                  value={formData.desc_return_needed}
                  placeholder={"Explain why a return is needed..."}
                  multiline={true}
                  onChangeText={(text) => {
                    handleInputChange("desc_return_needed", text);
                  }}
                  maxLength={40}
                />
              )}
              <CustomInput
                label="desc_misc_notes"
                style={styles.inputAreaView}
                value={formData.desc_misc_notes}
                placeholder={"Misc Job Comments..."}
                multiline={true}
                onChangeText={(text) => {
                  handleInputChange("desc_misc_notes", text);
                }}
                maxLength={40}
              />
              <View style={styles.profileLable}>
                <Text style={styles.Text}>Manager Name *</Text>
              </View>
              <CustomInput
                label="manager_name"
                required={true}
                forceValidate={forceValidate}
                style={styles.inputView}
                value={formData.manager_name}
                placeholder={"Manager's Name Here"}
                onChangeText={(text) => handleInputChange("manager_name", text)}
                maxLength={40}
              />

              <View style={styles.checkoutFormBtns}>
                <TouchableOpacity
                  style={styles.logoutBtn}
                  onPress={() => setShowSignatureScreen(true)}
                >
                  <Text style={styles.logoutBtnText}>Manager Signoff</Text>
                </TouchableOpacity>
                <Modal
                  visible={showSignatureScreen}
                  onRequestClose={() => setShowSignatureScreen(false)}
                  animationType={"slide"}
                  transparent={true}
                >
                  <View style={styles.signatureModal}>
                    <SignatureScreen
                      setShowSignatureScreen={setShowSignatureScreen}
                      setSignature={setSignature}
                    />
                  </View>
                </Modal>
                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={onSubmit}
                >
                  <Text style={styles.logoutBtnText}>Final Check Out</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.textWhite}>* Required Fields</Text>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  TextDescript: {
    color: Colors.textSecondary,
    fontSize: textStyle,
  },
  TextTitle: {
    color: "#ffffff",
    fontSize: textStyle + 5,
    justifyContent: "flex-start",
  },
  textWhite: {
    color: "#ffffff",
  },
  textMuted: { color: Colors.muted },
  avatarIconCheckout: {
    backgroundColor: Colors.primary,
    marginRight: width * 0.03,
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
  container: {
    flexGrow: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    paddingHorizontal: width * 0.05,
  },
  horizontalRule: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.muted,
    marginBottom: 10,
    marginTop: 15,
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
  inputAreaView: {
    width: width * 0.8,
    backgroundColor: Colors.surface,
    borderRadius: 15,
    minHeight: height * 0.2,
    paddingLeft: width * 0.05,
    color: "#ffffff",
    fontSize: textStyle,
    marginBottom: height * 0.02,
    textAlignVertical: "top",
  },
  jobNavContent: {
    marginVertical: height * 0.03,
    flexGrow: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
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
  profileLable: { alignSelf: "flex-start", paddingLeft: 20 },
  rowView: {
    flexDirection: "row",
    alignItems: "center",
  },
  signatureModal: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
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
  switch: {
    elevation: 6,
    shadowColor: "black",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 6,
    shadowOpacity: 0.25,
  },
  switchLabel: {
    width: width * 0.6,
    color: "#ffffff",
    fontSize: textStyle,
    marginTop: height * 0.015,
  },
  workLogEntry: {
    width: width * 0.8,
    backgroundColor: "#283246",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
});
