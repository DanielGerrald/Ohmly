/**
 * Full-screen job details view, opened by tapping a job card.
 */

import {
  Dimensions,
  View,
  StyleSheet,
  Text,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { Avatar, Card } from "react-native-paper";
import moment from "moment";
import { AntDesign } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import * as ScreenOrientation from "expo-screen-orientation";
import { SafeAreaView } from "react-native-safe-area-context";

import { useJob } from "../../components/Context";
import JobNav from "./JobNav";
import Details from "./Details";
import Contacts from "./Contacts";
import Files from "./Files";
import Photos from "./Photos";
import FinalCheckOut from "./FinalCheckOut";
import CheckInOut from "./CheckInOut";
import { selectCheckInOutSqlite } from "../../Database/CheckInOutDatabase";
import { selectFinalCheckOutSqlite } from "../../Database/FinalCheckOutDatabase";
import { useSQLiteContext } from "expo-sqlite";
import { selectAttachmentSqlite } from "../../Database/AttachmentDatabase";
import Colors from "../../constants/colors";

/**
 * Shows a job's header (type, reference, site, scheduled date, category),
 * the check-in/out panel (hidden once the job is completed) and a tabbed
 * section: Details, Contacts, Files, Photos and Final Check-Out.
 *
 * How it works: whenever the selected job changes or a sync finishes, it
 * loads the job's visits (newest first) and saved completion form from
 * SQLite. The job counts as "checked in" if the newest visit is a check-in
 * (departing = 0). Only one tab is visible at a time; the show* flags are
 * switched by JobNav (and by CheckInOut, which jumps to the Final Check-Out
 * tab when the technician checks out with the work completed).
 *
 * @param {Object} props
 * @param {boolean} props.visible - whether the modal is open
 * @param {() => void} props.onDismiss - closes the modal
 * @param {Array<Object>} props.selectedJob - the job row in a one-item
 *   array (empty array = nothing selected, renders nothing)
 * @param {Array<Object>} props.selectedContact - the job's contact row(s)
 */
export default function JobModal({
  visible,
  onDismiss,
  selectedJob,
  selectedContact,
}) {
  const db = useSQLiteContext();
  const { syncVersion } = useJob();
  const [showDetails, setShowDetails] = useState(true);
  const [showContacts, setShowContacts] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [showFinalCheckOut, setShowFinalCheckOut] = useState(false);
  const [checkoutFormVisible, setCheckoutFormVisible] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkInOutData, setCheckInOutData] = useState([]);
  const [photoAttachments, setPhotoAttachments] = useState([]);
  const [fileAttachments, setFileAttachments] = useState([]);
  const [finalCheckoutData, setFinalCheckoutData] = useState(null);

  useEffect(() => {
    let isMounted = true;
    ScreenOrientation.unlockAsync();

    /**
     * Loads the job's visits and completion form from SQLite and works out
     * whether the technician is currently checked in. Skips state updates if
     * the modal was closed while loading.
     */
    async function fetchCheckinData() {
      try {
        if (!selectedJob?.[0]?.id) return;

        const checkInInfo = await selectCheckInOutSqlite(
          db,
          "assignment_id",
          selectedJob[0].id,
          "visit_date",
          "DESC",
        );

        const checkoutRows = await selectFinalCheckOutSqlite(
          db,
          "assignment_id",
          selectedJob[0].id,
        );

        if (!isMounted) return;

        setCheckInOutData(checkInInfo);
        setFinalCheckoutData(checkoutRows?.[0] ?? null);

        if (checkInInfo.length > 0) {
          const lastObj = checkInInfo[0];
          setCheckedIn(!lastObj.departing);
        } else {
          setCheckedIn(false);
        }
      } catch (error) {
        console.error("Error fetching check-in/out data:", error);
      }
    }

    fetchCheckinData();

    return () => {
      isMounted = false;
    };
  }, [selectedJob, syncVersion]);

  /**
   * Loads this job's photo attachments from SQLite (used by the Photos tab).
   */
  const fetchPhotos = async () => {
    try {
      const photos = await selectAttachmentSqlite(
        db,
        "assignment_id",
        selectedJob[0].id,
        "type",
        "Photo",
      );
      setPhotoAttachments(photos);
    } catch (error) {
      console.log("Error fetching photos:", error);
    }
  };

  /**
   * Loads this job's document attachments from SQLite (used by the Files tab).
   */
  const fetchFiles = async () => {
    try {
      const files = await selectAttachmentSqlite(
        db,
        "assignment_id",
        selectedJob[0].id,
        "type",
        "File",
      );
      setFileAttachments(files);
    } catch (error) {
      console.log("Error loading attachments:", error);
    }
  };

  if (selectedJob.length === 0) {
    return null;
  }

  return (
    <Modal
      presentationStyle="overFullScreen"
      key={selectedJob[0].id}
      visible={visible}
      animationType={"slide"}
      transparent={false}
      onRequestClose={onDismiss}
    >
      <SafeAreaView style={styles.SafeArea}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
            contentInsetAdjustmentBehavior="automatic"
          >
            <View style={styles.header}>
              <Text
                style={styles.TextTitle}
              >{`${selectedJob[0].type || ""}`}</Text>
              <Text
                style={styles.TextTitle}
              >{`${selectedJob[0].reference_code || ""}`}</Text>
            </View>
            <TouchableOpacity style={styles.closeButton}>
              <AntDesign
                name="close-circle"
                size={30}
                color="grey"
                onPress={onDismiss}
              />
            </TouchableOpacity>
            <Card style={styles.jobCard}>
              <Card.Content style={styles.jobCardContent}>
                <Avatar.Icon
                  style={styles.avatarIcon}
                  icon="office-building-marker"
                  size={40}
                />
                <View style={styles.columnView}>
                  <View style={styles.rowView}>
                    <View style={styles.columnView}>
                      <Text
                        variant="bodyMedium"
                        style={styles.jobCardContentLabel}
                      >
                        {selectedJob[0].name || ""}:
                      </Text>
                    </View>
                  </View>
                  <View style={styles.columnView}>
                    <Text
                      variant="bodyMedium"
                      style={styles.jobCardContentText}
                    >
                      {selectedJob[0].store_nbr || ""}
                    </Text>
                  </View>
                </View>
              </Card.Content>
              <Card.Content style={styles.jobCardContent}>
                <Avatar.Icon
                  style={styles.avatarIcon}
                  icon="calendar-clock"
                  size={40}
                />
                <View style={styles.columnView}>
                  <View style={styles.rowView}>
                    <View style={styles.columnView}>
                      <Text
                        variant="bodyMedium"
                        style={styles.jobCardContentLabel}
                      >
                        Scheduled:
                      </Text>
                    </View>
                  </View>
                  <View style={styles.columnView}>
                    <Text
                      variant="bodyMedium"
                      style={styles.jobCardContentText}
                    >
                      {moment(selectedJob[0].scheduled_date || "").format(
                        "MMM Do YYYY",
                      )}
                    </Text>
                  </View>
                </View>
              </Card.Content>
              <Card.Content style={styles.jobCardContent}>
                <Avatar.Icon
                  style={styles.avatarIcon}
                  icon="tag-text"
                  size={40}
                />
                <View style={styles.columnView}>
                  <View style={styles.rowView}>
                    <View style={styles.columnView}>
                      <Text
                        variant="bodyMedium"
                        style={styles.jobCardContentLabel}
                      >
                        {selectedJob[0].type || ""}:
                      </Text>
                    </View>
                  </View>
                  <View style={styles.columnView}>
                    <Text
                      variant="bodyMedium"
                      style={styles.jobCardContentText}
                    >
                      {selectedJob[0].category || ""}
                    </Text>
                  </View>
                </View>
              </Card.Content>
            </Card>
            {selectedJob[0].status_label !== "Completed" && (
              <CheckInOut
                setShowDetails={setShowDetails}
                setShowContacts={setShowContacts}
                setShowFiles={setShowFiles}
                setShowPhotos={setShowPhotos}
                setShowFinalCheckOut={setShowFinalCheckOut}
                setCheckoutFormVisible={setCheckoutFormVisible}
                jobPurchaseOrderID={selectedJob[0].id}
                checkedIn={checkedIn}
                setCheckedIn={setCheckedIn}
                setCheckInOutData={setCheckInOutData}
              />
            )}

            <Card style={styles.jobCard}>
              <JobNav
                showDetails={showDetails}
                setShowDetails={setShowDetails}
                showContacts={showContacts}
                setShowContacts={setShowContacts}
                showFiles={showFiles}
                setShowFiles={setShowFiles}
                showPhotos={showPhotos}
                setShowPhotos={setShowPhotos}
                showFinalCheckOut={showFinalCheckOut}
                setShowFinalCheckOut={setShowFinalCheckOut}
              />
              {showDetails && <Details details={selectedJob} />}
              {showContacts && (
                <Contacts selectedJob={selectedJob} contacts={selectedContact} />
              )}
              {showFiles && (
                <Files
                  selectedJob={selectedJob}
                  fetchFiles={fetchFiles}
                  files={fileAttachments}
                />
              )}
              {showPhotos && (
                <Photos
                  selectedJob={selectedJob}
                  fetchPhotos={fetchPhotos}
                  images={photoAttachments}
                />
              )}
              {showFinalCheckOut && (
                <FinalCheckOut
                  selectedJob={selectedJob}
                  checkoutFormVisible={checkoutFormVisible}
                  setCheckoutFormVisible={setCheckoutFormVisible}
                  checkInOutData={checkInOutData}
                  finalCheckoutData={finalCheckoutData}
                  onDismiss={onDismiss}
                />
              )}
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
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
  SafeArea: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingTop: 15,
    paddingBottom: 15,
  },
  TextTitle: {
    color: "#ffffff",
    fontSize: textStyle + 5,
    justifyContent: "flex-start",
  },
  avatarIcon: {
    backgroundColor: Colors.primary,
    marginRight: 10,
  },
  closeButton: {
    position: "absolute",
    right: 10,
    top: 10,
    elevation: 6,
    shadowColor: "black",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 6,
    shadowOpacity: 0.25,
  },
  columnView: { flex: 1, flexDirection: "column" },
  container: {
    flexGrow: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    paddingHorizontal: width * 0.05,
  },
  header: {
    alignItems: "center",
    marginBottom: height * 0.03,
  },
  jobCard: {
    backgroundColor: Colors.surface,
    marginBottom: height * 0.02,
    width: "100%",
    elevation: 6,
    shadowColor: "black",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 6,
    shadowOpacity: 0.25,
  },
  jobCardContent: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginBottom: height * 0.01,
  },
  jobCardContentLabel: {
    fontSize: textStyle,
    fontWeight: "bold",
  },
  jobCardContentText: {
    fontSize: textStyle - 1,
  },
  rowView: {
    flexDirection: "row",
    alignItems: "center",
  },
});
