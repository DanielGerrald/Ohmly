/**
 * Authentication context.
 *
 * Keeps track of the logged-in user for the whole app. The source of truth
 * is the local SQLite `user` table: the most recently logged-in user with
 * `logged_in = 1` and a non-expired ID token is considered signed in. The
 * session is re-checked every 5 minutes while the app is open and every
 * time it returns to the foreground.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { lastLoggedinUserSqlite, updateUserSqlite } from "../Database/UserDatabase";

/**
 * How often the session is re-validated while the app is in the foreground.
 */
const SESSION_CHECK_INTERVAL_MS = 300_000; // 5 min

/**
 * Checks whether a Firebase ID token (a JWT) has expired.
 *
 * How it works: decodes the middle (payload) part of the JWT from base64,
 * reads its `exp` claim (seconds since 1970) and compares it with the
 * current time. The signature is NOT verified; this is only used to decide
 * whether the user needs to sign in again. Malformed tokens count as expired.
 *
 * @param {string} token - Firebase ID token
 * @returns {Promise<boolean>} true if expired or invalid
 */
export async function isTokenExpired(token) {
  try {
    const payloadBase64 = token.split(".")[1];
    const { exp } = JSON.parse(atob(payloadBase64)); // seconds since epoch
    const now = Math.floor(Date.now() / 1000);
    return now >= exp;
  } catch {
    return true; // Treat invalid tokens as expired
  }
}

/**
 * Context object with default (logged-out) values.
 */
const AuthContext = createContext({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: (_userData) => {},
  logout: () => {},
  refreshUser: () => {},
});

/**
 * Provides `user`, `isAuthenticated`, `isLoading`, `login`, `logout` and
 * `refreshUser` to the whole app.
 *
 * How it works: on mount it runs checkSession() to restore a saved session.
 * It then listens to AppState: when the app goes to the background the
 * periodic check is paused, and when it comes back the session is checked
 * again immediately.
 *
 * @param {{children: React.ReactNode}} props
 */
export function AuthContextProvider({ children }) {
  const db = useSQLiteContext();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef(null);
  const appState = useRef(AppState.currentState);

  /**
   * Stops the periodic session check, if running.
   */
  const clearSessionInterval = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  /**
   * Starts the periodic session check (only one interval at a time).
   */
  const startSessionInterval = () => {
    if (!intervalRef.current) {
      intervalRef.current = setInterval(checkSession, SESSION_CHECK_INTERVAL_MS);
    }
  };

  /**
   * Restores or invalidates the session from SQLite.
   *
   * How it works: loads the last logged-in user. If there isn't one or they
   * are flagged logged out, the user is cleared. If their token has expired,
   * they are marked logged out in SQLite and cleared (sending them back to the
   * login screen). Otherwise they become the current user and periodic checks
   * start. Always ends the initial loading state.
   */
  const checkSession = useCallback(async () => {
    try {
      const lastLoggedIn = await lastLoggedinUserSqlite(db);

      if (!lastLoggedIn || lastLoggedIn.logged_in !== 1) {
        clearSessionInterval();
        setUser(null);
        return;
      }

      if (await isTokenExpired(lastLoggedIn.idToken)) {
        await updateUserSqlite(db, { ...lastLoggedIn, logged_in: 0 });
        clearSessionInterval();
        setUser(null);
        return;
      }

      setUser(lastLoggedIn);
      startSessionInterval();
    } catch (error) {
      console.error("Error checking session:", error);
    } finally {
      setIsLoading(false);
    }
  }, [db]);

  /**
   * Marks a user as signed in (called by the Login screen after the user row
   * has been saved to SQLite) and starts periodic session checks.
   *
   * @param {Object} userData - the user row
   */
  const login = useCallback((userData) => {
    setUser(userData);
    startSessionInterval();
  }, []);

  /**
   * Signs the user out: stops session checks, sets logged_in = 0 in SQLite,
   * removes the remembered username from AsyncStorage and clears the user,
   * which makes RootNavigator show the Login screen.
   */
  const logout = useCallback(async () => {
    clearSessionInterval();
    if (user) {
      await updateUserSqlite(db, { ...user, logged_in: 0 });
    }
    await AsyncStorage.removeItem("userName");
    setUser(null);
  }, [db, user]);

  /**
   * Re-reads the current user from SQLite (e.g. after the profile or avatar
   * was changed) so the UI shows the latest values.
   */
  const refreshUser = useCallback(async () => {
    const lastLoggedIn = await lastLoggedinUserSqlite(db);
    if (lastLoggedIn && lastLoggedIn.logged_in === 1) {
      setUser(lastLoggedIn);
    }
  }, [db]);

  useEffect(() => {
    checkSession();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (
        appState.current.match(/active/) &&
        nextAppState.match(/inactive|background/)
      ) {
        clearSessionInterval();
      }

      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        checkSession();
      }

      appState.current = nextAppState;
    });

    return () => {
      clearSessionInterval();
      subscription.remove();
    };
  }, [checkSession]);

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Shortcut hook to read the AuthContext value.
 */
export const useAuth = () => useContext(AuthContext);
