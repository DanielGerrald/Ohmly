import { environment } from "../../Config";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import Colors from "../../constants/colors";

const { width, height } = Dimensions.get("window");
/**
 * Base font size, scaled up for wider screens (phones < 380px, large phones, tablets > 600px).
 */
let textStyle = 12;
if (width >= 380 && width <= 600) textStyle = 16;
else if (width > 600) textStyle = 20;

/**
 * Shows a "Staging" banner on every non-production build (staging,
 * development, demo) so testers can tell they aren't using the live app.
 * Renders nothing in production.
 */
export default function StagingBanner() {
  if (environment.envName !== "production") {
    return (
      <View style={styles.stagingBannerView}>
        <Text style={styles.stagingBannerText}>Staging</Text>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  stagingBannerText: { color: "white", fontSize: textStyle },
  stagingBannerView: {
    top: 0,
    backgroundColor: Colors.primary,
    paddingTop: height / 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
