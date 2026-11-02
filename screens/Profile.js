/**
 * Profile tab: view and edit the technician's details, notification
 * preferences, and log out.
 */

import { useEffect, useRef, useState } from "react";
import { Dimensions, StyleSheet, View, Text, Switch, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SAFE_AREA_EDGES } from "../components/constants";
import AvatarIcon from "../components/ui/AvatarIcon";
import ReauthModal from "../components/ui/ReauthModal";
import {
  getLoginApi,
  lastLoggedinUserSqlite,
  postUserApi,
  requestEmailChangeApi,
  selectUserSqlite,
  updateUserSqlite,
} from "../Database/UserDatabase";
import CustomInput from "../components/ui/CustomInput";
import Version from "../components/ui/Version";
import { useSQLiteContext } from "expo-sqlite";
import AppSyncManager from "../components/AppSyncManager";
import { useJob } from "../components/Context";
import { useAuth } from "../components/AuthContext";
import Colors from "../constants/colors";

/**
 * Renders the avatar, the profile form (first/last name, email, phone),
 * email/SMS notification switches, Update and Log Out buttons, and the
 * re-authentication modal used for email changes.
 */
export default function Profile() {
  const db = useSQLiteContext();
  const { logout, refreshUser } = useAuth();
  const [lastLoggedIn, setLastLoggedIn] = useState(null);
  const [updatedUser, setUpdatedUser] = useState(null);
  const [isEnabledSMS, setIsEnabledSMS] = useState(false);
  const [isEnabledEmail, setIsEnabledEmail] = useState(false);
  const [reauthVisible, setReauthVisible] = useState(false);
  const pendingEmailRef = useRef(null);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone_nbr: "",
  });

  useEffect(() => {
    /**
     * Loads the current user from SQLite and fills the form and the
     * notification switches with their saved values.
     */
    const fetchUserData = async () => {
      try {
        const user = await lastLoggedinUserSqlite(db);
        if (user) {
          setLastLoggedIn(user);
          setUpdatedUser(user);
          setFormData({
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            phone_nbr: user.phone_nbr?.toString() || "",
          });
          setIsEnabledSMS(user.notify_sms === 1);
          setIsEnabledEmail(user.notify_email === 1);
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        Alert.alert("Failed to load user data.");
      }
    };

    fetchUserData();
  }, []);

  /**
   * Updates one field of the form state.
   *
   * @param {string} name - field name (first_name, last_name, email, phone_nbr)
   * @param {string} value - new text
   */
  const handleInputChange = (name, value) => {
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  /**
   * Saves the profile.
   *
   * How it works:
   * 1. All four fields are required.
   * 2. Saves name, phone and notification settings to SQLite.
   * 3. Sends the new display name ("First Last") to Firebase Auth and stores
   *    the fresh tokens Firebase returns.
   * 4. If the email changed, asks Firebase to send a verification link to the
   *    new address. If Firebase says the login is too old
   *    (CREDENTIAL_TOO_OLD_LOGIN_AGAIN), the new email is remembered and the
   *    password prompt (ReauthModal) is shown instead; handleReauthConfirm
   *    finishes the job.
   * 5. Refreshes the user in AuthContext and shows a success message.
   */
  const onSubmit = async () => {
    const { first_name, last_name, phone_nbr, email } = formData;

    if (first_name && last_name && phone_nbr && email) {
      const updatedData = {
        first_name,
        last_name,
        phone_nbr,
        localId: lastLoggedIn.localId,
        displayName: first_name + " " + last_name,
        notify_sms: isEnabledSMS ? 1 : 0,
        notify_email: isEnabledEmail ? 1 : 0,
      };

      await updateUserSqlite(db, updatedData);
      const user = await selectUserSqlite(db, updatedData.localId);
      const result = await postUserApi(user);
      if (result) {
        await updateUserSqlite(db, result);
        setUpdatedUser(result);
      }

      const emailChanged = email !== lastLoggedIn.email;
      if (emailChanged) {
        const emailResult = await requestEmailChangeApi(user.idToken, email);
        if (
          !emailResult.success &&
          emailResult.errorCode === "CREDENTIAL_TOO_OLD_LOGIN_AGAIN"
        ) {
          pendingEmailRef.current = email;
          setReauthVisible(true);
          return;
        }
      }

      await refreshUser();

      Alert.alert(
        "User Profile updated successfully!",
        emailChanged
          ? `We sent a confirmation link to ${email}. Your email won't change until you confirm it.`
          : undefined,
      );
    } else {
      Alert.alert("Please fill in all required fields.");
    }
  };

  /**
   * Finishes an email change after the user re-enters their password.
   *
   * How it works: signs in again with the current email and the given
   * password to get a fresh token, saves the new tokens to SQLite, then
   * retries the email change request with the pending new address.
   *
   * @param {string} password - password typed into the ReauthModal
   */
  const handleReauthConfirm = async (password) => {
    try {
      const freshLogin = await getLoginApi({
        username: lastLoggedIn.email,
        password,
      });
      if (!freshLogin?.idToken) {
        Alert.alert("Incorrect password. Please try again.");
        return;
      }

      await updateUserSqlite(db, {
        localId: lastLoggedIn.localId,
        idToken: freshLogin.idToken,
        refreshToken: freshLogin.refreshToken,
      });

      const emailResult = await requestEmailChangeApi(
        freshLogin.idToken,
        pendingEmailRef.current,
      );
      setReauthVisible(false);

      if (emailResult.success) {
        await refreshUser();
        Alert.alert(
          "User Profile updated successfully!",
          `We sent a confirmation link to ${pendingEmailRef.current}. Your email won't change until you confirm it.`,
        );
      } else {
        Alert.alert(
          "Email Change Error",
          "Could not update your email. Please try again.",
        );
      }
    } catch (error) {
      Alert.alert("Incorrect password. Please try again.");
    }
  };

  if (!lastLoggedIn) {
    return (
      <SafeAreaView style={styles.SafeArea} edges={SAFE_AREA_EDGES}>
        <Text>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.SafeArea} edges={SAFE_AREA_EDGES}>
      <AppSyncManager>
        <View style={styles.header}>
          <AvatarIcon />
          <Text style={styles.Text}>
            {lastLoggedIn.displayName || lastLoggedIn.email}
          </Text>
        </View>
        <View style={styles.profileForm}>
          <CustomInput
            label="first_name"
            style={styles.inputView}
            value={formData.first_name}
            placeholder={"First Name"}
            onChangeText={(text) => handleInputChange("first_name", text)}
          />
          <CustomInput
            label="last_name"
            style={styles.inputView}
            value={formData.last_name}
            placeholder={"Last Name"}
            onChangeText={(text) => handleInputChange("last_name", text)}
          />
          <CustomInput
            label="email"
            style={styles.inputView}
            value={formData.email}
            placeholder={"Email Address"}
            onChangeText={(text) => handleInputChange("email", text)}
            keyboardType="email-address"
          />
          <CustomInput
            label="phone_nbr"
            style={styles.inputView}
            value={formData.phone_nbr}
            placeholder={"Phone Number"}
            onChangeText={(text) => handleInputChange("phone_nbr", text)}
            autoComplete="tel"
            keyboardType="phone-pad"
          />

          <View style={styles.rowView}>
            <Text style={styles.switchLabel}>Email Notifications</Text>
            <Switch
              style={styles.switch}
              trackColor={{ false: "#999", true: Colors.accent }}
              ios_backgroundColor="#2C3444"
              thumbColor={isEnabledEmail ? Colors.accent : "#f4f3f4"}
              onValueChange={(value) => setIsEnabledEmail(value)}
              value={isEnabledEmail}
            />
          </View>
          <View style={styles.rowView}>
            <Text style={styles.switchLabel}>SMS Notifications</Text>
            <Switch
              style={styles.switch}
              trackColor={{ false: "#999", true: Colors.accent }}
              ios_backgroundColor="#2C3444"
              thumbColor={isEnabledSMS ? Colors.accent : "#f4f3f4"}
              onValueChange={(value) => setIsEnabledSMS(value)}
              value={isEnabledSMS}
            />
          </View>

          <View style={styles.profileFormButtons}>
            <Pressable style={styles.submitBtn} onPress={onSubmit}>
              <Text style={styles.buttonText}>Update</Text>
            </Pressable>
            <Pressable onPress={logout} style={styles.logoutBtn}>
              <Text style={styles.logoutBtnText}>Log Out</Text>
            </Pressable>
          </View>
        </View>
        <Version />
      </AppSyncManager>
      <ReauthModal
        visible={reauthVisible}
        onCancel={() => setReauthVisible(false)}
        onConfirm={handleReauthConfirm}
      />
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
  Text: {
    color: "#ffffff",
    fontSize: textStyle,
    justifyContent: "flex-start",
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
  profileForm: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  profileFormButtons: {
    flex: 2,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    elevation: 10,
    shadowColor: "black",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 6,
    shadowOpacity: 0.25,
  },
  rowView: {
    flexDirection: "row",
    alignItems: "center",
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
});
