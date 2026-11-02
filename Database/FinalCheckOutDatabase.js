/**
 * Final check-out: the completion checklist and sign-off filled in when a
 * job is finished.
 *
 * Locally stored in the `completion` table. On the server the checklist
 * goes to /CHECKLISTS/{assignment_id} and the completion record (with the
 * closing comment) goes to /COMPLETIONS/{assignment_id}.
 */

import axios from "axios";
import { getUnixTime } from "date-fns";
import { environment } from "../Config";
import { safeColumn, safeColumnsFrom } from "./SqlSafety";

//---------------API Functions---------------//

/**
 * Uploads the completion checklist (answers, notes, manager name and
 * signature) for one job.
 *
 * How it works: PUT to /CHECKLISTS/{assignment_id}.json. The local column
 * `signature_base64` is sent as `manager_signature`.
 *
 * @param {string} token - Firebase ID token
 * @param {Object} data - completion row from SQLite
 * @returns {Promise<boolean>} true on success
 */
export async function postFinalCheckListApi(token, data) {
  try {
    await axios.put(
      environment.apiUrl + `/CHECKLISTS/${data.assignment_id}.json`,
      {
        service_perf: data.service_perf,
        desc_service_perf: data.desc_service_perf,
        material_inst: data.material_inst,
        desc_material_inst: data.desc_material_inst,
        assignment_100: data.assignment_100,
        walkThrough_comp: data.walkThrough_comp,
        return_needed: data.return_needed,
        desc_return_needed: data.desc_return_needed,
        desc_misc_notes: data.desc_misc_notes,
        manager_name: data.manager_name,
        manager_signature: data.signature_base64,
        assignment_id: data.assignment_id,
        modified_date: data.modified_date,
      },
      { params: { auth: token } },
    );
    return true;
  } catch (error) {
    console.log(
      "Post final checklist API error:",
      error.response?.data?.error?.message || error.message,
    );
    return false;
  }
}

/**
 * Downloads the completion checklist for one job.
 *
 * How it works: GET /CHECKLISTS/{assignment_id}.json and map it back to the
 * local column names (manager_signature -> signature_base64). Marked
 * syncStatus "Yes" because it came from the server.
 *
 * @param {string} token - Firebase ID token
 * @param {number|string} assignment_id - work order id
 * @returns {Promise<Object|null>} completion row, or null if none / error
 */
export async function getFinalCheckoutApi(token, assignment_id) {
  try {
    const response = await axios.get(
      environment.apiUrl + `/CHECKLISTS/${assignment_id}.json`,
      { params: { auth: token } },
    );
    const data = response.data;
    if (!data) return null;

    return {
      assignment_id: data.assignment_id ?? assignment_id,
      service_perf: data.service_perf,
      desc_service_perf: data.desc_service_perf,
      material_inst: data.material_inst,
      desc_material_inst: data.desc_material_inst,
      assignment_100: data.assignment_100,
      walkThrough_comp: data.walkThrough_comp,
      return_needed: data.return_needed,
      desc_return_needed: data.desc_return_needed,
      desc_misc_notes: data.desc_misc_notes,
      manager_name: data.manager_name,
      signature_base64: data.manager_signature,
      modified_date: data.modified_date,
      syncStatus: "Yes",
    };
  } catch (error) {
    console.log(
      "getFinalCheckoutApi Error:",
      error.response?.data ?? error.message,
    );
    return null;
  }
}

/**
 * Marks a job as completed on the server.
 *
 * How it works: PUT { comment, assignment_id, completed_date: now } to
 * /COMPLETIONS/{assignment_id}.json.
 *
 * @param {string} token - Firebase ID token
 * @param {string} comment - closing comment from the technician
 * @param {number|string} assignment_id - work order id
 * @returns {Promise<boolean>} true on success
 */
export async function postFinalCheckoutApi(token, comment, assignment_id) {
  try {
    await axios.put(
      environment.apiUrl + `/COMPLETIONS/${assignment_id}.json`,
      {
        comment,
        assignment_id,
        completed_date: getUnixTime(new Date()),
      },
      { params: { auth: token } },
    );
    return true;
  } catch (error) {
    console.log(
      "Post final checkout API error:",
      error.response?.data?.error?.message || error.message,
    );
    return false;
  }
}

//---------------SQLITE Functions---------------//

/**
 * Inserts a completion row (non-empty fields only) into SQLite.
 *
 * @param {SQLiteDatabase} db
 * @param {Object} data - completion fields
 */
export async function insertFinalCheckOutSqlite(db, data) {
  try {
    const columns = safeColumnsFrom(data);
    const placeholders = columns.map(() => "?").join(", ");
    const values = columns.map((key) => data[key]);

    await db.runAsync(
      `INSERT INTO completion (${columns.join(", ")}) VALUES (${placeholders})`,
      values,
    );
  } catch (error) {
    console.log("Insert final checkout failed:", error);
  }
}

/**
 * Reads completion rows where one column equals a value.
 * Column names are checked with safeColumn (SqlSafety.js); an invalid
 * name is logged and the query is not run.
 *
 * @param {SQLiteDatabase} db
 * @param {string} key - column (e.g. "assignment_id")
 * @param {*} value
 * @returns {Promise<Array<Object>|undefined>}
 */
export async function selectFinalCheckOutSqlite(db, key, value) {
  try {
    return await db.getAllAsync(`SELECT * FROM completion WHERE ${safeColumn(key)} = ?`, [
      value,
    ]);
  } catch (error) {
    console.log("Select final checkout failed:", error);
  }
}

/**
 * Runs: UPDATE completion SET key1 = value1 WHERE key2 = value2.
 * Column names are checked with safeColumn (SqlSafety.js); an invalid
 * name is logged and the query is not run.
 *
 * @param {SQLiteDatabase} db
 * @param {string} key1 - column to change
 * @param {*} value1 - new value
 * @param {string} key2 - column to match
 * @param {*} value2 - value to match
 */
export async function updateFinalCheckOutSqlite(
  db,
  key1,
  value1,
  key2,
  value2,
) {
  try {
    await db.runAsync(`UPDATE completion SET ${safeColumn(key1)} = ? WHERE ${safeColumn(key2)} = ?`, [
      value1,
      value2,
    ]);
  } catch (error) {
    console.log("Update final checkout failed:", error);
  }
}

/**
 * Deletes the completion row(s) for one job.
 *
 * @param {SQLiteDatabase} db
 * @param {number} assignment_id - work order id
 */
export async function deleteFinalCheckOutSqlite(db, assignment_id) {
  try {
    await db.runAsync("DELETE FROM completion WHERE assignment_id = ?", [
      assignment_id,
    ]);
  } catch (error) {
    console.log("Delete final checkout failed:", error);
  }
}

/**
 * Deletes completion rows for work orders that no longer exist on the
 * server (or all rows if the server returned none).
 *
 * @param {SQLiteDatabase} db
 * @param {Array<Object>} value - latest result of getAssignmentsApi
 */
export async function cleanupFinalCheckOutSqlite(db, value) {
  try {
    const workOrderIds = (value ?? []).map((item) => item.assignment.id);

    if (!workOrderIds.length) {
      await db.runAsync("DELETE FROM completion");
      return;
    }

    const placeholders = workOrderIds.map(() => "?").join(", ");
    await db.runAsync(
      `DELETE FROM completion WHERE assignment_id NOT IN (${placeholders})`,
      workOrderIds,
    );
  } catch (error) {
    console.log("Clean up final checkout failed:", error);
  }
}
