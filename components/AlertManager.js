/**
 * Helper for showing native alerts without spamming the user.
 */

import { Alert } from "react-native";

/**
 * Remembers which alert keys are currently "cooling down" (key -> true).
 */
let shownAlerts = {};

/**
 * Shows a native alert, but at most once every 5 seconds per `key`.
 *
 * How it works: if the key is already marked as shown, the call is ignored.
 * Otherwise the key is marked, a 5-second timer is started to clear it again,
 * and the alert is displayed. Useful when the same error (e.g. "no network")
 * could be triggered many times in a row by background work.
 *
 * @param {string} key - unique identifier for this kind of alert
 * @param {string} title - alert title
 * @param {string} message - alert body text
 */
export function showOnceAlert(key, title, message) {
  if (shownAlerts[key]) return;

  shownAlerts[key] = true;
  setTimeout(() => {
    shownAlerts[key] = false;
  }, 5000);

  Alert.alert(title, message);
}
