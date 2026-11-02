/**
 * Forgot-password screen: sends a Firebase password reset email.
 */

import {
  Dimensions,
  StyleSheet,
  View,
  Text,
  Pressable,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

import CustomInput from "../components/ui/CustomInput";
import { useState } from "react";
import { Avatar } from "react-native-paper";
import { postRecoverPasswordAPI } from "../Database/UserDatabase";
import { BLURHASH } from "../components/constants";
import Colors from "../constants/colors";

/**
 * Renders an email field, a "Send Recovery Email" button and a back arrow
 * to the Login screen.
 *
 * @param {{navigation: Object}} props - React Navigation prop
 */
export default function ForgotPassword({ navigation }) {
  const [formData, setFormData] = useState({
    Username: "",
  });

  /**
   * Updates one field of the form state.
   *
   * @param {string} name - field name ("Username")
   * @param {string} value - new text
   */
  const handleInputChange = (name, value) => {
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  /**
   * Sends the reset email.
   *
   * How it works: requires an email, calls postRecoverPasswordAPI and shows
   * whatever message it returns (success text or the Firebase error), then
   * navigates back to the Login screen.
   */
  const onSubmit = async () => {
    const { Username } = formData;

    if (!Username) {
      Alert.alert("Please enter your username");
      return;
    }

    try {
      const post = await postRecoverPasswordAPI(Username);
      if (post) {
        Alert.alert(post);
      } else {
        Alert.alert("An unexpected error occurred. Please try again.");
      }

      navigation.navigate({
        name: "Login",
      });
    } catch (error) {
      console.error(error);
      Alert.alert(
        "An error occurred while processing your request. Please try again later.",
      );
    }
  };

  return (
    <SafeAreaView style={styles.SafeArea}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          <View style={styles.header}>
            <Image
              style={styles.loginLogo}
              source={require("../assets/logo.png")}
              contentFit={"contain"}
              placeholder={BLURHASH}
            />

            <Text style={styles.fpText}>
              If you've forgotten your password, use the form below to start the
              recovery process.
            </Text>
          </View>
          <View style={styles.fpForm}>
            <CustomInput
              label="username"
              style={styles.inputView}
              value={formData.Username}
              placeholder={"Username"}
              onChangeText={(text) => handleInputChange("Username", text)}
              keyboardType={"email-address"}
            />

            <Pressable onPress={onSubmit} style={styles.fpSubmitBtn}>
              <Text style={styles.buttonText}>Send Recovery Email</Text>
            </Pressable>

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.navigate("Login")}
            >
              <Avatar.Icon
                style={styles.avatarIcon}
                icon="arrow-left"
                size={55}
              />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  avatarIcon: {
    backgroundColor: Colors.primary,
    marginRight: 10,
  },
  backButton: {
    position: "absolute",
    left: 5,
    bottom: "10%",
    elevation: 6,
    shadowColor: "black",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 6,
    shadowOpacity: 0.25,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: textStyle,
    fontWeight: "600",
  },
  container: {
    flexGrow: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    paddingHorizontal: width * 0.05,
  },
  fpForm: {
    flex: 3,
    width: "100%",
    maxHeight: height * 0.7,
    marginTop: "5%",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  fpSubmitBtn: {
    width: width / 1.5,
    backgroundColor: Colors.accent,
    borderRadius: 20,
    marginTop: height * 0.08,
    marginBottom: 25,
    height: height * 0.08,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "black",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 6,
    shadowOpacity: 0.25,
  },
  fpText: {
    color: "#ffffff",
    fontSize: textStyle,
    justifyContent: "flex-start",
    marginTop: height * 0.05,
  },
  header: {
    alignItems: "center",
    marginBottom: height * 0.03,
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
  loginLogo: {
    flexShrink: 1,
    width: "auto",
    minWidth: "100%",
    minHeight: height * 0.1,
  },
});
