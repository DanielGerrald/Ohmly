/**
 * Local SQLite schema setup.
 *
 * Ohmly is offline-first: everything the technician sees is read from a local
 * SQLite database, and changes are written there first and synced to Firebase
 * later. This file creates that database's tables.
 */

import { environment } from "../Config";

/**
 * Current schema version. Bump this whenever a table definition changes; on
 * next launch every device will drop and rebuild its local tables.
 */
const DATABASE_VERSION = 1;

/**
 * Every table (current and legacy) that is dropped before a rebuild. Legacy
 * names are kept so old installs are cleaned up too.
 */
const TABLES_TO_DROP = [
  "user",
  "workorder",
  "assignment",
  "contact",
  "category_type",
  "attachment",
  "checkinout",
  "visit",
  "final_checkout",
  "completion",
];

/**
 * Makes sure the local SQLite schema matches DATABASE_VERSION.
 *
 * How it works:
 * 1. Reads SQLite's built-in `PRAGMA user_version` (0 on a brand new DB).
 * 2. If it already equals DATABASE_VERSION, nothing is done.
 * 3. Otherwise every table in TABLES_TO_DROP is dropped and the current
 *    tables are created: user, assignment (work orders), contact,
 *    category_type (labels), attachment (photos/files), visit
 *    (check-in/out log) and completion (final check-out form).
 * 4. Turns on WAL journaling and foreign keys, then stores the new version
 *    number so the rebuild doesn't run again.
 *
 * Because the rebuild drops tables, any data not yet synced is lost when
 * the version changes; the data is re-downloaded from Firebase afterwards.
 * Passed to <SQLiteProvider onInit={...}> in App.js.
 *
 * @param {SQLiteDatabase} db - open expo-sqlite database
 */
