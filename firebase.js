/**
 * Firebase initialization.
 *
 * Creates the single Firebase app instance for Ohmly and exports the two
 * services the app uses: Firebase Auth (sign-in, tokens) and the Realtime
 * Database SDK handle. Most data calls actually go through the RTDB REST API
 * with axios (see the Database/ folder), using ID tokens from `auth`.
 */

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

import { environment } from "./Config";

/**
 * Firebase project settings. The API key and database URL come from Config.js.
 */
const firebaseConfig = {
  apiKey: environment.apikey,
  authDomain: "ohmly-4a268.firebaseapp.com",
  databaseURL: environment.apiUrl,
  projectId: "ohmly-4a268",
  storageBucket: "ohmly-4a268.firebasestorage.app",
  messagingSenderId: "430708353870",
  appId: "1:430708353870:web:ba30094c61088e32110c1f"
};

const app = initializeApp(firebaseConfig);


/**
 * Firebase Auth instance used for login, logout and fetching ID tokens.
 */
export const auth = getAuth(app);
/**
 * Firebase Realtime Database SDK instance.
 */
export const rtdb = getDatabase(app);
export default app;
