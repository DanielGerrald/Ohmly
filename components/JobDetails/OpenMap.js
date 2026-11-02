/**
 * Opens turn-by-turn directions to a job site in a maps app.
 */

import { Platform, Linking, ActionSheetIOS, Alert } from "react-native";

/**
 * Lets the user pick a maps app and opens directions to the given point.
 *
 * How it works:
 * 1. Validates the coordinates (numbers within normal lat/lng ranges).
 * 2. Builds links for Apple Maps, Google Maps (app scheme on iOS, geo: on
 *    Android) and Waze, plus web fallbacks.
 * 3. Keeps only the apps the device can open; if none, offers Google Maps
 *    and Waze in the browser.
 * 4. Shows an action sheet (iOS) or an alert with buttons (Android) to
 *    choose one, then opens that link.
 *
 * @param {number|string} latitude
 * @param {number|string} longitude
 * @param {string} [label] - place name shown as the destination
 */
export default async function OpenMap(latitude, longitude, label) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (
    Number.isNaN(lat) ||
    Number.isNaN(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    console.error("Invalid coordinates:", latitude, longitude);
    return;
  }

  const safeLabel =
    typeof label === "string" && label.trim().length > 0
      ? encodeURIComponent(label.trim())
      : null;

  // Candidate URLs
  const urls = {
    // Apple Maps (iOS only)
    apple: safeLabel
      ? `http://maps.apple.com/?daddr=${lat},${lng}&q=${safeLabel}`
      : `http://maps.apple.com/?daddr=${lat},${lng}`,

    // Google Maps (iOS uses comgooglemaps://, Android uses geo:)
    google: Platform.select({
      ios: safeLabel
        ? `comgooglemaps://?q=${lat},${lng}(${safeLabel})&center=${lat},${lng}&zoom=14&views=traffic`
        : `comgooglemaps://?q=${lat},${lng}&center=${lat},${lng}&zoom=14&views=traffic`,
      android: safeLabel
        ? `geo:${lat},${lng}?q=${lat},${lng}(${safeLabel})`
        : `geo:${lat},${lng}?q=${lat},${lng}`,
    }),

    // Fallback Google Maps Web
    googleWeb: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,

    // Waze
    waze: `waze://?ll=${lat},${lng}&navigate=yes`,
    wazeWeb: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
  };

  // Check installed apps
  const apps = [];
  if (await Linking.canOpenURL(urls.apple))
    apps.push({ name: "Apple Maps", url: urls.apple });
  if (await Linking.canOpenURL(urls.google))
    apps.push({ name: "Google Maps", url: urls.google });
  if (await Linking.canOpenURL(urls.waze))
    apps.push({ name: "Waze", url: urls.waze });

  // If none installed → add web fallbacks
  if (apps.length === 0) {
    apps.push({ name: "Google Maps (Web)", url: urls.googleWeb });
    apps.push({ name: "Waze (Web)", url: urls.wazeWeb });
  }

  if (apps.length === 0) {
    console.error("No map apps available");
    return;
  }

  // Show user prompt
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...apps.map((a) => a.name), "Cancel"],
        cancelButtonIndex: apps.length,
      },
      async (buttonIndex) => {
        if (buttonIndex < apps.length) {
          await Linking.openURL(apps[buttonIndex].url);
        }
      },
    );
  } else {
    // Android Alert-based prompt
    Alert.alert(
      "Open with",
      "Choose a maps app",
      apps.map((a) => ({
        text: a.name,
        onPress: async () => {
          await Linking.openURL(a.url);
        },
      })),
      { cancelable: true },
    );
  }
}
