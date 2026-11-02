/**
 * Data synchronization between the device (SQLite) and Firebase.
 *
 * Ohmly works offline: technicians check in/out, take photos, upload files
 * and complete jobs while possibly offline. Those actions are saved locally
 * with syncStatus "Pending". The sync pipeline here:
 * 1. Pushes pending check-ins/outs, final check-outs and attachments.
 * 2. Downloads the latest jobs (plus contacts, visits, attachments, labels)
 *    and the user profile, and stores them in SQLite.
 * 3. Removes local data for jobs that no longer exist on the server.
 *
 * It runs once after login, on pull-to-refresh, and whenever the app comes
 * back to the foreground.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Alert,
  Dimensions,
  StyleSheet,
  View,
  Text,
} from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import * as Network from "expo-network";

import syncLock from "./SyncLock";
import { useJob } from "./Context";
import { useAuth } from "./AuthContext";
import useAppFocusRefresh from "./AppFocusRefresh";
import { showOnceAlert } from "./AlertManager";
import {
  getUserAvatarApi,
  getUserProfileApi,
  updateUserSqlite,
} from "../Database/UserDatabase";
import {
  cleanupWorkOrderSqlite,
  getAssignmentsApi,
  insertWorkOrderSqlite,
  selectWorkOrderSqlite,
  updateWorkOrderSqlite,
} from "../Database/WorkOrderDatabase";
import {
  cleanupContactSqlite,
  getWorkOrderContactsApi,
  insertContactSqlite,
} from "../Database/ContactDatabase";
import {
  cleanupCheckInOutSqlite,
  deleteCheckInOutDuplicatesSqlite,
  getCheckInOutApi,
  insertCheckInOutSqlite,
  postCheckInOutApi,
  selectCheckInOutSqlite,
  updateCheckInOutSqlite,
} from "../Database/CheckInOutDatabase";
import {
  cleanupAttachmentSqlite,
  getAttachmentsApi,
  insertAttachmentSqlite,
  postDocumentsApi,
  postPhotosApi,
  selectAttachmentSqlite,
  updateAttachmentSqlite,
} from "../Database/AttachmentDatabase";
import {
  cleanupFinalCheckOutSqlite,
  getFinalCheckoutApi,
  insertFinalCheckOutSqlite,
  postFinalCheckListApi,
  postFinalCheckoutApi,
  selectFinalCheckOutSqlite,
  updateFinalCheckOutSqlite,
} from "../Database/FinalCheckOutDatabase";
import { getLabelsApi, insertCategoryLabelSqlite } from "../Database/LabelDatabase";
import BannerOnPendingSync from "./BannerOnPendingSync";
import Colors from "../constants/colors";

/**
 * Returns a promise that resolves after `ms` milliseconds (used to space out
 * requests).
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Hook that exposes the sync pipeline to a screen.
 *
 * @param {Object} [options]
 * @param {Function} [options.fetchPhotos] - called after a manual sync so
 *   the current screen can reload its photos
 * @param {Function} [options.fetchFiles] - same, for documents
 * @param {Function} [options.onSyncSuccess] - called with a message after a
 *   successful manual sync (used to show a banner)
 * @returns {{refreshing: boolean, onRefresh: Function,
 *   scrollViewRef: React.RefObject}} state and handler for a
 *   pull-to-refresh ScrollView
 */
