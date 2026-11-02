/**
 * Work orders (called "assignments" in the database).
 *
 * API functions talk to the Firebase Realtime Database REST API; SQLite
 * functions read/write the local `assignment` table used by the UI.
 */

import axios from "axios";

import { environment } from "../Config";
import { safeColumn, safeColumnsFrom } from "./SqlSafety";

//---------------API Functions---------------//

/**
 * Downloads every work order the signed-in user can see.
 *
 * How it works: GET `/ASSIGNMENTS.json`. Firebase returns an object keyed by
 * id, so it is converted to an array. Entries without an `assignment` block
 * are skipped, `assignment.id` is forced to a number (falling back to the
 * Firebase key), and `completed` is normalized to 1/0 for SQLite.
 *
 * @param {string} idToken - Firebase ID token
 * @returns {Promise<Array<{client: Object, site: Object, assignment: Object}>>}
 *   the work orders, or an empty array on error
 */
export async function getAssignmentsApi(idToken) {
  try {
    const response = await axios.get(environment.apiUrl + "/ASSIGNMENTS.json", {
      params: { auth: idToken },
    });
    const results = response.data;
    if (!results) return [];
    return Object.entries(results)
      .filter(([, job]) => job && job.assignment)
      .map(([key, job]) => ({
        ...job,
        assignment: {
          ...job.assignment,
          id: Number(job.assignment.id ?? key),
          completed: job.assignment.completed ? 1 : 0,
        },
      }));
  } catch (error) {
    console.log("Assignments API call failed:", error);
    return [];
  }
}

/**
 * Updates some fields of one work order in Firebase.
 *
 * How it works: PATCH `/ASSIGNMENTS/{id}/assignment.json` – only the given
 * fields change, everything else is left alone.
 *
 * @param {string} idToken - Firebase ID token
 * @param {number|string} id - work order id
 * @param {Object} fields - fields to update, e.g. { status_label: "Completed" }
 * @returns {Promise<boolean>} true if the request succeeded
 */
export async function patchAssignmentApi(idToken, id, fields) {
  try {
    await axios.patch(
      environment.apiUrl + `/ASSIGNMENTS/${id}/assignment.json`,
      fields,
      { params: { auth: idToken } },
    );
    return true;
  } catch (error) {
    console.log(
      "patchAssignmentApi Error:",
      error.response?.data ?? error.message,
    );
    return false;
  }
}

//---------------SQLITE Functions---------------//

/**
 * Saves (or overwrites) one work order in the local `assignment` table.
 *
 * How it works: flattens the API shape into a single row by merging the
 * client, site and assignment objects (in that order, so assignment fields
 * win). The site's `id` is renamed to `site_id` so it doesn't clash with the
 * work order id, and `attachment_types` is removed (labels are stored
 * separately). Empty values are skipped and `INSERT OR REPLACE` upserts by id.
 * Note: this mutates `data.site`.
 *
 * @param {SQLiteDatabase} db - open expo-sqlite database
 * @param {{client?: Object, site?: Object, assignment?: Object}} data -
 *   one item from getAssignmentsApi
 */
export async function insertWorkOrderSqlite(db, data) {
  try {
    const customer = data.client || {};
    const jobData = data.site || {};
    const workOrder = data.assignment || {};
    delete jobData.attachment_types;
    const { id, ...rest } = jobData;
    const newJobData = { site_id: id, ...rest };

    const newData = { ...customer, ...newJobData, ...workOrder };

    const columns = safeColumnsFrom(newData);

    const placeholders = columns.map(() => "?").join(", ");
    const values = columns.map((key) => newData[key]);
    await db.runAsync(
      `INSERT OR REPLACE INTO assignment (${columns.join(", ")}) VALUES (${placeholders})`,
      [...values],
    );
  } catch (error) {
    console.log("Insert/update work order failed:", error);
  }
}

/**
 * Reads work orders where one column equals a value.
 *
 * Example: selectWorkOrderSqlite(db, "id", 42).
 * Column names are checked with safeColumn (SqlSafety.js); an invalid
 * name is logged and the query is not run.
 *
 * @param {SQLiteDatabase} db
 * @param {string} key - column to filter on
 * @param {*} value - value to match
 * @returns {Promise<Array<Object>|undefined>} matching rows
 */
export async function selectWorkOrderSqlite(db, key, value) {
  try {
    return await db.getAllAsync(`SELECT * FROM assignment WHERE ${safeColumn(key)} = ?`, [
      value,
    ]);
  } catch (error) {
    console.log("Select work orders failed:", error);
  }
}

/**
 * Sets one column on the work orders that match a condition.
 *
 * Runs: UPDATE assignment SET key1 = value1 WHERE key2 = value2.
 * Column names are checked with safeColumn (SqlSafety.js); an invalid
 * name is logged and the query is not run.
 *
 * @param {SQLiteDatabase} db
 * @param {string} key1 - column to change
 * @param {*} value1 - new value
 * @param {string} key2 - column to match on
 * @param {*} value2 - value to match
 */
export async function updateWorkOrderSqlite(db, key1, value1, key2, value2) {
  try {
    await db.runAsync(
      `UPDATE assignment SET ${safeColumn(key1)} = ? WHERE ${safeColumn(key2)} = ?`,
      [value1, value2],
    );
  } catch (error) {
    console.log("Update work order failed:", error);
  }
}

/**
 * Deletes local work orders that are no longer on the server.
 *
 * How it works: collects the ids from the latest API result and deletes
 * every local row whose id isn't in that list. If the server returned no
 * work orders at all, the whole table is cleared.
 *
 * @param {SQLiteDatabase} db
 * @param {Array<Object>} value - latest result of getAssignmentsApi
 */
export async function cleanupWorkOrderSqlite(db, value) {
  try {
    const workOrderIds = (value ?? []).map((item) => item.assignment.id);

    if (!workOrderIds.length) {
      await db.runAsync("DELETE FROM assignment");
      return;
    }

    const placeholders = workOrderIds.map(() => "?").join(", ");
    await db.runAsync(
      `DELETE FROM assignment WHERE id NOT IN (${placeholders})`,
      workOrderIds,
    );
  } catch (error) {
    console.log("Clean up work orders failed:", error);
  }
}
