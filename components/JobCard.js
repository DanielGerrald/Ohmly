/**
 * List of tappable job summary cards, plus the job details modal.
 */

import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Card, Avatar } from "react-native-paper";
import moment from "moment";
import { useState } from "react";

import JobModal from "./JobDetails/JobModal";
import { selectWorkOrderSqlite } from "../Database/WorkOrderDatabase";
import { selectContactSqlite } from "../Database/ContactDatabase";
import { useSQLiteContext } from "expo-sqlite";
import Colors from "../constants/colors";

/**
 * Renders one card per job (reference number, category, site, address and
 * scheduled date). Tapping a card opens the JobModal for that job.
 *
 * @param {{jobData: Array<Object>}} props - jobs to show (assignment rows)
 */
export default function JobCard({ jobData }) {
  const db = useSQLiteContext();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedJob, setSelectedJob] = useState([]);
  const [selectedContact, setSelectedContact] = useState([]);

  /**
   * Loads the full job row and its contacts from SQLite, then opens the
   * details modal. The modal is closed first so it re-opens fresh if another
   * job was already showing.
   *
   * @param {number} jobId - work order id
   */
  const showModal = async (jobId) => {
    setModalVisible(false);
    setSelectedJob(await selectWorkOrderSqlite(db, "id", jobId));
    setSelectedContact(
      await selectContactSqlite(db, "assignment_id", jobId),
    );
    setModalVisible(true);
  };

  /**
   * Closes the details modal and clears the selected job/contact.
   */
  const hideModal = () => {
    setModalVisible(false);
    setSelectedJob([]);
    setSelectedContact([]);
  };

  return (
    <>
      {jobData.map((job) => (
        <TouchableOpacity
          style={styles.jobCardTouchable}
          key={job.id}
          onPress={() => showModal(job.id)}
        >
          <Card style={styles.jobCard}>
            <Card.Content style={styles.jobCardContent}>
              <View style={styles.columnView}>
                <View style={styles.rowView}>
                  <View style={styles.columnView}>
                    <Text style={styles.jobCardContentTitle}>
                      {`${job.type}#  `}
                      {job.reference_code}
                    </Text>
                  </View>
                </View>
                <View style={styles.columnView}>
                  <Text style={styles.jobCardContentTitleSub}>
                    {job.category}
                  </Text>
                </View>
              </View>
            </Card.Content>

            <Card.Content style={styles.jobCardContent}>
              <Avatar.Icon
                style={styles.avatarIcon}
                icon="office-building-marker"
                size={40}
              />
              <View style={styles.columnView}>
                <View style={styles.rowView}>
                  <View style={styles.columnView}>
                    <Text style={styles.jobCardContentLabel}>
                      {`${job.name}:`}
                    </Text>
                  </View>
                </View>
                <View style={styles.columnView}>
                  <Text style={styles.jobCardContentText}>
                    {job.store_nbr}
                  </Text>
                </View>
              </View>
            </Card.Content>

            <Card.Content style={styles.jobCardContent}>
              <Avatar.Icon
                style={styles.avatarIcon}
                icon="map-marker"
                size={40}
              />
              <View style={styles.columnView}>
                <View style={styles.rowView}>
                  <View style={styles.columnView}>
                    <Text style={styles.jobCardContentLabel}>Address:</Text>
                  </View>
                </View>
                <View style={styles.columnView}>
                  <Text style={styles.jobCardContentText}>
                    {job.addr_1}
                    {job.addr_2 && (
                      <>
                        {"\n"}
                        {job.addr_2}
                      </>
                    )}
                    {job.addr_3 && (
                      <>
                        {"\n"}
                        {job.addr_3}
                      </>
                    )}
                    {"\n"}
                    {job.city}, {job.state} {job.zip}
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
                    <Text style={styles.jobCardContentLabel}>
                      Scheduled:
                    </Text>
                  </View>
                </View>
                <View style={styles.columnView}>
                  <Text style={styles.jobCardContentText}>
                    {moment(job.scheduled_date).format("MMM Do YYYY")}
                  </Text>
                </View>
              </View>
            </Card.Content>
          </Card>
        </TouchableOpacity>
      ))}
      <JobModal
        visible={modalVisible}
        onDismiss={hideModal}
        selectedJob={selectedJob}
        selectedContact={selectedContact}
      />
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
  avatarIcon: {
    backgroundColor: Colors.primary,
    marginRight: 10,
  },
  columnView: { flex: 1, flexDirection: "column" },
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
  jobCardContentTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: textStyle,
    fontWeight: "bold",
  },
  jobCardContentTitleSub: {
    flex: 1,
    textAlign: "center",
    fontSize: textStyle - 1,
  },
  jobCardContentText: {
    fontSize: textStyle - 1,
  },
  jobCardTouchable: {
    width: "100%",
  },
  rowView: {
    flexDirection: "row",
    alignItems: "center",
  },
});
