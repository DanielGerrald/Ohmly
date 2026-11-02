/**
 * App entry point.
 *
 * Sets up everything the rest of the app depends on, from the outside in:
 * 1. Force-update gate: blocks the app if this version / OS is too old.
 * 2. Navigation container (with a global ref for non-component navigation).
 * 3. SQLite provider: opens the local "LSconnectDB" database and runs
 *    setupDatabase to create/upgrade the tables.
 * 4. Auth context: who is logged in.
 * 5. Job context: the cached list of work orders.
 * 6. RootNavigator: shows the login screens or the main app.
 */

import React, { useEffect, Suspense } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as Updates from "expo-updates";
import { SQLiteProvider } from "expo-sqlite";
import * as ScreenOrientation from "expo-screen-orientation";
import * as MediaLibrary from "expo-media-library";

import Login from "./screens/Login";
import ForgotPassword from "./screens/ForgotPassword";
import Home from "./screens/Home";
import Loading from "./components/ui/Loading";
import { JobProvider } from "./components/Context";
import { AuthContextProvider, useAuth } from "./components/AuthContext";
import { navigationRef } from "./components/NavigationRef";
import StagingBanner from "./components/ui/StagingBanner";
import setupDatabase from "./Database/SetupDatabase";
import {
  useForcedUpdateGate,
  UpdateRequiredScreen,
  UnsupportedOSScreen,
} from "./components/UpdateGate";

/**
 * Navigation stack used while logged out (Login, Forgot Password).
 */
const AuthStack = createNativeStackNavigator();
/**
 * Navigation stack used while logged in (Home with its tabs).
 */
const AuthenticatedStack = createNativeStackNavigator();

/**
 * Screens available before signing in: Login (start screen, swipe-back
 * disabled) and Forgot Password.
 */
function LoggedOutNavigator() {
  return (
    <AuthStack.Navigator
      initialRouteName="Login"
      screenOptions={{ fullScreenGestureEnabled: true }}
      id="auth-stack"
    >
      <AuthStack.Screen
        name="Login"
        component={Login}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <AuthStack.Screen
        name="Forgot Password"
        component={ForgotPassword}
        options={{ headerShown: false, gestureEnabled: true }}
      />
    </AuthStack.Navigator>
  );
}

/**
 * Screens available after signing in. Home contains the bottom tab bar with
 * the jobs list, completed jobs and profile.
 */
function LoggedInNavigator() {
  return (
    <AuthenticatedStack.Navigator
      screenOptions={{ fullScreenGestureEnabled: true }}
      id="authenticated-stack"
    >
      <AuthenticatedStack.Screen
        name="Home"
        component={Home}
        options={{ headerShown: false, gestureEnabled: false }}
      />
    </AuthenticatedStack.Navigator>
  );
}

/**
 * Chooses which navigator to show based on the auth state.
 *
 * Shows a loading spinner while the saved session is being checked, then
 * the logged-in or logged-out stack. Because it reacts to `isAuthenticated`,
 * calling login()/logout() in AuthContext switches screens automatically.
 */
function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <Loading />;
  }

  return isAuthenticated ? <LoggedInNavigator /> : <LoggedOutNavigator />;
}

/**
 * Checks for an over-the-air (EAS Update) JavaScript bundle and, if one is
 * available, downloads it and immediately restarts the app to apply it.
 * Errors are logged and ignored so the app still starts offline.
 */
async function checkForUpdates() {
  try {
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch (error) {
    console.error("Error fetching update:", error);
  }
}

/**
 * Root component.
 *
 * How it works:
 * - Runs the force-update check (useForcedUpdateGate). If the OS is too old
 *   or a store update is required, a blocking screen is shown instead of
 *   the app.
 * - On mount (and when the gate status changes) unlocks screen rotation
 *   and, in release builds that pass the gate, checks for OTA updates.
 * - Asks for photo library permission the first time, so photos can be
 *   saved to the device.
 * - Otherwise renders the provider tree described at the top of this file.
 */
export default function App() {
  const [status, requestPermission] = MediaLibrary.usePermissions();
  const { state, retry } = useForcedUpdateGate();

  useEffect(() => {
    (async () => {
      await ScreenOrientation.unlockAsync();

      // Only attempt OTA updates if we're not blocked by a required store update
      if (!__DEV__ && state.status === "ok") {
        await checkForUpdates();
      }
    })();
  }, [state.status]);

  useEffect(() => {
    if (status === null) {
      requestPermission();
    } else if (status?.granted === false) {
      console.warn("Media Library permission denied.");
    }
  }, [status, requestPermission]);

  if (state.status === "unsupported_os") {
    return <UnsupportedOSScreen />;
  }

  if (state.status === "required") {
    return (
      <UpdateRequiredScreen
        installedVersion={state.installedVersion}
        minVersion={state.minVersion}
        onRetry={retry}
      />
    );
  }

  return (
    <Suspense fallback={<Loading />}>
      <NavigationContainer ref={navigationRef}>
        <SQLiteProvider
          databaseName="LSconnectDB"
          onInit={setupDatabase}
          useSuspense
        >
          <AuthContextProvider>
            <JobProvider>
              <StagingBanner />
              <RootNavigator />
            </JobProvider>
          </AuthContextProvider>
        </SQLiteProvider>
        <StatusBar style="light" />
      </NavigationContainer>
    </Suspense>
  );
}
