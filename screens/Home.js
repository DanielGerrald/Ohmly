/**
 * Main screen after login: a bottom tab bar with Jobs, Completed and
 * Profile tabs.
 */

import { FontAwesome } from "@expo/vector-icons";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { Dimensions, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import JobsList from "./JobsList";
import CompletedJobs from "./CompletedJobs";
import Profile from "./Profile";
import { useJob } from "../components/Context";
import { getActiveJobs } from "../components/constants";
import { useMemo } from "react";
import Colors from "../constants/colors";

/**
 * Tab navigator (Material top tabs, positioned at the bottom so tabs can be swiped).
 */
const Tab = createMaterialTopTabNavigator();

const { width } = Dimensions.get("window");
/**
 * Base font size, scaled up for wider screens (phones < 380px, large phones, tablets > 600px).
 */
let textStyle = 12;
if (width >= 380 && width <= 600) textStyle = 16;
else if (width > 600) textStyle = 20;

// Not real view styles — a react-navigation screenOptions config object.
const tabNavIcons = {
  tabBarIndicatorStyle: { backgroundColor: Colors.accent },
  tabBarActiveTintColor: Colors.accent,
  tabBarInactiveTintColor: Colors.muted,
  tabBarStyle: {
    backgroundColor: Colors.background,
  },
  tabBarAllowFontScaling: true,
  tabBarLabelStyle: { fontSize: textStyle - 1 },
};

const styles = StyleSheet.create({
  tabBarBadge: {
    color: "#ffffff",
    backgroundColor: Colors.error,
    paddingHorizontal: textStyle * 0.3,
    borderRadius: 50,
  },
});

/**
 * Renders the tab navigator.
 *
 * How it works: counts active jobs to show a red badge on the Jobs tab, and
 * pads the tab bar by the device's bottom safe-area inset so it isn't
 * hidden behind the home indicator.
 */
export default function Home() {
  const { jobResult } = useJob();
  const { bottom } = useSafeAreaInsets();
  const badge = useMemo(() => getActiveJobs(jobResult).length, [jobResult]);

  const screenOptions = useMemo(() => ({
    ...tabNavIcons,
    tabBarStyle: {
      ...tabNavIcons.tabBarStyle,
      paddingBottom: bottom,
      height: 65 + bottom,
    },
  }), [bottom]);

  return (
    <Tab.Navigator
      tabBarPosition="bottom"
      screenOptions={screenOptions}
      id="2"
    >
      <Tab.Screen
        name="Jobs"
        component={JobsList}
        options={{
          tabBarLabel: "Jobs",
          tabBarIcon: ({ color, size = 26 }) => (
            <FontAwesome
              name="lightbulb-o"
              size={size}
              color={color}
              style={{ marginLeft: 5 }}
            />
          ),
          tabBarBadge: () =>
            badge > 0 ? (
              <Text style={styles.tabBarBadge}>{badge}</Text>
            ) : null,
        }}
      />
      <Tab.Screen
        name="Completed"
        component={CompletedJobs}
        options={{
          tabBarLabel: "Completed",
          tabBarIcon: ({ color, size = 25 }) => (
            <FontAwesome name="check-square-o" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={Profile}
        options={{
          tabBarLabel: "Profile",
          tabBarIcon: ({ color, size = 23 }) => (
            <FontAwesome
              name="user-o"
              size={size}
              color={color}
              style={{ marginLeft: 3 }}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
