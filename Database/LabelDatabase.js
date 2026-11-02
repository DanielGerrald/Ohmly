/**
 * Attachment labels (a.k.a. category types).
 *
 * Labels are the categories a technician can tag a document, photo or comment
 * with (e.g. "Before photo", "Invoice"). They are downloaded from Firebase
 * and cached in the local SQLite `category_type` table so they are available
 * offline.
 */

import axios from "axios";
import { environment } from "../Config";
import { safeColumn, safeColumnsFrom } from "./SqlSafety";

//---------------API Functions---------------//

/**
 * Downloads all attachment labels from Firebase.
 *
 * How it works: GET `/ATTACHMENT_TYPES.json` with the user's ID token.
 *
 * @param {string} idToken - Firebase ID token for the signed-in user
 * @returns {Promise<Object|undefined>} an object with `document_types`,
 *   `photo_types` and `comment_types` arrays, or undefined on error
 */
export async function getLabelsApi(idToken) {
  try {
    const response = await axios.get(
      environment.apiUrl + "/ATTACHMENT_TYPES.json",
      { params: { auth: idToken } },
    );
    return response.data || undefined;
  } catch (error) {
    console.error("getLabelsApi Error:", error.response?.data ?? error.message);
  }
}

/**
 * Inserts label rows into the `category_type` table one at a time.
 *
 * How it works: for each row it builds an INSERT using only the columns that
 * actually have a value, so missing fields don't overwrite table defaults.
 * `INSERT OR IGNORE` skips labels that already exist. Errors on a single row
 * are logged and the loop continues with the next row.
 *
 * @param {SQLiteDatabase} db - open expo-sqlite database
 * @param {Array<Object>} rows - label objects to insert
 */
async function insertCategoryTypeRows(db, rows) {
  for (const row of rows) {
    const columns = safeColumnsFrom(row);
    if (columns.length === 0) continue;

    const placeholders = columns.map(() => "?").join(", ");
    const values = columns.map((key) => row[key]);

    try {
      await db.runAsync(
        `INSERT OR IGNORE INTO category_type (${columns.join(", ")}) VALUES (${placeholders})`,
        values,
      );
    } catch (error) {
      console.error("Error inserting category type row:", error);
    }
  }
}

/**
 * Turns a list of labels into an object keyed by `type_id`, tagging each
 * label with which group it belongs to.
 *
 * @param {Array|Object|undefined} value - labels as returned by Firebase
 *   (may be an array, a sparse-array object, or missing)
 * @param {string} labelType - group name, e.g. "Photo Label"
 * @returns {Object<string, Object>} map of type_id -> label (+ type_group)
 */
function reduceLabelArray(value, labelType) {
  // Firebase RTDB omits empty arrays and returns sparse arrays as objects,
  // so `value` may be undefined or a plain object here.
  const arr = Array.isArray(value) ? value : Object.values(value ?? {});
  return arr.reduce((accumulator, item) => {
    accumulator[item.type_id] = { ...item, type_group: labelType };
    return accumulator;
  }, {});
}

//---------------SQLITE Functions---------------//

/**
 * Saves the labels downloaded from Firebase into SQLite.
 *
 * How it works: normalizes the document, photo and comment label lists,
 * merges them into a single set (de-duplicated by type_id), then inserts
 * them with insertCategoryTypeRows.
 *
 * @param {SQLiteDatabase} db - open expo-sqlite database
 * @param {Object} labels - result of getLabelsApi
 */
export async function insertCategoryLabelSqlite(db, labels) {
  if (!labels) return;

  const documentTypes = reduceLabelArray(labels.document_types, "Document Label");
  const photoTypes = reduceLabelArray(labels.photo_types, "Photo Label");
  const commentTypes = reduceLabelArray(labels.comment_types, "Comment Label");

  const merged = { ...documentTypes, ...photoTypes, ...commentTypes };
  await insertCategoryTypeRows(db, Object.values(merged));
}

/**
 * Reads labels from SQLite filtered by one column.
 *
 * Example: selectCategoryLabelSqlite(db, "type_group", "Photo Label").
 * Column names are checked with safeColumn (SqlSafety.js); an invalid
 * name is logged and the query is not run.
 *
 * @param {SQLiteDatabase} db - open expo-sqlite database
 * @param {string} key - column name to filter on
 * @param {*} value - value that column must equal
 * @returns {Promise<Array<Object>|undefined>} matching label rows
 */
export async function selectCategoryLabelSqlite(db, key, value) {
  try {
    return await db.getAllAsync(
      `SELECT * FROM category_type WHERE ${safeColumn(key)} = ?`,
      [value],
    );
  } catch (error) {
    console.error("Select category labels failed:", error);
  }
}
