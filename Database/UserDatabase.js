/**
 * User account functions.
 *
 * API functions call the Firebase Auth (Identity Toolkit) REST endpoints and
 * the Realtime Database; SQLite functions manage the local `user` table,
 * which stores the signed-in user's profile and tokens so the app can start
 * offline.
 */

import axios from "axios";
import { environment } from "../Config";

//---------------API Functions---------------//

/**
 * Signs a user in with email and password.
 *
 * How it works: POSTs to Identity Toolkit `accounts:signInWithPassword`.
 * Unlike most functions here it does NOT catch errors, so the caller (the
 * Login screen) can show the exact Firebase error (e.g. INVALID_PASSWORD).
 *
 * @param {{username: string, password: string}} data - login form values
 * @returns {Promise<Object>} Firebase response: idToken, refreshToken,
 *   localId (user id), email, expiresIn, displayName, registered, kind
 * @throws axios error if the credentials are wrong or the network fails
 */
export async function getLoginApi(data) {
  const response = await axios.post(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${environment.apikey}`,
    {
      email: data.username,
      password: data.password,
      returnSecureToken: true,
    },
  );
  return response.data;
}

/**
 * Looks up the signed-in user's profile from Firebase Auth.
 *
 * How it works: POSTs the ID token to `accounts:lookup`, takes the first
 * user returned and splits `displayName` on the first space into first and
 * last name.
 *
 * @param {{idToken: string}} data
 * @returns {Promise<{displayName: string, first_name: string,
 *   last_name: string, email: string, localId: string}|undefined>}
 */
export async function getUserProfileApi(data) {
  try {
    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${environment.apikey}`,
      { idToken: data.idToken },
    );
    const user = response.data.users?.[0];
    if (!user) return undefined;

    const displayName = user.displayName || "";
    const [first_name = "", ...rest] = displayName.split(" ");

    return {
      displayName,
      first_name,
      last_name: rest.join(" "),
      email: user.email,
      localId: user.localId,
    };
  } catch (error) {
    console.error(
      "getUserProfile Error:",
      error.response?.data?.error?.message || error.message,
    );
  }
}

/**
 * Updates the user's display name in Firebase Auth.
 *
 * How it works: POSTs to `accounts:update`. Firebase returns fresh tokens
 * after a profile update, so the new idToken/refreshToken are merged into
 * the returned object to be saved locally.
 *
 * @param {{idToken: string, displayName: string}} data - plus any other
 *   fields the caller wants passed through
 * @returns {Promise<Object|undefined>} `data` with updated tokens, or
 *   undefined on error
 */
export async function postUserApi(data) {
  try {
    const authResponse = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${environment.apikey}`,
      {
        idToken: data.idToken,
        displayName: data.displayName,
        returnSecureToken: true,
      },
    );
    const idToken = authResponse.data.idToken;
    const refreshToken = authResponse.data.refreshToken;

    return { ...data, idToken, refreshToken };
  } catch (error) {
    console.error(
      "postUserApi Error:",
      error.response?.data?.error?.message || error.message,
    );
  }
}

/**
 * Uploads the user's profile picture.
 *
 * How it works: PUT `{ base64, mimeType }` to `/AVATARS/{localId}.json`,
 * replacing any previous avatar.
 *
 * @param {string} idToken - Firebase ID token
 * @param {string} localId - Firebase user id
 * @param {string} base64 - image data (no `data:` prefix)
 * @param {string} mimeType - e.g. "image/jpeg"
 * @returns {Promise<boolean>} true on success
 */
// Avatar images are stored as a data URI (base64) directly in the
// Realtime Database rather than Firebase Storage, matching how attachment
// photos/signatures are handled elsewhere in this app.
export async function postUserAvatarApi(idToken, localId, base64, mimeType) {
  try {
    await axios.put(
      environment.apiUrl + `/AVATARS/${localId}.json`,
      { base64, mimeType },
      { params: { auth: idToken } },
    );
    return true;
  } catch (error) {
    console.log(
      "postUserAvatarApi Error:",
      error.response?.data ?? error.message,
    );
    return false;
  }
}

/**
 * Downloads the user's profile picture.
 *
 * How it works: GET `/AVATARS/{localId}.json` and turns the stored base64
 * into a `data:` URI that an <Image> can display directly.
 *
 * @param {string} idToken - Firebase ID token
 * @param {string} localId - Firebase user id
 * @returns {Promise<string|null>} data URI, or null if no avatar / error
 */
export async function getUserAvatarApi(idToken, localId) {
  try {
    const response = await axios.get(
      environment.apiUrl + `/AVATARS/${localId}.json`,
      { params: { auth: idToken } },
    );
    const data = response.data;
    if (!data?.base64) return null;
    return `data:${data.mimeType || "image/jpeg"};base64,${data.base64}`;
  } catch (error) {
    console.log(
      "getUserAvatarApi Error:",
      error.response?.data ?? error.message,
    );
    return null;
  }
}

/**
 * Starts an email address change.
 *
 * How it works: asks Firebase (`accounts:sendOobCode` with
 * VERIFY_AND_CHANGE_EMAIL) to send a verification link to the new address.
 * The email only changes after the user clicks that link.
 *
 * @param {string} idToken - Firebase ID token
 * @param {string} newEmail - the address to switch to
 * @returns {Promise<{success: boolean, errorCode?: string}>}
 *   errorCode is Firebase's error string (e.g. "EMAIL_EXISTS") on failure
 */
export async function requestEmailChangeApi(idToken, newEmail) {
  try {
    await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${environment.apikey}`,
      {
        requestType: "VERIFY_AND_CHANGE_EMAIL",
        idToken,
        newEmail,
      },
    );
    return { success: true };
  } catch (error) {
    const errorCode = error.response?.data?.error?.message;
    console.error("requestEmailChangeApi Error:", errorCode || error.message);
    return { success: false, errorCode };
  }
}

