/**
 * Offline password check.
 *
 * Offline login can't ask Firebase whether a password is right, so after
 * every successful online login we save a *hash* of the password on the
 * device (never the password itself). Offline login then re-hashes what
 * the user typed and compares.
 *
 * The hash is PBKDF2-HMAC-SHA256 with a per-save random salt, computed in
 * pure JavaScript (@noble/hashes) so it ships with OTA updates and needs no
 * native module. The iteration count is stored with each record, so it can
 * be raised later without breaking credentials that are already saved.
 *
 * Records are stored in AsyncStorage under "offlineCredential:<localId>".
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { pbkdf2Async } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";

const KEY_PREFIX = "offlineCredential:";

/**
 * PBKDF2 rounds for new records. Higher is slower to brute-force but also
 * slower to log in; this runs in JavaScript on the phone, so it is kept
 * lower than server-side recommendations.
 */
const ITERATIONS = 50000;

/** Length of the derived hash in bytes. */
const KEY_LENGTH = 32;

/**
 * Builds the AsyncStorage key for a user.
 *
 * @param {string} localId - Firebase user id
 * @returns {string}
 */
function storageKey(localId) {
  return KEY_PREFIX + localId;
}

/**
 * Creates a 16-byte salt.
 *
 * Uses crypto.getRandomValues when the runtime provides it. Otherwise it
 * hashes the user id, the time and Math.random() together. A salt only
 * needs to be unique, not secret, so this fallback is fine for that job.
 *
 * @param {string} localId - Firebase user id
 * @returns {Uint8Array}
 */
function makeSalt(localId) {
  const salt = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(salt);
    return salt;
  }
  const seed = [localId, Date.now(), Math.random(), Math.random()].join(":");
  return sha256(utf8ToBytes(seed)).slice(0, 16);
}

/**
 * Hashes a password with PBKDF2-HMAC-SHA256. Runs in small chunks
 * (asyncTick) so the UI stays responsive while it works.
 *
 * @param {string} password
 * @param {Uint8Array} salt
 * @param {number} iterations
 * @returns {Promise<Uint8Array>}
 */
function derive(password, salt, iterations) {
  return pbkdf2Async(sha256, utf8ToBytes(password), salt, {
    c: iterations,
    dkLen: KEY_LENGTH,
    asyncTick: 10,
  });
}

/**
 * Compares two byte arrays in constant time, so how long the check takes
 * doesn't reveal how many leading bytes matched.
 *
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @returns {boolean}
 */
function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Saves the hash of a password the user just used to log in online.
 * Overwrites any earlier record, so a changed password takes effect for
 * offline login after the next online login.
 *
 * @param {string} localId - Firebase user id
 * @param {string} password - the password Firebase just accepted
 * @returns {Promise<void>}
 */
export async function saveOfflineCredential(localId, password) {
  if (!localId || !password) return;
  const salt = makeSalt(localId);
  const hash = await derive(password, salt, ITERATIONS);
  await AsyncStorage.setItem(
    storageKey(localId),
    JSON.stringify({
      v: 1,
      iterations: ITERATIONS,
      salt: bytesToHex(salt),
      hash: bytesToHex(hash),
    }),
  );
}

/**
 * Checks a password typed during offline login.
 *
 * @param {string} localId - Firebase user id (looked up by email in SQLite)
 * @param {string} password - what the user typed
 * @returns {Promise<"ok"|"mismatch"|"missing">}
 *   "ok" if it matches the saved hash, "mismatch" if it doesn't, and
 *   "missing" if no hash has been saved for this user yet (they haven't
 *   logged in online since this check was added) or it can't be read.
 */
export async function verifyOfflineCredential(localId, password) {
  let record;
  try {
    const raw = await AsyncStorage.getItem(storageKey(localId));
    record = raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("Could not read offline credential:", error);
    return "missing";
  }
  if (!record?.salt || !record?.hash || !record?.iterations) return "missing";

  const hash = await derive(
    password ?? "",
    hexToBytes(record.salt),
    record.iterations,
  );
  return equalBytes(hash, hexToBytes(record.hash)) ? "ok" : "mismatch";
}
