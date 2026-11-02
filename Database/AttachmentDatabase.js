/**
 * Attachments: photos and documents linked to a work order.
 *
 * Files are stored on the device (file `uri`) and tracked in the local
 * `attachment` table with a `syncStatus`:
 *   "No"        - added on the device, not submitted yet
 *   "Pending"   - submitted but waiting for internet (retried on next sync)
 *   "Uploading" - upload in progress
 *   "Yes"       - uploaded (or downloaded from the server)
 * Uploads store the file as base64 in the Realtime Database under
 * /ATTACHMENTS/{assignment_ref_id}/{fileName}.
 */

import axios from "axios";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";

import { environment } from "../Config";
import { safeColumn, safeColumnsFrom } from "./SqlSafety";

//---------------API Functions---------------//

/**
 * Replaces characters Firebase doesn't allow in keys with "_" so a file
 * name can be used as a database key / local file name.
 *
 * @param {*} value - usually a file name
 * @returns {string}
 */
// Firebase keys can't contain ".", "#", "$", "/", "[", "]".
const sanitizeKey = (value) => String(value).replace(/[.#$/[\]]/g, "_");

/**
 * Uploads one attachment (photo or document) to Firebase.
 *
 * How it works:
 * 1. Photos are resized to 1600px wide and re-compressed as JPEG (quality
 *    0.6) to keep the upload small; documents are read as-is.
 * 2. The file content is base64-encoded.
 * 3. The metadata + base64 are PUT to
 *    /ATTACHMENTS/{assignment_ref_id}/{sanitized fileName}.json.
 * Errors are NOT caught here; the public wrappers below handle them.
 *
 * @param {string} token - Firebase ID token
 * @param {Object} data - attachment row (uri, fileName, type, label, ...)
 * @returns {Promise<{status: number}>} { status: 200 } on success
 */
async function putAttachment(token, data) {
  // Photos are captured/picked at full quality (several MB), which after
  // base64 inflation (~33%) can make the write body large enough that
  // Firebase's REST API rejects it with a generic "Invalid data; couldn't
  // parse JSON" error. Downscale + recompress photos before upload — the
  // full-quality original stays on-device untouched, only the remote copy
  // is smaller. Documents (PDFs) can't be resized this way, so they still
  // read their raw bytes.
  let base64;
  if (data.type === "Photo") {
    const resized = await ImageManipulator.manipulateAsync(
      data.uri,
      [{ resize: { width: 1600 } }],
      {
        compress: 0.6,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    );
    base64 = resized.base64;
  } else {
    base64 = await FileSystem.readAsStringAsync(data.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  const key = sanitizeKey(data.fileName);

  await axios.put(
    environment.apiUrl + `/ATTACHMENTS/${data.assignment_ref_id}/${key}.json`,
    {
      fileName: data.fileName,
      label: data.label,
      label_id: data.label_id,
      type: data.type,
      assignment_id: data.assignment_id,
      assignment_ref_id: data.assignment_ref_id,
      mimeType: data.mimeType,
      date: data.date,
      base64,
    },
    { params: { auth: token } },
  );

  return { status: 200 };
}

/**
 * Uploads a photo. Wrapper around putAttachment that turns errors into
 * { status: 500 } instead of throwing.
 *
 * @param {string} token - Firebase ID token
 * @param {Object} photo - attachment row
 * @returns {Promise<{status: number}>} 200 on success, 500 on failure
 */
export async function postPhotosApi(token, photo) {
  try {
    return await putAttachment(token, photo);
  } catch (error) {
    console.log(
      "Upload photo error:",
      error.response?.data?.error || error.message,
    );
    return { status: 500 };
  }
}

/**
 * Uploads a document (e.g. PDF). Same as postPhotosApi but for documents.
 *
 * @param {string} token - Firebase ID token
 * @param {Object} document - attachment row
 * @returns {Promise<{status: number}>} 200 on success, 500 on failure
 */
export async function postDocumentsApi(token, document) {
  try {
    return await putAttachment(token, document);
  } catch (error) {
    console.log(
      "Upload document error:",
      error.response?.data?.error || error.message,
    );
    return { status: 500 };
  }
}

/**
 * @param {string} token - Firebase ID token
 * @param {number|string} id - work order reference id
 * @returns {Promise<Array<Object>>} attachment rows (with local `uri` and
 *   syncStatus "Yes"); items without a file name/content, or that fail to
 *   save to disk, are skipped. Returns [] on error.
 */
// Downloads attachment metadata + content for one assignment and writes each
// file's base64 content to local storage so it has a usable `uri`, matching
// the shape of a freshly-picked photo/document (ready for insertAttachmentSqlite).
export async function getAttachmentsApi(token, id) {
  try {
    const response = await axios.get(
      environment.apiUrl + `/ATTACHMENTS/${id}.json`,
      { params: { auth: token } },
    );
    const results = response.data;
    if (!results) return [];

    const attachments = [];
    for (const item of Object.values(results)) {
      if (!item?.fileName || !item?.base64) continue;

      const uri = `${FileSystem.documentDirectory}${sanitizeKey(item.fileName)}`;
      try {
        await FileSystem.writeAsStringAsync(uri, item.base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch (writeError) {
        console.log("Failed writing attachment to disk:", writeError);
        continue;
      }

      attachments.push({
        fileName: item.fileName,
        label: item.label,
        label_id: item.label_id,
        type: item.type,
        assignment_id: item.assignment_id,
        assignment_ref_id: item.assignment_ref_id,
        mimeType: item.mimeType,
        date: item.date,
        uri,
        syncStatus: "Yes",
      });
    }
    return attachments;
  } catch (error) {
    console.log(
      "Get attachments API error:",
      error.response?.data ?? error.message,
    );
    return [];
  }
}

//---------------SQLITE Functions---------------//

/**
 * Inserts a single attachment row (only the non-empty columns).
 * Throws on error; used by insertAttachmentSqlite.
 *
 * @param {SQLiteDatabase} db
 * @param {Object} obj - attachment fields
 */
async function insertOneAttachment(db, obj) {
  const columns = safeColumnsFrom(obj);
  const placeholders = columns.map(() => "?").join(", ");
  const values = columns.map((key) => obj[key]);

  await db.runAsync(
    `INSERT INTO attachment (${columns.join(", ")}) VALUES (${placeholders})`,
    values,
  );
}

/**
 * Inserts one attachment or a list of attachments into SQLite.
 *
 * @param {SQLiteDatabase} db
 * @param {Object|Array<Object>} data - a row or array of rows
 */
export async function insertAttachmentSqlite(db, data) {
  try {
    const rows = Array.isArray(data) ? data : [data];
    for (const row of rows) {
      await insertOneAttachment(db, row);
    }
  } catch (error) {
    console.log("Insert attachment failed:", error);
  }
}

/**
 * Reads attachments matching one or two column conditions.
 *
 * Example: selectAttachmentSqlite(db, "assignment_id", 12, "type", "Photo").
 * The second condition is only applied if both key2 and value2 are given.
 * Column names are checked with safeColumn (SqlSafety.js); an invalid
 * name is logged and the query is not run.
 *
 * @param {SQLiteDatabase} db
 * @param {string} key1 - first column to filter on
 * @param {*} value1
 * @param {string} [key2] - optional second column
 * @param {*} [value2]
 * @returns {Promise<Array<Object>|undefined>}
 */
export async function selectAttachmentSqlite(db, key1, value1, key2, value2) {
  try {
    let query = `SELECT * FROM attachment WHERE ${safeColumn(key1)} = ?`;
    const values = [value1];

    if (key2 && value2) {
      query += ` AND ${safeColumn(key2)} = ?`;
      values.push(value2);
    }

    return await db.getAllAsync(query, values);
  } catch (error) {
    console.error("Select attachments failed:", error);
  }
}

/**
 * Updates an attachment identified by its file name.
 *
 * How it works: every non-empty field on `data` (except `id`) is written;
 * the row is matched by `data.fileName`. Commonly used to flip
 * syncStatus to "Yes" after a successful upload, or to change the label.
 *
 * @param {SQLiteDatabase} db
 * @param {Object} data - fields to change, must include fileName
 */
export async function updateAttachmentSqlite(db, data) {
  try {
    const fieldsToUpdate = [];
    const values = [];

    for (const key of safeColumnsFrom(data, ["id"])) {
      fieldsToUpdate.push(`${key} = ?`);
      values.push(data[key]);
    }
    await db.runAsync(
      `UPDATE attachment SET ${fieldsToUpdate.join(", ")} WHERE fileName = ?`,
      [...values, data.fileName],
    );
  } catch (error) {
    console.log("Update attachment failed:", error);
  }
}

/**
 * Deletes an attachment row by id (the file on disk is not removed here).
 *
 * @param {SQLiteDatabase} db
 * @param {number} id - attachment row id
 */
export async function deleteAttachmentSqlite(db, id) {
  try {
    await db.runAsync("DELETE FROM attachment WHERE id = ?", [id]);
  } catch (error) {
    console.log("Delete attachment failed:", error);
  }
}

/**
 * Deletes attachments belonging to work orders that no longer exist on the
 * server (or all attachments if the server returned none).
 *
 * @param {SQLiteDatabase} db
 * @param {Array<Object>} value - latest result of getAssignmentsApi
 */
export async function cleanupAttachmentSqlite(db, value) {
  try {
    const workOrderIds = (value ?? []).map((item) => item.assignment.id);

    if (!workOrderIds.length) {
      await db.runAsync("DELETE FROM attachment");
      return;
    }

    const placeholders = workOrderIds.map(() => "?").join(", ");
    await db.runAsync(
      `DELETE FROM attachment WHERE assignment_id NOT IN (${placeholders})`,
      workOrderIds,
    );
  } catch (error) {
    console.log("Clean up attachments failed:", error);
  }
}
