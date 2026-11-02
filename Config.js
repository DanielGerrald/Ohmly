/**
 * Environment configuration.
 *
 * Picks a settings object based on the Expo Updates channel the build was
 * published to (production / staging / development), falling back to a
 * "demo" profile for local runs where no channel is set. The resulting
 * `environment` object is imported throughout the app for the Firebase
 * API URL, API key, and feature flags.
 */

import * as Updates from "expo-updates";

/**
 * The active environment settings, resolved once when this module loads.
 */
export const environment = getEnvironment();

/**
 * Maps the current Expo Updates channel to an environment settings object.
 *
 * How it works: reads `Updates.channel` (set at build/publish time by EAS)
 * and returns a hard-coded config for that channel. Any unknown or missing
 * channel (e.g. running in Expo Go) falls through to the "demo" profile.
 *
 * @returns {{envName: string, icon: string, apiUrl: string,
 *   enableHiddenFeatures: boolean, apikey: string, staging: boolean}}
 *   - envName: human-readable environment name
 *   - icon: emoji shown in the staging banner
 *   - apiUrl: base URL of the Firebase Realtime Database REST API
 *   - enableHiddenFeatures: turns on debug/test-only UI
 *   - apikey: Firebase web API key (from EXPO_PUBLIC_FIREBASE_API_KEY)
 *   - staging: true for every non-production build (shows the staging banner)
 */
function getEnvironment() {
  switch (Updates.channel) {
    case "production":
      return {
        envName: "production",
        icon: "✅",
        apiUrl: "https://ohmly-4a268-default-rtdb.firebaseio.com",
        enableHiddenFeatures: false,
        apikey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
        staging: false,
      };

    case "staging":
      return {
        envName: "staging",
        icon: "🚧",
        apiUrl: "https://ohmly-4a268-default-rtdb.firebaseio.com",
        enableHiddenFeatures: true,
        apikey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
        staging: true,
      };

    case "development":
      return {
        envName: "development",
        icon: "⚙️",
        apiUrl: "https://ohmly-4a268-default-rtdb.firebaseio.com",
        enableHiddenFeatures: true,
        apikey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
        staging: true,
      };

    default:
      return {
        envName: "demo",
        icon: "🎯",
        apiUrl: "https://ohmly-4a268-default-rtdb.firebaseio.com",
        enableHiddenFeatures: true,
        apikey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
        staging: true,
      };
  }
}
