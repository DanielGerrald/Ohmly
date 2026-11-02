/**
 * Tappable round profile picture used on the Profile screen.
 */

import { Alert, Image, StyleSheet, TouchableOpacity } from "react-native";
import { useEffect, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Network from "expo-network";
import { Avatar } from "react-native-paper";

import profileIcon from "../../assets/user.png";
import {
  lastLoggedinUserSqlite,
  postUserAvatarApi,
  updateUserSqlite,
} from "../../Database/UserDatabase";
import { useSQLiteContext } from "expo-sqlite";
import { useJob } from "../Context";

/**
 * Shows the user's avatar (or a default icon) and lets them pick a new one
 * from the photo library.
 *
 * Reloads the avatar from SQLite whenever a sync finishes (syncVersion), so
 * an avatar changed on another device shows up after syncing.
 */
export default function AvatarIcon() {
  const db = useSQLiteContext();
  const { syncVersion } = useJob();
  const [lastLoggedIn, setLastLoggedIn] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const profileIconUri = Image.resolveAssetSource(profileIcon).uri;

  useEffect(() => {
    /**
     * Loads the current user from SQLite and shows their saved avatar (or the default icon).
     */
    const fetchUserData = async () => {
      try {
        const user = await lastLoggedinUserSqlite(db);
        setLastLoggedIn(user);
        setSelectedImage(user.avatar || profileIconUri);
      } catch (error) {
        console.error("Error fetching user data:", error);
        Alert.alert("Failed to load user data.");
      }
    };

    fetchUserData();
  }, [syncVersion]);

  /**
   * Lets the user choose and crop a new profile picture.
   *
   * How it works: opens the photo library with cropping enabled; the chosen
   * image is resized to 300px wide, compressed as JPEG and turned into a
   * base64 data URI. That string is shown immediately, saved to the user row
   * in SQLite, and, if the device is online, uploaded to Firebase. (If
   * offline, the remote copy is not updated until the avatar is changed
   * again while online.)
   */
  const pickImageAsync = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      try {
        // Resize/compress down to something reasonable for an avatar and
        // encode as a data URI — the same string works as a local <Image>
        // source and as a portable value we can sync through Firebase,
        // with no separate on-device file to manage.
        const manipulated = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 300 } }],
          {
            compress: 0.7,
            format: ImageManipulator.SaveFormat.JPEG,
            base64: true,
          },
        );
        const dataUri = `data:image/jpeg;base64,${manipulated.base64}`;
        setSelectedImage(dataUri);

        if (lastLoggedIn) {
          const updatedUser = { ...lastLoggedIn, avatar: dataUri };
          await updateUserSqlite(db, updatedUser);
          setLastLoggedIn(updatedUser);

          const networkState = await Network.getNetworkStateAsync();
          const online = Boolean(
            networkState?.isConnected && networkState?.isInternetReachable,
          );
          if (online) {
            await postUserAvatarApi(
              lastLoggedIn.idToken,
              lastLoggedIn.localId,
              manipulated.base64,
              "image/jpeg",
            );
          }
        }
      } catch (error) {
        console.error("Error updating profile image:", error);
        Alert.alert("Failed to update profile image.");
      }
    }
  };

  return (
    <TouchableOpacity onPress={pickImageAsync}>
      <Avatar.Image
        style={styles.profilePic}
        source={{ uri: selectedImage || profileIconUri }}
        size={100}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  profilePic: {
    flexShrink: 1,
    width: "auto",
  },
});