export function useAppSync({ fetchPhotos, fetchFiles, onSyncSuccess } = {}) {
  const db = useSQLiteContext();
  const { user: authUser } = useAuth();
  const { setJobResult, incrementSyncVersion, setIsJobsLoading } = useJob();
  const [refreshing, setRefreshing] = useState(false);
  const scrollViewRef = useRef(null);

  /** AUTH & SESSION **/
  /**
   * Returns the logged-in user, or null (showing a "please log in" alert
   * unless `silent` is true).
   *
   * @param {{silent?: boolean}} [options]
   * @returns {Promise<Object|null>}
   */
  const getAuthenticatedUser = async ({ silent = false } = {}) => {
    if (!authUser) {
      if (!silent) showOnceAlert("No User", "Not logged in", "Please log in.");
      return null;
    }
    return authUser;
  };

  /** JOB SYNC (open + completed + details + contacts + checkins) **/
  /**
   * Downloads all jobs and their related data and saves them in SQLite.
   *
   * How it works:
   * 1. Gets all work orders. If there are none, clears the local list.
   * 2. For each job, one at a time (to avoid overloading the network/disk),
   *    fetches contacts, visits and attachments in parallel:
   *    - contacts are upserted;
   *    - visits are marked synced, de-duplicated against local copies and
   *      upserted;
   *    - attachments are only inserted if a row with the same file name
   *      doesn't already exist for that job.
   *    The attachment folder id comes from the second part of the site's
   *    reference_code (e.g. "ABC-123" -> "123").
   * 3. Downloads and stores the attachment labels.
   * 4. Deletes local rows for jobs that are no longer returned.
   * 5. Upserts each job. For jobs the server marks as completed, sets the
   *    local status to "Completed" and downloads the completion checklist if
   *    it isn't stored yet.
   * 6. Re-reads this user's jobs from SQLite into the Job context and bumps
   *    syncVersion so open screens reload.
   *
   * @param {Object} user - logged-in user (needs idToken and localId)
   */
  const fetchAndStoreJobs = async (user) => {
    const token = user.idToken;

    const jobs = await getAssignmentsApi(token);
    if (!jobs.length) {
      await cleanupWorkOrderSqlite(db, []); // still normalize state
      return;
    }

    // Sequential per job (rather than firing every job's requests at once) —
    // getAttachmentsApi also writes each file to disk, so N jobs in parallel
    // meant N x 4 concurrent Firebase requests plus concurrent disk writes,
    // which was silently dropping attachments under real network conditions
    // (getAttachmentsApi swallows its own errors and just returns []).
    for (const job of jobs) {
      const id = job.assignment.id;
      const assignmentRefId = job.site?.reference_code?.split("-")[1];
      job.assignment.localId = user.localId;
      const [contactsResult, checkinsResult, attachmentsResult] =
        await Promise.allSettled([
          getWorkOrderContactsApi(token, id),
          getCheckInOutApi(token, id),
          assignmentRefId
            ? getAttachmentsApi(token, assignmentRefId)
            : Promise.resolve([]),
        ]);

      if (contactsResult.status === "fulfilled" && contactsResult.value) {
        try {
          await insertContactSqlite(db, contactsResult.value, id);
        } catch (err) {
          console.warn(`Failed contacts insert for ${id}:`, err);
        }
      }

      if (
        checkinsResult.status === "fulfilled" &&
        Array.isArray(checkinsResult.value)
      ) {
        for (const c of checkinsResult.value) {
          c.syncStatus = "Yes";
          await deleteCheckInOutDuplicatesSqlite(db, c);
          await insertCheckInOutSqlite(db, c);
        }
      }

      if (attachmentsResult.status === "rejected") {
        console.warn(
          `Attachments fetch rejected for job ${id}:`,
          attachmentsResult.reason,
        );
      } else if (Array.isArray(attachmentsResult.value)) {
        for (const att of attachmentsResult.value) {
          const existing = await selectAttachmentSqlite(
            db,
            "fileName",
            att.fileName,
            "assignment_id",
            att.assignment_id,
          );
          if (!existing?.length) {
            await insertAttachmentSqlite(db, att);
          }
        }
      }
    }

    // Attachment types / labels — fetched from the dedicated RTDB node
    try {
      const attachmentTypes = await getLabelsApi(token);
      if (attachmentTypes) {
        await insertCategoryLabelSqlite(db, attachmentTypes);
      }
    } catch (e) {
      console.warn("insertCategoryLabelSqlite error:", e);
    }

    // Normalize local tables to current job set
    await cleanupWorkOrderSqlite(db, jobs);
    await cleanupContactSqlite(db, jobs);
    await cleanupCheckInOutSqlite(db, jobs);
    await cleanupAttachmentSqlite(db, jobs);
    await cleanupFinalCheckOutSqlite(db, jobs);

    for (const job of jobs) {
      try {
        await insertWorkOrderSqlite(db, job);
        // completed is the authoritative remote flag (toggled by final
        // checkout submission and by reopening) — status_label itself is
        // never written back to Firebase, so this keeps local state
        // consistent with it across every sync without disturbing the
        // completion/checklist history used to pre-fill a reopened form.
        if (job.assignment.completed) {
          await updateWorkOrderSqlite(
            db,
            "status_label",
            "Completed",
            "id",
            job.assignment.id,
          );

          const existingCheckout = await selectFinalCheckOutSqlite(
            db,
            "assignment_id",
            job.assignment.id,
          );
          if (!existingCheckout?.length) {
            const finalCheckout = await getFinalCheckoutApi(
              token,
              job.assignment.id,
            );
            if (finalCheckout) {
              await insertFinalCheckOutSqlite(db, finalCheckout);
            }
          }
        }
      } catch (e) {
        console.error("SQLite insert error:", e);
      }
    }

    const sqliteJobs = await selectWorkOrderSqlite(db, "localId", user.localId);
    setJobResult(sqliteJobs);
    incrementSyncVersion();
  };

  /** ATTACHMENTS **/
  /**
   * Uploads every attachment with syncStatus "Pending" (in parallel).
   * Successful uploads are marked "Yes"; failures stay "Pending" so the next
   * sync retries them.
   *
   * @param {string} token - Firebase ID token
   */
  const syncPendingAttachments = async (token) => {
    const pending = await selectAttachmentSqlite(
      db,
      "syncStatus",
      "Pending",
    );
    if (!pending?.length) return;

    await Promise.allSettled(
      pending.map(async (att) => {
        try {
          const res =
            att.type === "Photo"
              ? await postPhotosApi(token, att)
              : await postDocumentsApi(token, att);

          att.syncStatus = res?.status === 200 ? "Yes" : "Pending";
          await updateAttachmentSqlite(db, att);
        } catch (e) {
          console.warn("Attachment sync failed:", e);
          att.syncStatus = "Pending";
          await updateAttachmentSqlite(db, att);
        }
      }),
    );
  };

  /** CHECK IN AND OUT **/
  /**
   * Uploads pending check-ins/outs one at a time, oldest first.
   *
   * They are sent in order with a 1-second pause between them because the
   * order matters (check-in before check-out). If any upload fails, it stops
   * so later records are not sent out of order; the next sync continues from
   * there.
   *
   * @param {string} token - Firebase ID token
   */
  const syncPendingCheckInOut = async (token) => {
    const pending = await selectCheckInOutSqlite(
      db,
      "syncStatus",
      "Pending",
    );

    if (!pending?.length) return;

    for (const item of pending) {
      try {
        const ok = await postCheckInOutApi(item, token);
        if (ok) {
          await updateCheckInOutSqlite(db, "Yes", item.id);
        } else {
          // Server rejected — stop here. The next sync will retry, and
          // fetchAndStoreJobs will dedup any record the server already accepted.
          console.warn("Check-in/out rejected by server, stopping:", item.id);
          break;
        }
      } catch (err) {
        // Network or parse error — stop and retry on next sync.
        console.warn("Check-in/out network error, stopping:", {
          id: item.id,
          err: String(err),
        });
        break;
      }
      // Give the server time to process each record before posting the next.
      await delay(1000);
    }
  };

  /** FINAL CHECKOUT **/
  /**
   * Uploads pending final check-outs (in parallel).
   *
   * For each record it first uploads the checklist, then the completion
   * record. Only if both succeed is the record marked synced and the job
   * marked "Completed" locally.
   *
   * @param {string} token - Firebase ID token
   */
  const syncPendingFinalCheckouts = async (token) => {
    const pending = await selectFinalCheckOutSqlite(
      db,
      "syncStatus",
      "Pending",
    );

    if (!pending?.length) return;

    await Promise.allSettled(
      pending.map(async (record) => {
        try {
          const listRes = await postFinalCheckListApi(token, record);
          if (listRes) {
            const checkoutRes = await postFinalCheckoutApi(
              token,
              record.desc_misc_notes,
              record.assignment_id,
            );
            if (checkoutRes) {
              await updateFinalCheckOutSqlite(
                db,
                "syncStatus",
                "Yes",
                "assignment_id",
                record.assignment_id,
              );
              await updateWorkOrderSqlite(
                db,
                "status_label",
                "Completed",
                "id",
                record.assignment_id,
              );
            }
          }
        } catch (err) {
          console.warn(
            `Final checkout failed for job ${record.assignment_id}`,
            err,
          );
        }
      }),
    );
  };

  /** MAIN SYNC PIPELINE **/
  /**
   * Downloads the user's name/email and avatar from Firebase and saves them
   * to the local user row. Errors are logged, not thrown.
   *
   * @param {Object} user - logged-in user
   */
  const fetchAndStoreUserProfile = async (user) => {
    try {
      const profile = await getUserProfileApi(user);
      if (profile) {
        delete profile.id;
        const avatar = await getUserAvatarApi(user.idToken, user.localId);
        await updateUserSqlite(db, {
          ...profile,
          ...(avatar ? { avatar } : {}),
          username: user.username,
        });
      }
    } catch (error) {
      console.error("fetchAndStoreUserProfile failed:", error);
    }
  };

  /**
   * The full sync pipeline: upload pending check-ins/outs, then final
   * check-outs, then attachments; wait 2 seconds so the server has processed
   * them; then download jobs and the user profile at the same time.
   *
   * @param {Object} user - logged-in user
   */
  const runSyncTasks = async (user) => {
    const token = user.idToken;
    await syncPendingCheckInOut(token);
    await syncPendingFinalCheckouts(token);
    await syncPendingAttachments(token);
    await delay(2000);
    await Promise.all([
      fetchAndStoreJobs(user),
      fetchAndStoreUserProfile(user),
    ]);
  };

  /** PUBLIC REFRESH HANDLER **/
  /**
   * Manual sync (pull-to-refresh and app-returns-to-foreground).
   *
   * How it works: ignores the call if a sync is already running (local
   * `refreshing` flag or the shared SyncLock). Checks for internet first and
   * shows a one-time alert if offline. Runs the full pipeline, lets the
   * screen reload photos/files, and reports success. Always scrolls back to
   * the top and releases the lock when done.
   */
  const onRefresh = useCallback(async () => {
    if (refreshing || syncLock.isProcessing) return;

    setRefreshing(true);
    syncLock.isProcessing = true;

    try {
      const network = await Network.getNetworkStateAsync();
      if (!network.isConnected || network.isInternetReachable === false) {
        showOnceAlert(
          "noInternet",
          "No internet connection",
          "Please try again when you have internet access.",
        );
        return;
      }

      const user = await getAuthenticatedUser();
      if (!user) return;

      await runSyncTasks(user);

      if (typeof fetchPhotos === "function") await fetchPhotos();
      if (typeof fetchFiles === "function") await fetchFiles();

      if (typeof onSyncSuccess === "function") {
        onSyncSuccess("Sync successful");
      }
    } catch (err) {
      console.error("Manual refresh error:", err);
      Alert.alert(
        "Sync Error",
        "Some data could not be synced. Check logs for details.",
      );
    } finally {
      scrollViewRef.current?.scrollTo({ x: 0, y: 0, animated: true });
      setRefreshing(false);
      syncLock.isProcessing = false;
    }
  }, [refreshing, fetchPhotos, fetchFiles]);

  /**
   * Initial sync after login.
   *
   * Runs the pipeline only once per session (guarded by
   * SyncLock.didInitSession) and silently skips if no one is logged in.
   * Turns off the job list loading spinner when done, even on error.
   */
  const manageSession = useCallback(async () => {
    if (syncLock.didInitSession) return;
    syncLock.didInitSession = true;

    try {
      const user = await getAuthenticatedUser({ silent: true });
      if (!user) return;

      await runSyncTasks(user);
    } catch (error) {
      console.error("Error managing session:", error);
      Alert.alert("An error occurred. Please try again.");
      setJobResult([]);
    } finally {
      setIsJobsLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    manageSession();
  }, [manageSession]);

  useAppFocusRefresh(onRefresh);

  return { refreshing, onRefresh, scrollViewRef };
}

/**
 * Screen wrapper that adds pull-to-refresh syncing.
 *
 * Renders its children inside a ScrollView with a RefreshControl wired to
 * the sync pipeline, shows a pending-sync banner when there is unsynced
 * data, and briefly shows a green "Sync successful" banner after a manual
 * sync.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - screen content
 * @param {Function} [props.fetchPhotos] - reload photos after a sync
 * @param {Function} [props.fetchFiles] - reload files after a sync
 */
export default function AppSyncManager({ children, fetchPhotos, fetchFiles }) {
  const [bannerVisible, setBannerVisible] = useState(false);
  const [bannerText, setBannerText] = useState("");

  /**
   * Shows the success banner with the given text for 3 seconds.
   *
   * @param {string} [text="Sync successful"]
   */
  const showBanner = (text = "Sync successful") => {
    setBannerText(text);
    setBannerVisible(true);
    setTimeout(() => setBannerVisible(false), 3000);
  };

  const { refreshing, onRefresh, scrollViewRef } = useAppSync({
    fetchPhotos,
    fetchFiles,
    onSyncSuccess: showBanner,
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
      {bannerVisible && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            paddingVertical: 10,
            paddingHorizontal: 12,
            backgroundColor: Colors.success,
            zIndex: 9999,
          }}
        >
          <Text
            style={{ color: "white", textAlign: "center", fontWeight: "600" }}
          >
            {bannerText}
          </Text>
        </View>
      )}
      <BannerOnPendingSync />
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    paddingHorizontal: width * 0.05,
  },
});
