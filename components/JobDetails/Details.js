import { Dimensions, KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from "react-native";
import Colors from "../../constants/colors";

const { width, height } = Dimensions.get("window");
/**
 * Base font size, scaled up for wider screens (phones < 380px, large phones, tablets > 600px).
 */
let textStyle = 12;
if (width >= 380 && width <= 600) textStyle = 16;
else if (width > 600) textStyle = 20;

/**
 * "Details" tab: shows the job's work description and contractor
 * requirements.
 *
 * @param {{details: Array<Object>}} props - the job row in a one-item array
 */
export default function Details({ details }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={"height"}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.jobNavContent}>
          <Text style={styles.TextTitle}>Work Description</Text>
          <View style={styles.containerRowView}>
            <Text style={styles.TextDescript}>
              {details[0].desc_of_work}
            </Text>
          </View>
          <View style={styles.rowView}>
            <View style={styles.horizontalRule} />
          </View>
          <Text style={styles.TextTitle}>Contractor Requirements</Text>
          <View style={styles.containerRowView}>
            <Text style={styles.TextDescript}>
              {details[0].vendor_requirements}
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

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
  rowView: {
    flexDirection: "row",
    alignItems: "center",
  },
});
