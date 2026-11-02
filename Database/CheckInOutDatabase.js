/**
 * Check-in / check-out ("visits").
 *
 * Each time a technician arrives at or leaves a site, a visit record is
 * saved locally in the `visit` table and synced to Firebase under
 * /VISITS/{assignment_id}/{visit_date}. `departing` = 0 means check-in,
 * 1 means check-out.
 */

import axios from "axios";
import { getUnixTime } from "date-fns";
import { environment } from "../Config";
import { safeColumn, safeColumnsFrom, safeSortOrder } from "./SqlSafety";

//---------------API Functions---------------//

/**
 * Downloads every visit for one work order.
 *
 * How it works: GET `/VISITS/{id}.json`, converts the object to an array
 * and uses `visit_date` (unix seconds) as the record id, which is how
 * visits are keyed on the server.
 *
 * @param {string} token - Firebase ID token
 * @param {number|string} id - work order id
 * @returns {Promise<Array<Object>>} visits, or [] on error
 */
export async function getCheckInOutApi(token, id) {
  try {
    const response = await axios.get(
      environment.apiUrl + `/VISITS/${id}.json`,
      { params: { auth: token } },
    );
    const results = response.data;
    if (!results) return [];
    return Object.values(results).map((visit) => ({
      ...visit,
      id: visit.visit_date,
    }));
  } catch (error) {
    console.log("Get check-in/out API call failed:", error);
    return [];
  }
}

/**
 * Uploads one check-in or check-out.
 *
 * How it works: PUT to /VISITS/{assignment_id}/{visit_date}.json. Because
 * the key is the timestamp, re-sending the same visit just overwrites it
 * (safe to retry).
 *
 * @param {Object} data - visit row (assignment_id, visit_date, departing,
 *   comment, crew_member_id)
 * @param {string} token - Firebase ID token
 * @returns {Promise<boolean>} true on success
 */
export async function postCheckInOutApi(data, token) {
  try {
    await axios.put(
      environment.apiUrl +
        `/VISITS/${data.assignment_id}/${data.visit_date}.json`,
      {
        comment: data.comment,
        departing: data.departing,
        crew_member_id: data.crew_member_id,
        assignment_id: data.assignment_id,
        visit_date: data.visit_date,
      },
      { params: { auth: token } },
    );
    return true;
  } catch (error) {
    console.log(
      "Post check-in/out API error:",
      error.response?.data?.error || error.message,
    );
    return false;
  }
}

//---------------SQLITE Functions---------------//

/**
 * Saves a visit to the local `visit` table.
 *
 * How it works: if no visit_date is set, the current time (unix seconds) is
 * used. Then the non-empty fields are upserted with INSERT OR REPLACE.
 *
 * @param {SQLiteDatabase} db
 * @param {Object} data - visit fields
 */
export async function insertCheckInOutSqlite(db, data) {
  try {
    if (data.visit_date == null || data.visit_date === "") {
      data = { ...data, visit_date: getUnixTime(new Date()) };
    }

    const columns = safeColumnsFrom(data);
    const placeholders = columns.map(() => "?").join(", ");
    const values = columns.map((key) => data[key]);

    await db.runAsync(
      `INSERT OR REPLACE INTO visit (${columns.join(", ")}) VALUES (${placeholders})`,
      values,
    );
  } catch (error) {
    console.log("Insert check-in/out failed:", error);
  }
}

/**
 * Reads visits where one column equals a value, sorted.
 *
 * `key` and `orderBy` are checked with safeColumn and `order` with
 * safeSortOrder (SqlSafety.js); invalid values are logged and [] is returned.
 *
 * @param {SQLiteDatabase} db
 * @param {string} key - column to filter on (e.g. "assignment_id")
 * @param {*} value - value to match
 * @param {string} [orderBy="id"] - column to sort by
 * @param {"ASC"|"DESC"} [order="ASC"] - sort direction
 * @returns {Promise<Array<Object>>} visits, or [] on error
 */
export async function selectCheckInOutSqlite(
  db,
  key,
  value,
  orderBy = "id",
  order = "ASC",
) {
  try {
    return await db.getAllAsync(
      `SELECT * FROM visit WHERE ${safeColumn(key)} = ? ORDER BY ${safeColumn(orderBy)} ${safeSortOrder(order)}`,
      [value],
    );
  } catch (error) {
    console.log("Select check-in/out failed:", error);
    return [];
  }
}

/**
 * Removes local copies of a visit that the server already has.
 *
 * When a locally created visit is later downloaded from the server it may
 * come back with a different id. This deletes any other row with the same
 * work order, timestamp and direction (check-in vs check-out) but a
 * different id, so the visit isn't shown twice. Does nothing if the server
 * record is missing required fields.
 *
 * @param {SQLiteDatabase} db
 * @param {Object} serverRecord - visit as returned by getCheckInOutApi
 */
export async function deleteCheckInOutDuplicatesSqlite(db, serverRecord) {
  if (
    serverRecord.id == null ||
    serverRecord.visit_date == null ||
    serverRecord.assignment_id == null
  ) {
    return;
  }

  try {
    await db.runAsync(
      `DELETE FROM visit
       WHERE assignment_id = ?
         AND visit_date = ?
         AND departing = ?
         AND id != ?`,
      [
        serverRecord.assignment_id,
        serverRecord.visit_date,
        serverRecord.departing,
        serverRecord.id,
      ],
    );
  } catch (error) {
    console.log("Delete duplicate check-in/out failed:", error);
  }
}

/**
 * Sets the sync status of a visit (e.g. "Yes" after upload).
 *
 * @param {SQLiteDatabase} db
 * @param {string} value - new syncStatus
 * @param {number} id - visit id
 */
export async function updateCheckInOutSqlite(db, value, id) {
  try {
    await db.runAsync("UPDATE visit SET syncStatus = ? WHERE id = ?", [
      value,
      id,
    ]);
  } catch (error) {
    console.log("Update check-in/out failed:", error);
  }
}

/**
 * Deletes visits for work orders that no longer exist on the server
 * (or all visits if the server returned none).
 *
 * @param {SQLiteDatabase} db
 * @param {Array<Object>} value - latest result of getAssignmentsApi
 */
export async function cleanupCheckInOutSqlite(db, value) {
  try {
    const workOrderIds = (value ?? []).map((item) => item.assignment.id);

    if (!workOrderIds.length) {
      await db.runAsync("DELETE FROM visit");
      return;
    }

    const placeholders = workOrderIds.map(() => "?").join(", ");
    await db.runAsync(
      `DELETE FROM visit WHERE assignment_id NOT IN (${placeholders})`,
      workOrderIds,
    );
  } catch (error) {
    console.log("Clean up check-in/out failed:", error);
  }
}
