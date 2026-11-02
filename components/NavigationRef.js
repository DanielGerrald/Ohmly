/**
 * Global navigation reference.
 *
 * Lets code outside of React components (for example background sync or
 * alert handlers) navigate between screens by calling
 * `navigationRef.navigate(...)`. It is attached to the NavigationContainer
 * in App.js.
 */

import { createNavigationContainerRef } from "@react-navigation/native";

export const navigationRef = createNavigationContainerRef();
