/**
 * Hook that runs a callback whenever the app returns to the foreground.
 */

import { useEffect, useRef } from "react";
import { AppState } from "react-native";

/**
 * Calls `onRefresh` each time the app goes from background/inactive to active.
 *
 * How it works: keeps the last known AppState in a ref, subscribes to
 * AppState "change" events, and fires the callback only on the transition
 * into "active" (not on every state change). The listener is removed when
 * the component using the hook unmounts or `onRefresh` changes.
 *
 * @param {Function} onRefresh - function to run when the app is reopened.
 *   Wrap it in useCallback so the listener isn't re-registered every render.
 */
export default function useAppFocusRefresh(onRefresh) {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    /**
     * Detects the background -> active transition and triggers the refresh.
     */
    const handleAppStateChange = (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // App has come to foreground
        onRefresh();
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, [onRefresh]);
}
