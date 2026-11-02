/**
 * "Contacts" tab of the job details modal.
 */

import {
  Dimensions,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Avatar } from "react-native-paper";
import * as Linking from "expo-linking";

import OpenMap from "./OpenMap";
import Colors from "../../constants/colors";

/**
 * Shows the job site's address and phone, the field coordinator (account
 * manager) and the after-hours number. Buttons open directions in a maps
 * app or start a phone call. The buttons are disabled (faded) once the job
 * is completed.
 *
 * @param {Object} props
 * @param {Array<Object>} props.selectedJob - job row in a one-item array
 * @param {Array<Object>} props.contacts - contact row(s) for the job
 */
export default function Contacts({ selectedJob, contacts }) {
  const isCompleted = selectedJob[0]?.status_label === "Completed";

  /**
   * Calls the field coordinator's phone number (falls back to a placeholder
   * number if none is stored).
   */
  function CoordinatorCall() {
    const number = contacts?.[0]?.account_manager_phone_nbr || "704-555-0100";
    Linking.openURL(`tel:${number}`);
  }

  /**
   * Calls the after-hours number (falls back to a placeholder number if none
   * is stored).
   */
  function AftHrsCall() {
    const number = contacts?.[0]?.account_manager_after_hours_nbr || "704-555-0100";
    Linking.openURL(`tel:${number}`);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={"height"}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.jobNavContent}>
          <Text style={styles.TextTitle}>Location Information</Text>
          <View style={styles.containerRowView}>
            <View style={{ flex: 1 }}>
              <Text style={styles.TextDescript}>
                {selectedJob[0].name || ""}
                {"\n"}
                {selectedJob[0].store_nbr || ""}
                {"\n"}
                {selectedJob[0].addr_1}
                {selectedJob[0].addr_2 && (
                  <>
                    {"\n"}
                    {selectedJob[0].addr_2}
                  </>
                )}
                {selectedJob[0].addr_3 && (
                  <>
                    {"\n"}
                    {selectedJob[0].addr_3}
                  </>
                )}
                {"\n"}
                {selectedJob[0].city}, {selectedJob[0].state}{" "}
                {selectedJob[0].zip}
                {"\n"}
                {selectedJob[0].phone_nbr}
                {selectedJob[0].phone_nbr_ext && (
                  <>{selectedJob[0].phone_nbr_ext}</>
                )}
              </Text>
            </View>
            <View style={styles.contactIcon}>
              {selectedJob?.[0]?.latitude && (
                <TouchableOpacity
                  disabled={isCompleted}
                  onPress={() =>
                    OpenMap(
                      selectedJob[0].latitude,
                      selectedJob[0].longitude,
                      selectedJob[0].location_name,
                    )
                  }
                >
                  <Avatar.Icon
                    style={[
                      styles.avatarIconBtn,
                      isCompleted && { opacity: 0.4 },
                    ]}
                    icon="map-marker"
                    size={40}
                    color={"#ffffff"}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.containerRowView}>
            <View style={styles.horizontalRule} />
          </View>
          <Text style={styles.TextTitle}>Field Coordinator</Text>
          <View style={styles.containerRowView}>
            <View style={{ flex: 1 }}>
              <Text style={styles.TextDescript}>
                {contacts?.[0]?.account_manager_first_name || ""}{" "}
                {contacts?.[0]?.account_manager_last_name || ""}
                {"\n"}
                {contacts?.[0]?.account_manager_email || ""}
                {"\n"}
                Phone:{" "}
                {contacts?.[0]?.account_manager_phone_nbr || ""}
                {"\n"}
                Fax: {contacts?.[0]?.account_manager_fax_nbr || ""}
              </Text>
            </View>
            <View style={styles.contactIcon}>
              <TouchableOpacity disabled={isCompleted} onPress={CoordinatorCall}>
                <Avatar.Icon
                  style={[
                    styles.avatarIconBtn,
                    isCompleted && { opacity: 0.4 },
                  ]}
                  icon="phone"
                  size={40}
                  color={"#ffffff"}
                />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.containerRowView}>
            <View style={styles.horizontalRule} />
          </View>
          <Text style={styles.TextTitle}>After Hours Contact</Text>
          <View style={styles.containerRowView}>
            <View style={{ flex: 1 }}>
              <Text style={styles.TextDescript}>
                Call after 5:30 PM EST
                {"\n"}
                {contacts?.[0]?.account_manager_after_hours_nbr || "See coordinator above"}
              </Text>
            </View>
            <View style={styles.contactIcon}>
              <TouchableOpacity disabled={isCompleted} onPress={AftHrsCall}>
                <Avatar.Icon
                  style={[
                    styles.avatarIconBtn,
                    isCompleted && { opacity: 0.4 },
                  ]}
                  icon="phone"
                  size={40}
                  color={"#ffffff"}
                />
              </TouchableOpacity>
            </View>
          </View>
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
  TextTitle: {
    color: "#ffffff",
    fontSize: textStyle + 5,
    justifyContent: "flex-start",
  },
  TextDescript: {
    color: Colors.textSecondary,
    fontSize: textStyle,
  },
  avatarIconBtn: {
    backgroundColor: Colors.accent,
    elevation: 6,
    shadowColor: "black",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 6,
    shadowOpacity: 0.25,
  },
  contactIcon: {
    width: width / 20,
    marginLeft: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    flexGrow: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    paddingHorizontal: width * 0.05,
  },
  containerRowView: {
    flex: 1,
    flexDirection: "row",
    width: "90%",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "3%",
  },
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
});
