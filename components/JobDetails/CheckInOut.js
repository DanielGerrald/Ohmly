/**
 * Check In / Check Out button and its popup, shown in the job details
 * modal for jobs that aren't completed.
 */

import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  Platform,
} from "react-native";
import { useState } from "react";
import { IconButton } from "react-native-paper";

import CustomInput from "../ui/CustomInput";
import {
  insertCheckInOutSqlite,
  postCheckInOutApi,
} from "../../Database/CheckInOutDatabase";
import { patchAssignmentApi } from "../../Database/WorkOrderDatabase";
import { lastLoggedinUserSqlite } from "../../Database/UserDatabase";
import { useSQLiteContext } from "expo-sqlite";
import { getUnixTime } from "date-fns";
import * as Network from "expo-network";
import Colors from "../../constants/colors";

/**
 * Shows "Check In" or "Check Out" depending on the current state, and a
 * popup to add a comment before submitting.
 *
 * Flow:
 * - Check In: opens the comment box; submitting records a check-in.
 * - Check Out: first asks "Are you performing a final checkout?".
 *   - Yes: closes the popup and opens the Final Check-Out form instead.
 *     No check-out visit is recorded in this case; submitting that form
 *     marks the job completed.
 *   - No: shows the comment box; submitting records a normal check-out.
 *
 * @param {Object} props
 * @param {Function} props.setShowDetails - tab visibility setters from
 *   JobModal (setShowDetails, setShowContacts, setShowFiles, setShowPhotos,
 *   setShowFinalCheckOut) so the right tab is shown
 * @param {Function} props.setCheckoutFormVisible - opens the final
 *   check-out form
 * @param {number} props.jobPurchaseOrderID - work order id
 * @param {boolean} props.checkedIn - whether the technician is on site
 * @param {Function} props.setCheckedIn - toggles that state
 * @param {Function} props.setCheckInOutData - appends to the visit list
 */
