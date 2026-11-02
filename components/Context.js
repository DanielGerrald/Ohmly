/**
 * Job context: app-wide React state for the technician's work orders.
 *
 * Any component can call `useJob()` to read the cached job list, know whether
 * it is still loading, and react to `syncVersion` changes (bumped after every
 * successful sync so screens know to re-read data from SQLite).
 */

import { createContext, useContext, useState } from "react";

/**
 * React context object holding the job state.
 */
const JobContext = createContext();

/**
 * Provider component that owns the job state and shares it with its children.
 *
 * Exposes:
 * - jobResult / setJobResult: the current list of jobs shown in the UI
 * - syncVersion / incrementSyncVersion: counter bumped after each sync
 * - isJobsLoading / setIsJobsLoading: true while jobs are being loaded
 *
 * @param {{children: React.ReactNode}} props
 */
export function JobProvider({ children }) {
  const [jobResult, setJobResult] = useState([]);
  const [syncVersion, setSyncVersion] = useState(0);
  const [isJobsLoading, setIsJobsLoading] = useState(true);

  /**
   * Bumps syncVersion by one so listeners re-load their data.
   */
  const incrementSyncVersion = () => setSyncVersion((v) => v + 1);

  return (
    <JobContext.Provider
      value={{
        jobResult,
        setJobResult,
        syncVersion,
        incrementSyncVersion,
        isJobsLoading,
        setIsJobsLoading,
      }}
    >
      {children}
    </JobContext.Provider>
  );
}

/**
 * Shortcut hook to read the JobContext value.
 */
export const useJob = () => useContext(JobContext);