export default async function setupDatabase(db) {
  try {
    let { user_version: currentDbVersion } = await db.getFirstAsync(
      "PRAGMA user_version",
    );
    currentDbVersion = parseInt(currentDbVersion, 10);

    if (currentDbVersion === DATABASE_VERSION) {
      console.log("SQLite database ready:", environment.icon, environment.envName);
      return;
    }

    console.log(`Database schema outdated (${currentDbVersion} -> ${DATABASE_VERSION}). Rebuilding...`);

    try {
      for (const table of TABLES_TO_DROP) {
        await db.execAsync(`DROP TABLE IF EXISTS ${table}`);
      }

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS user
        (
          localId           TEXT PRIMARY KEY,
          vendor_id         INTEGER,
          company_name      TEXT,
          first_name        TEXT,
          last_name         TEXT,
          email             TEXT,
          phone_nbr         TEXT,
          mobile_nbr        TEXT,
          fax_nbr           TEXT,
          idToken           TEXT,
          expiresIn         INTEGER,
          notify_sms        INTEGER DEFAULT (0),
          notify_email      INTEGER DEFAULT (0),
          avatar            BLOB,
          last_login        INTEGER,
          logged_in         INTEGER DEFAULT (0),
          kind              TEXT,
          displayName       TEXT,
          registered        TEXT,
          refreshToken      TEXT,
          uuid              TEXT
        )
      `);

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS assignment
        (
          id                  INTEGER PRIMARY KEY,
          addr_1              TEXT,
          addr_2              TEXT,
          addr_3              TEXT,
          category            TEXT,
          checked_in          INTEGER,
          city                TEXT,
          completed           INTEGER DEFAULT 0,
          vendor_id           INTEGER,
          vendor_name         TEXT,
          vendor_requirements TEXT,
          created_date        TEXT,
          desc_of_work        TEXT,
          due_date            TEXT,
          entered_date        TEXT,
          reference_code      TEXT,
          site_id             INTEGER,
          latitude            NUMERIC,
          location_name       TEXT,
          longitude           NUMERIC,
          name                TEXT,
          phone_nbr           TEXT,
          scheduled_date      INTEGER,
          start_date          TEXT,
          state               TEXT,
          store_nbr           TEXT,
          type                TEXT,
          localId             INTEGER,
          status_label        TEXT,
          zip                 INTEGER,
          company_name        TEXT
        )
      `);

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS contact
        (
          assignment_id                   INTEGER PRIMARY KEY,
          vendor_contact_id               TEXT,
          vendor_contact_first_name       TEXT,
          vendor_contact_last_name        TEXT,
          vendor_contact_phone_nbr        TEXT,
          vendor_contact_phone_nbr_ext    TEXT,
          vendor_contact_fax_nbr          TEXT,
          vendor_contact_mobile_nbr       TEXT,
          vendor_contact_email            TEXT,
          vendor_contact_is_employee      TEXT,
          vendor_contact_after_hours_nbr  TEXT,
          vendor_contact_contact_type     TEXT,
          site_contact_id                 TEXT,
          site_contact_first_name         TEXT,
          site_contact_last_name          TEXT,
          site_contact_phone_nbr          TEXT,
          site_contact_phone_nbr_ext      TEXT,
          site_contact_fax_nbr            TEXT,
          site_contact_mobile_nbr         TEXT,
          site_contact_email              TEXT,
          site_contact_is_employee        TEXT,
          site_contact_after_hours_nbr    TEXT,
          site_contact_contact_type       TEXT,
          account_manager_id              TEXT,
          account_manager_first_name      TEXT,
          account_manager_last_name       TEXT,
          account_manager_phone_nbr       TEXT,
          account_manager_phone_nbr_ext   TEXT,
          account_manager_fax_nbr         TEXT,
          account_manager_mobile_nbr      TEXT,
          account_manager_email           TEXT,
          account_manager_is_employee     TEXT,
          account_manager_after_hours_nbr TEXT
        )
      `);

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS category_type
        (
          type_id             INTEGER PRIMARY KEY,
          type_category_id    TEXT,
          type_label          TEXT,
          type_category_label TEXT,
          type_group          TEXT
        )
      `);

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS attachment
        (
          id                INTEGER PRIMARY KEY NOT NULL,
          date              INTEGER,
          fileName          TEXT,
          label             TEXT,
          label_id          TEXT,
          uri               BLOB,
          type              TEXT,
          assignment_id     INTEGER,
          assignment_ref_id INTEGER,
          base64            BLOB,
          location          TEXT,
          mimeType          TEXT,
          syncStatus        TEXT
        )
      `);

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS visit
        (
          id                INTEGER PRIMARY KEY NOT NULL,
          crew_member_id    INTEGER,
          assignment_id     INTEGER,
          comment           TEXT,
          visit_date        INTEGER,
          departing         INTEGER,
          work_completed    INTEGER,
          syncStatus        TEXT
        )
      `);

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS completion
        (
          id                          INTEGER PRIMARY KEY,
          service_perf                TEXT,
          desc_service_perf           TEXT,
          material_inst               TEXT,
          desc_material_inst          TEXT,
          assignment_100              TEXT,
          walkThrough_comp            TEXT,
          return_needed               TEXT,
          desc_return_needed          TEXT,
          desc_misc_notes             TEXT,
          manager_name                TEXT,
          signature_base64            BLOB,
          signature_size              INTEGER,
          signature_md5               INTEGER,
          signature_modification_time INTEGER,
          assignment_id               INTEGER,
          modified_date               INTEGER,
          syncStatus                  TEXT
        )
      `);

      console.log("Database schema rebuilt successfully.");
    } catch (error) {
      console.error("Database schema rebuild failed:", error);
      throw error;
    }

    await db.execAsync("PRAGMA journal_mode = WAL");
    await db.execAsync("PRAGMA foreign_keys = ON");
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
    console.log(`Database ready at version ${DATABASE_VERSION}:`, environment.icon, environment.envName);
  } catch (error) {
    console.error("Error setting up database:", error);
  }
}
