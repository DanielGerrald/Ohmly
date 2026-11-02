/**
 * Shared layout for the "Active Jobs" and "Completed Jobs" tabs.
 */

import { Dimensions, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Avatar, Card, Text } from "react-native-paper";
import { useMemo } from "react";

import JobCard from "./JobCard";
import Loading from "./ui/Loading";
import { useJob } from "./Context";
import AppSyncManager from "./AppSyncManager";
import { BLURHASH, SAFE_AREA_EDGES } from "./constants";
import Colors from "../constants/colors";

/**
 * Shows the logo, a title and a list of job cards (or an empty-state card).
 *
 * How it works: reads all jobs from the Job context, filters them with
 * `filterJobs` (memoized so it only re-runs when the jobs change) and
 * renders them inside AppSyncManager so the list supports pull-to-refresh.
 *
 * @param {Object} props
 * @param {string} props.title - heading under the logo
 * @param {string} props.emptyMessage - text shown when no jobs match
 * @param {(jobs: Array) => Array} props.filterJobs - picks which jobs to show
 * @param {boolean} [props.showLoadingGate=false] - show a full-screen
 *   spinner while the first sync is still loading jobs
 */
export default function JobsListScreen({
  title,
  emptyMessage,
  filterJobs,
  showLoadingGate = false,
}) {
  const { jobResult, isJobsLoading } = useJob();

  const jobData = useMemo(() => filterJobs(jobResult), [jobResult, filterJobs]);

  if (showLoadingGate && isJobsLoading) {
    return <Loading />;
  }

  return (
    <SafeAreaView style={styles.SafeArea} edges={SAFE_AREA_EDGES}>
      <AppSyncManager>
        <View style={styles.header}>
          <Image
            style={styles.logo}
            source={require("../assets/logo.png")}
            contentFit="contain"
            placeholder={BLURHASH}
          />
          <Text style={styles.Text}>{title}</Text>
        </View>
        {jobData.length === 0 ? (
          <Card style={styles.compJobCard}>
            <Card.Content style={styles.jobCardContent}>
              <Avatar.Icon
                style={styles.avatarIcon}
                icon="check-decagram"
                size={50}
              />
              <Text variant="bodyMedium" style={styles.jobCardContentText}>
                {emptyMessage}
              </Text>
            </Card.Content>
          </Card>
        ) : (
          <JobCard jobData={jobData} />
        )}
      </AppSyncManager>
    </SafeAreaView>
  );
}

const { width, height } = Dimensions.get("window");
/**
 * Base font size, scaled up for wider screens (phones < 380px, large phones, tablets > 600px).
 */
let textStyle = 12;
if (width >= 380 && width <= 600) textStyle = 16;
else if (width > 600) textStyle = 20;

const styles = StyleSheet.create({
  SafeArea: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingTop: 15,
    paddingBottom: 15,
  },
  Text: {
    color: "#ffffff",
    fontSize: textStyle,
    justifyContent: "flex-start",
  },
  avatarIcon: {
    backgroundColor: Colors.primary,
    marginRight: 10,
  },
  compJobCard: {
    backgroundColor: Colors.surface,
    marginBottom: height * 0.02,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "black",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 6,
    shadowOpacity: 0.25,
  },
  header: {
    alignItems: "center",
    marginBottom: height * 0.03,
  },
  jobCardContent: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginBottom: height * 0.01,
  },
  jobCardContentText: {
    fontSize: textStyle - 1,
  },
  logo: {
    flexShrink: 1,
    width: "auto",
    minWidth: "100%",
    minHeight: height * 0.08,
    marginBottom: height * 0.03,
  },
});
