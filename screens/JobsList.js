import JobsListScreen from "../components/JobsListScreen";
import { getActiveJobs } from "../components/constants";

/**
 * "Jobs" tab: lists every job that isn't completed yet. Shows a loading
 * spinner until the first sync after login finishes.
 */
export default function JobsList() {
  return (
    <JobsListScreen
      title="Active Jobs"
      emptyMessage="There are currently no active jobs."
      filterJobs={getActiveJobs}
      showLoadingGate
    />
  );
}
