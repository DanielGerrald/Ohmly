/**
 * Login screen.
 *
 * Signs the technician in with Firebase, saves their profile to SQLite and
 * downloads their jobs before showing the main app, so everything is
 * available offline right after login.
 */

import { Image } from "expo-image";
import {
  Alert,
  Dimensions,
  StyleSheet,
  Pressable,
  Text,
  View,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";
import { useNavigation } from "@react-navigation/native";
import * as Network from "expo-network";
import { IconButton } from "react-native-paper";

import {
  getLoginApi,
  getUserAvatarApi,
  getUserProfileApi,
  insertUserSqlite,
  selectUserByEmailSqlite,
  selectUserSqlite,
  updateUserSqlite,
} from "../Database/UserDatabase";
import CustomInput from "../components/ui/CustomInput";
import { SignupButton } from "../components/ui/SignupButton.js";
import {
  getAssignmentsApi,
  cleanupWorkOrderSqlite,
  insertWorkOrderSqlite,
  updateWorkOrderSqlite,
} from "../Database/WorkOrderDatabase";
import { getLabelsApi, insertCategoryLabelSqlite } from "../Database/LabelDatabase";
import { isTokenExpired, useAuth } from "../components/AuthContext";
import { cleanupCheckInOutSqlite } from "../Database/CheckInOutDatabase";
import {
  getWorkOrderContactsApi,
  cleanupContactSqlite,
  insertContactSqlite,
} from "../Database/ContactDatabase";
import {
  cleanupAttachmentSqlite,
  getAttachmentsApi,
  insertAttachmentSqlite,
  selectAttachmentSqlite,
} from "../Database/AttachmentDatabase";
import {
  cleanupFinalCheckOutSqlite,
  getFinalCheckoutApi,
  insertFinalCheckOutSqlite,
  selectFinalCheckOutSqlite,
} from "../Database/FinalCheckOutDatabase";
import Loading from "../components/ui/Loading";
import Version from "../components/ui/Version";
import { useSQLiteContext } from "expo-sqlite";
import { BLURHASH } from "../components/constants";
import Colors from "../constants/colors";

/**
 * Renders the login form (username/email, password with show/hide toggle,
 * "Forgot Password?" link, LOGIN button and sign-up link).
 */
export default function Login() {
  const { login } = useAuth();
  const navigation = useNavigation();
  const db = useSQLiteContext();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });

  /**
   * Updates one field of the form state.
   *
   * @param {"username"|"password"} name - field to update
   * @param {string} value - new text
   */
  const handleInputChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  /**
   * Saves one job and its related data to SQLite during login.
   *
   * How it works: upserts the work order; if the server marks it completed,
   * sets its local status to "Completed" and downloads the completion
   * checklist (if not stored yet). Then downloads and stores the job's
   * contacts, and its attachments (only those not already stored). The
   * attachment folder id is the part of the site's reference_code after "-".
   *
   * @param {Object} job - one item from getAssignmentsApi
   * @param {string} idToken - Firebase ID token
   */
  async function syncJob(job, idToken) {
    await insertWorkOrderSqlite(db, job);

    if (job.assignment.completed) {
      await updateWorkOrderSqlite(
        db,
        "status_label",
        "Completed",
        "id",
        job.assignment.id,
      );

      const existingCheckout = await selectFinalCheckOutSqlite(
        db,
        "assignment_id",
        job.assignment.id,
      );
      if (!existingCheckout?.length) {
        const finalCheckout = await getFinalCheckoutApi(
          idToken,
          job.assignment.id,
        );
        if (finalCheckout) {
          await insertFinalCheckOutSqlite(db, finalCheckout);
        }
      }
    }

    const contact = await getWorkOrderContactsApi(idToken, job.assignment.id);
    if (contact) {
      await insertContactSqlite(db, contact, job.assignment.id);
    }

    const assignmentRefId = job.site?.reference_code?.split("-")[1];
    if (assignmentRefId) {
      const attachments = await getAttachmentsApi(idToken, assignmentRefId);
      for (const att of attachments) {
        const existing = await selectAttachmentSqlite(
          db,
          "fileName",
          att.fileName,
          "assignment_id",
          att.assignment_id,
        );
        if (!existing?.length) {
          await insertAttachmentSqlite(db, att);
        }
      }
    }
  }

  /**
   * Handles the LOGIN button.
   *
   * How it works:
   * 1. Requires both fields to be filled in.
   * 2. Checks the network and calls Firebase sign-in. If the internet isn't
   *    reachable it falls back to handleOfflineLogin.
   *    Note: getLoginApi runs before the offline check and throws when there
   *    is no connection, so in practice a fully offline device ends up in the
   *    catch block ("An error occurred") rather than the offline login path.
   * 3. Loads the user's profile and avatar and saves/updates the local user
   *    row (marking them logged in with the current time as last_login).
   * 4. Re-reads the user and verifies the token isn't expired.
   * 5. Downloads all jobs and labels; removes local data for jobs that no
   *    longer exist, stores the labels and syncs each job (syncJob).
   * 6. Calls login() from AuthContext, which switches to the main app.
   * Any error shows a generic alert.
   */
  async function onSubmit() {
    const { username, password } = formData;

    if (!username || !password) {
      Alert.alert("Please enter a valid username and password");
      return;
    }

    setLoading(true);

    try {
      const networkState = await Network.getNetworkStateAsync();
      const apiLoginData = await getLoginApi(formData);

      if (!networkState.isInternetReachable) {
        await handleOfflineLogin();
        return;
      }

      if (!apiLoginData) {
        setLoading(false);
        Alert.alert("Username and/or password is incorrect");
        return;
      }

      const userProfile = await getUserProfileApi(apiLoginData);
      const avatar = await getUserAvatarApi(
        apiLoginData.idToken,
        apiLoginData.localId,
      );

      const existingUser = await selectUserSqlite(db, apiLoginData.localId);
      const userData = {
        ...apiLoginData,
        ...userProfile,
        ...(avatar ? { avatar } : {}),
        logged_in: 1,
      };

      if (!existingUser) {
        await insertUserSqlite(db, userData);
      } else {
        await updateUserSqlite(db, userData);
      }

      const updatedUser = await selectUserSqlite(db, apiLoginData.localId);

      if (!updatedUser) {
        setLoading(false);
        Alert.alert("User data not found. Please log in again.");
        return;
      }

      if (await isTokenExpired(updatedUser.idToken)) {
        setLoading(false);
        Alert.alert("Session expired. Please log in again.");
        return;
      }

      const jobs = await getAssignmentsApi(updatedUser.idToken);
      const attachmentTypes = await getLabelsApi(updatedUser.idToken);

      if (jobs.length > 0) {
        await cleanupWorkOrderSqlite(db, jobs);
        await cleanupContactSqlite(db, jobs);
        await cleanupCheckInOutSqlite(db, jobs);
        await cleanupAttachmentSqlite(db, jobs);
        await cleanupFinalCheckOutSqlite(db, jobs);

        if (attachmentTypes) {
          await insertCategoryLabelSqlite(db, attachmentTypes);
        }

        for (const job of jobs) {
          await syncJob(job, updatedUser.idToken);
        }
      }

      setLoading(false);
      login(updatedUser);
    } catch (error) {
      console.error("Error during login process:", error);
      setLoading(false);
      Alert.alert("An error occurred. Please try again.");
    }
  }

  /**
   * Lets a previously-logged-in user in without internet.
   *
   * How it works: looks the user up in SQLite by the email typed in. If they
   * exist and their saved token hasn't expired, they're logged in with the
   * cached data; otherwise an alert explains they need internet. The password
   * is not checked in this path.
   */
  async function handleOfflineLogin() {
    setLoading(false);
    const sqliteUserData = await selectUserByEmailSqlite(db, formData.username);
    if (!sqliteUserData) {
      Alert.alert(
        "The username does not exist!",
        "Try again when you have internet access",
      );
    } else if (await isTokenExpired(sqliteUserData.idToken)) {
      Alert.alert(
        "Session expired.",
        "Try again when you have internet access",
      );
    } else {
      login(sqliteUserData);
    }
  }

  /**
   * Shows or hides the password text.
   */
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <SafeAreaView style={styles.SafeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          {loading ? (
            <Loading />
          ) : (
            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: "center",
                padding: 20,
              }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.header}>
                <Image
                  style={styles.loginLogo}
                  source={require("../assets/logo.png")}
                  contentFit={"contain"}
                  placeholder={BLURHASH}
                />
                <Text style={styles.loginTitle}>Ohmly</Text>
                <Text style={styles.loginSubtitle}>
                  Sign in to manage your jobs
                </Text>
              </View>
              <View style={styles.loginCard}>
                <View style={styles.loginForm}>
                  <CustomInput
                    label="username"
                    style={styles.inputView}
                    placeholder={"User Name"}
                    value={formData.username}
                    onChangeText={(text) => handleInputChange("username", text)}
                    textContentType="username"
                    autoComplete="username"
                  />

                  <View style={styles.passwordInputContainer}>
                    <CustomInput
                      label="password"
                      style={styles.inputView}
                      placeholder={"Password"}
                      value={formData.password}
                      onChangeText={(text) =>
                        handleInputChange("password", text)
                      }
                      secureTextEntry={!showPassword}
                      textContentType="password"
                      autoComplete="password"
                    />
                    <IconButton
                      icon={showPassword ? "eye-off" : "eye"}
                      color={Colors.background}
                      size={20}
                      onPress={togglePasswordVisibility}
                      style={styles.passwordVisibilityButton}
                    />
                  </View>

                  <View style={styles.loginFormButtons}>
                    <Pressable
                      onPress={() => navigation.navigate("Forgot Password")}
                    >
                      <Text style={styles.signupText}>
                        Forgot Password?
                      </Text>
                    </Pressable>
                    <Pressable onPress={onSubmit} style={styles.loginBtn}>
                      <Text style={styles.buttonText}>LOGIN</Text>
                    </Pressable>
                    <SignupButton />
                  </View>
                </View>
              </View>
              <Version />
            </ScrollView>
          )}
        </TouchableWithoutFeedback>
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
  buttonText: {
    color: "#ffffff",
    fontSize: textStyle,
    fontWeight: "600",
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
  loginBtn: {
    width: width * 0.6,
    backgroundColor: Colors.accent,
    borderRadius: 20,
    height: height * 0.07,
    alignItems: "center",
    justifyContent: "center",
    marginTop: height * 0.05,
    marginBottom: height * 0.05,
    elevation: 6,
    shadowColor: "black",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 6,
    shadowOpacity: 0.25,
  },
  loginCard: {
    width: "100%",
    alignItems: "center",
    backgroundColor: "#242C3A",
    borderRadius: 24,
    paddingVertical: height * 0.04,
    paddingHorizontal: width * 0.05,
    elevation: 6,
    shadowColor: "black",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 6,
    shadowOpacity: 0.25,
  },
  loginForm: {
    flex: 2,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  loginFormButtons: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "space-evenly",
    elevation: 6,
    shadowColor: "black",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 6,
    shadowOpacity: 0.25,
  },
  loginSubtitle: {
    color: Colors.muted,
    fontSize: textStyle,
    textAlign: "center",
    marginTop: -height * 0.015,
    marginBottom: height * 0.01,
  },
  loginTitle: {
    fontWeight: "bold",
    fontSize: 40,
    color: "#ffffff",
    textAlign: "center",
    marginVertical: height * 0.03,
  },
  loginLogo: {
    flexShrink: 1,
    width: "auto",
    minWidth: "100%",
    minHeight: height * 0.1,
  },
  passwordInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  passwordVisibilityButton: {
    position: "absolute",
    right: width * 0.03,
    bottom: height * 0.02,
    elevation: 6,
    shadowColor: "black",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 6,
    shadowOpacity: 0.25,
  },
  signupText: {
    color: Colors.accent,
    fontSize: textStyle,
    justifyContent: "flex-start",
  },
});
