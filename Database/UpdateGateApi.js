/**
 * API call used by the force-update gate (components/UpdateGate.js).
 */

import axios from "axios";

import { environment } from "../Config";

/**
 * Fetches the minimum supported app / OS versions from the backend.
 *
 * How it works: performs an unauthenticated GET on `/version.json` in the
 * Realtime Database and maps the snake_case fields to camelCase. Missing
 * OS minimums default to null. Any network/parse error is logged and
 * swallowed so the app is never blocked just because this check failed.
 *
 * @returns {Promise<{minVersion: string, minIosVersion: (string|null),
 *   minAndroidApi: (number|null)} | undefined>} the minimums, or undefined
 *   if nothing is configured or the request failed
 */
export async function getMinimums() {
  try {
    const response = await axios.get(environment.apiUrl + "/version.json");
    const results = response.data;
    if (!results) return undefined;
    return {
      minVersion: results.minimum_version,
      minIosVersion: results.minimum_ios_version ?? null,
      minAndroidApi: results.minimum_android_api ?? null,
    };
  } catch (error) {
    console.log("getMinimums Error:", error);
    return undefined;
  }
}