/**
 * Sends a "reset your password" email.
 *
 * How it works: `accounts:sendOobCode` with requestType PASSWORD_RESET.
 *
 * @param {string} email - account email
 * @returns {Promise<string>} a success message, or the error message
 *   (the caller shows whatever string comes back)
 */
export async function postRecoverPasswordAPI(email) {
  try {
    await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${environment.apikey}`,
      {
        requestType: "PASSWORD_RESET",
        email,
      },
    );
    return `A password reset link has been sent to ${email}.`;
  } catch (error) {
    const errorMessage =
      error.response?.data?.error?.message ||
      error.message ||
      "An unexpected error occurred.";
    console.error("postRecoverPasswordAPI Error:", errorMessage);
    return errorMessage;
  }
}

//---------------SQLITE Functions---------------//

/**
 * Saves (or replaces) a user row in the local `user` table.
 *
 * How it works: builds an INSERT from every non-empty field on `data`
 * (so the object keys must match table columns) and uses
 * `INSERT OR REPLACE`, keyed by localId.
 *
 * @param {SQLiteDatabase} db
 * @param {Object} data - user fields (localId required)
 */
export async function insertUserSqlite(db, data) {
  try {
    const columns = Object.keys(data).filter(
      (key) => data[key] !== undefined && data[key] !== null,
    );
    const placeholders = columns.map(() => "?").join(", ");
    const values = columns.map((key) => data[key]);

    await db.runAsync(
      `INSERT OR REPLACE INTO "user" (${columns.join(", ")}) VALUES (${placeholders})`,
      [...values],
    );
  } catch (error) {
    console.error("Insert User function failed:", error?.message);
  }
}

/**
 * Updates an existing user row.
 *
 * How it works: builds `UPDATE user SET a = ?, b = ? ...` from every
 * non-empty field on `data` except localId, which is used in the WHERE.
 *
 * @param {SQLiteDatabase} db
 * @param {Object} data - fields to change, must include localId
 */
export async function updateUserSqlite(db, data) {
  try {
    const fieldsToUpdate = [];
    const values = [];

    for (const [key, value] of Object.entries(data)) {
      if (key !== "localId" && value !== undefined && value !== null) {
        fieldsToUpdate.push(`${key} = ?`);
        values.push(value);
      }
    }
    await db.runAsync(
      `UPDATE user SET ${fieldsToUpdate.join(", ")} WHERE localId = ?`,
      [...values, data.localId],
    );
  } catch (error) {
    console.error("Update User function failed:", error);
  }
}

/**
 * Returns the user who logged in most recently (highest last_login).
 * Used at startup to restore the session without asking for a password.
 *
 * @param {SQLiteDatabase} db
 * @returns {Promise<Object|null>} the user row, or null
 */
export async function lastLoggedinUserSqlite(db) {
  try {
    return await db.getFirstAsync(
      "SELECT * FROM user ORDER BY last_login DESC LIMIT 1",
    );
  } catch (error) {
    console.error("Last logged in user function failed:", error);
    return null;
  }
}


/**
 * Finds a user by Firebase user id.
 *
 * @param {SQLiteDatabase} db
 * @param {string} data - the user's localId
 * @returns {Promise<Object|null|undefined>} the user row
 */
export async function selectUserSqlite(db, data) {
  try {
    return await db.getFirstAsync(
      "SELECT * FROM user WHERE localId = ?",
      [data],
    );
  } catch (error) {
    console.error("select user function failed:", error);
  }
}

/**
 * Finds a user by email address.
 *
 * @param {SQLiteDatabase} db
 * @param {string} email
 * @returns {Promise<Object|null|undefined>} the user row
 */
export async function selectUserByEmailSqlite(db, email) {
  try {
    return await db.getFirstAsync(
      "SELECT * FROM user WHERE email = ?",
      [email],
    );
  } catch (error) {
    console.error("select user by email function failed:", error);
  }
}
