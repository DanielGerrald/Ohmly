/**
 * Force-update gate.
 *
 * Blocks the app when the installed version (or the device's OS) is older
 * than the minimums configured in Firebase at /version.json, and shows a
 * screen telling the user to update.
 */

import React from "react";
import {
  Dimensions,
  Platform,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Linking,
} from "react-native";
import * as Application from "expo-application";

import { getMinimums } from "../Database/UpdateGateApi";
import Colors from "../constants/colors";

// Update these with your actual App Store / Play Store URLs before publishing
/**
 * Store links opened by the "Update now" button.
 */
const IOS_APP_STORE_URL = "https://apps.apple.com/app/ohmly";
const ANDROID_PACKAGE = "com.ohmly.fieldops";
const ANDROID_PLAY_STORE_WEB = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
const ANDROID_PLAY_STORE_MARKET = `market://details?id=${ANDROID_PACKAGE}`;

/**
 * Minimum OS versions used when the server doesn't specify one.
 */
const DEFAULT_MIN_IOS_VERSION = "16.0";
const DEFAULT_MIN_ANDROID_API = 24;

/**
 * Compares two version strings like "1.2.10" and "1.3".
 *
 * How it works: splits on ".", converts each part to a number (missing or
 * non-numeric parts count as 0) and compares part by part from the left.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} 1 if a > b, -1 if a < b, 0 if equal
 */
function compareSemver(a, b) {
  const pa = String(a).split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(".").map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

/**
 * Opens the app's store page so the user can update.
 * On Android it prefers the Play Store app (market:// link) and falls back
 * to the web page; on iOS it opens the App Store link.
 */
async function openStoreListing() {
  if (Platform.OS === "android") {
    const canOpenMarket = await Linking.canOpenURL(ANDROID_PLAY_STORE_MARKET);
    await Linking.openURL(canOpenMarket ? ANDROID_PLAY_STORE_MARKET : ANDROID_PLAY_STORE_WEB);
    return;
  }
  await Linking.openURL(IOS_APP_STORE_URL);
}

/**
 * Checks the device OS against the minimum.
 *
 * iOS compares the version string (e.g. "16.4" >= "16.0"); Android compares
 * the API level number (e.g. 33 >= 24). Other platforms are always allowed.
 *
 * @param {{minIosVersion?: string, minAndroidApi?: number}} minimum
 * @returns {boolean}
 */
function isOsSupported(minimum) {
  if (Platform.OS === "ios") {
    const minIos = minimum.minIosVersion ?? DEFAULT_MIN_IOS_VERSION;
    return compareSemver(String(Platform.Version), minIos) >= 0;
  }
  if (Platform.OS === "android") {
    const minApi = minimum.minAndroidApi ?? DEFAULT_MIN_ANDROID_API;
    return (Platform.Version ?? 0) >= minApi;
  }
  return true;
}

/**
 * Last fetched minimums plus when they were fetched (in-memory cache).
 */
let cachedMinimums = null;
/**
 * How long the cached minimums are reused before fetching again (5 minutes).
 */
const MINIMUMS_TTL_MS = 5 * 60 * 1000;

/**
 * Returns the minimum versions, using the cache if it is less than 5
 * minutes old, otherwise calling getMinimums() and caching the result.
 *
 * @returns {Promise<Object|undefined>}
 */
async function fetchMinimums() {
  if (cachedMinimums && Date.now() - cachedMinimums.fetchedAt < MINIMUMS_TTL_MS) {
    return cachedMinimums.value;
  }
  const value = await getMinimums();
  cachedMinimums = { value, fetchedAt: Date.now() };
  return value;
}

/**
 * Hook that decides whether the app is allowed to run.
 *
 * How it works: on mount it reads the installed app version, fetches the
 * minimums and sets `state.status` to:
 * - "checking" while running,
 * - "unsupported_os" if the device OS is too old,
 * - "required" (with installedVersion and minVersion) if the app is too old,
 * - "ok" otherwise,
 * - "error" if the check itself failed (in development builds an error is
 *   treated as "ok" so you aren't blocked while coding).
 * Note: if getMinimums returns undefined (offline), reading its fields
 * throws and the result is "error". App.js does not block on "error",
 * but it does skip the OTA update check in that case.
 *
 * @returns {{state: Object, retry: Function}} current state and a function
 *   to run the check again
 */
export function useForcedUpdateGate() {
  const [state, setState] = React.useState({ status: "checking" });

  /**
   * Runs the version/OS check and updates `state`.
   */
  const check = React.useCallback(async () => {
    try {
      const installedVersion = Application.nativeApplicationVersion ?? "0.0.0";
      const minimum = await fetchMinimums();

      if (!isOsSupported(minimum)) {
        setState({ status: "unsupported_os" });
        return;
      }

      const versionTooLow = compareSemver(installedVersion, minimum.minVersion) < 0;

      if (versionTooLow) {
        setState({ status: "required", installedVersion, minVersion: minimum.minVersion });
      } else {
        setState({ status: "ok" });
      }
    } catch (e) {
      if (__DEV__) {
        setState({ status: "ok" });
        return;
      }
      setState({ status: "error", error: e?.message ?? "Unknown error" });
    }
  }, []);

  React.useEffect(() => {
    check();
  }, [check]);

  return { state, retry: check };
}

/**
 * Full-screen message shown when the device's OS is below the minimum.
 * There is no button because the user can't fix this from inside the app.
 */
export function UnsupportedOSScreen() {
  const osName = Platform.OS === "ios" ? "iOS" : "Android";
  const minVersion =
    Platform.OS === "ios" ? DEFAULT_MIN_IOS_VERSION : `API ${DEFAULT_MIN_ANDROID_API}`;

  return (
    <View style={styles.modalPopup}>
      <View style={styles.modalPopupContent}>
        <Text style={styles.TextTitle}>Device Not Supported</Text>
        <Text style={styles.TextDescript}>
          This app requires {osName} {minVersion} or later.{"\n\n"}
          Please upgrade your operating system or use a newer device to continue.
        </Text>
      </View>
    </View>
  );
}

/**
 * Full-screen message shown when the installed app version is too old.
 * Displays the installed and required versions and an "Update now" button
 * that opens the store listing.
 *
 * @param {{installedVersion: string, minVersion: string}} props
 */
export function UpdateRequiredScreen({ installedVersion, minVersion }) {
  return (
    <View style={styles.modalPopup}>
      <View style={styles.modalPopupContent}>
        <Text style={styles.TextTitle}>Update Required</Text>
        <Text style={styles.TextDescript}>
          To continue using the app, please update to the latest version.{"\n"}
        </Text>
        <Text style={styles.TextDescript}>
          Installed: v{installedVersion}{"\n"}
          Required: v{minVersion}+
        </Text>
        <View style={styles.checkoutFormBtns}>
          <TouchableOpacity onPress={openStoreListing} style={styles.submitBtn}>
            <Text style={styles.logoutBtnText}>Update now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
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
  checkoutFormBtns: {
    alignItems: "center",
    justifyContent: "center",
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
  modalPopup: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: width * 0.05,
  },
  modalPopupContent: {
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 560,
    maxHeight: height * 0.8,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
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
});