export default function CheckInOut({
  setShowDetails,
  setShowContacts,
  setShowFiles,
  setShowPhotos,
  setShowFinalCheckOut,
  setCheckoutFormVisible,
  jobPurchaseOrderID,
  checkedIn,
  setCheckedIn,
  setCheckInOutData,
}) {
  const db = useSQLiteContext();

  const [checkOutQuestion, setCheckOutQuestion] = useState(false);
  const [commentVisible, setCommentVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /**
   * Closes the popup and resets which part of it is shown.
   */
  const hideModal = () => {
    setModalVisible(false);
    setCommentVisible(false);
    setCheckOutQuestion(false);
  };

  /**
   * Records a check-in or check-out with the typed comment.
   *
   * How it works: builds a visit record (timestamp = now in unix seconds,
   * departing = 1 for check-out, crew_member_id = current user). If online
   * it uploads the visit first; on success it is saved locally as synced
   * ("Yes") and the job's `checked_in` flag is updated on the server. If
   * offline or the upload fails, it is saved locally as "Pending" for the
   * background sync to send later. The new visit is added to the on-screen
   * list and the comment box is cleared. Ignores double taps while running.
   *
   * @param {boolean} isCheckingOut - true for check-out, false for check-in
   */
  async function onSubmitCheckin(isCheckingOut) {
    if (submitting) return;

    setSubmitting(true);
    try {
      const userData = await lastLoggedinUserSqlite(db);

      const checkinDate = getUnixTime(new Date());
      const checkingOutFlag = isCheckingOut ? 1 : 0;

      const payload = {
        comment,
        visit_date: checkinDate,
        assignment_id: jobPurchaseOrderID,
        departing: checkingOutFlag,
        crew_member_id: userData.localId,
        syncStatus: "",
      };

      const networkState = await Network.getNetworkStateAsync();
      const online = Boolean(
        networkState?.isConnected && networkState?.isInternetReachable,
      );

      if (online) {
        try {
          const success = await postCheckInOutApi(
            payload,
            userData.idToken,
          );
          if (success) {
            payload.syncStatus = "Yes";
            await insertCheckInOutSqlite(db, payload);
            await patchAssignmentApi(userData.idToken, jobPurchaseOrderID, {
              checked_in: !isCheckingOut ? 1 : 0,
            });
          } else {
            payload.syncStatus = "Pending";
            await insertCheckInOutSqlite(db, payload);
          }
        } catch {
          payload.syncStatus = "Pending";
          await insertCheckInOutSqlite(db, payload);
        }
      } else {
        payload.syncStatus = "Pending";
        await insertCheckInOutSqlite(db, payload);
      }

      setCheckInOutData((prevData) => [
        ...prevData,
        {
          id: checkinDate,
          comment: payload.comment,
          visit_date: payload.visit_date,
          departing: payload.departing,
        },
      ]);

      setComment("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {checkedIn && (
        <TouchableOpacity
          onPress={() => {
            setShowDetails(false);
            setShowContacts(false);
            setShowFiles(false);
            setShowPhotos(false);
            setShowFinalCheckOut(true);
            setCheckOutQuestion(true);
            setCommentVisible(false);
            setModalVisible(true);
          }}
          style={styles.checkInOutBtn}
        >
          <Text style={styles.logoutBtnText}>Check Out</Text>
        </TouchableOpacity>
      )}

      {!checkedIn && (
        <TouchableOpacity
          onPress={() => {
            setShowDetails(true);
            setShowContacts(false);
            setShowFiles(false);
            setShowPhotos(false);
            setShowFinalCheckOut(false);
            setCheckOutQuestion(false);
            setCommentVisible(true);
            setModalVisible(true);
          }}
          style={styles.checkInOutBtn}
        >
          <Text style={styles.logoutBtnText}>Check In</Text>
        </TouchableOpacity>
      )}

      <Modal
        key={jobPurchaseOrderID}
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={hideModal}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 5 : 0}
        >
          <TouchableWithoutFeedback
            onPress={Keyboard.dismiss}
            accessible={false}
          >
            <View style={styles.modalPopup}>
              <View style={styles.modalPopupContent}>
                {checkOutQuestion && (
                  <>
                    <Text style={styles.Text}>
                      Are you performing a final checkout?
                    </Text>
                    <View style={styles.checkoutRow}>
                      <View style={styles.checkoutColumn}>
                        <IconButton
                          icon="check"
                          size={30}
                          iconColor={"white"}
                          onPress={() => {
                            setShowFinalCheckOut(true);
                            setCheckoutFormVisible(true);
                            hideModal();
                          }}
                        />
                        <Text style={styles.TextDescript}>Yes</Text>
                      </View>
                      <View style={styles.checkoutColumn}>
                        <IconButton
                          icon="close"
                          size={30}
                          iconColor={"white"}
                          onPress={() => {
                            setShowFinalCheckOut(true);
                            setCheckoutFormVisible(false);
                            setCommentVisible(true);
                            setCheckOutQuestion(false);
                          }}
                        />
                        <Text style={styles.TextDescript}>No</Text>
                      </View>
                    </View>
                  </>
                )}

                {commentVisible && (
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    style={styles.modalScroll}
                    contentContainerStyle={styles.modalScrollContent}
                  >
                    <CustomInput
                      label="comment"
                      style={styles.checkInOutCommentBox}
                      value={comment}
                      placeholder="comments..."
                      multiline={true}
                      onChangeText={setComment}
                      maxLength={300}
                    />
                    <View style={styles.checkoutFormBtns}>
                      <TouchableOpacity
                        onPress={async () => {
                          await onSubmitCheckin(checkedIn);
                          hideModal();
                          setCheckedIn((prevState) => !prevState);
                        }}
                        style={styles.submitBtn}
                        disabled={submitting}
                      >
                        <Text style={styles.logoutBtnText}>
                          {submitting ? "Submitting..." : "Submit Comment"}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={hideModal}
                        style={styles.submitBtn}
                        disabled={submitting}
                      >
                        <Text style={styles.logoutBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                )}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </>
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
  logoutBtnText: {
    color: "#ffffff",
    fontSize: textStyle,
  },
  checkInOutBtn: {
    width: width * 0.6,
    backgroundColor: Colors.accent,
    borderRadius: 20,
    height: height * 0.07,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: height * 0.025,
    elevation: 6,
    shadowColor: "black",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 6,
    shadowOpacity: 0.25,
  },
  checkInOutCommentBox: {
    width: width * 0.8,
    backgroundColor: "#4F6B85",
    borderRadius: 15,
    minHeight: height * 0.2,
    paddingLeft: width * 0.05,
    color: "#ffffff",
    fontSize: textStyle,
    marginBottom: height * 0.02,
    textAlignVertical: "top",
  },
  checkoutColumn: {
    flexDirection: "column",
    alignItems: "center",
    margin: 20,
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
  checkoutRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
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
  modalScroll: {
    width: "100%",
  },
  modalScrollContent: {
    alignItems: "center",
    paddingBottom: 16,
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
