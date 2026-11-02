import { Dimensions, StyleSheet, View, Text, ActivityIndicator } from "react-native";
import Colors from "../../constants/colors";

const { width } = Dimensions.get("window");
/**
 * Base font size, scaled up for wider screens (phones < 380px, large phones, tablets > 600px).
 */
let textStyle = 12;
if (width >= 380 && width <= 600) textStyle = 16;
else if (width > 600) textStyle = 20;

/**
 * Full-screen spinner with a "Loading..." label.
 */
export default function Loading() {
  return (
    <View style={styles.container}>
      <View
        style={{ alignContent: "center", justifyContent: "center", flex: 1 }}
      >
        <ActivityIndicator size={"large"} color={Colors.success} />
        <Text style={styles.Text}>Loading...</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    paddingHorizontal: width * 0.05,
  },
  Text: {
    color: "#ffffff",
    fontSize: textStyle,
    justifyContent: "flex-start",
  },
});
