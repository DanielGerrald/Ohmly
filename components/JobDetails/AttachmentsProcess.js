/**
 * Upload logic for the "Submit Attachments" button.
 */

import { useCallback, useState } from "react";
import * as Network from "expo-network";

import {
  postDocumentsApi,
  postPhotosApi,
  updateAttachmentSqlite,
} from "../../Database/AttachmentDatabase";
import { showOnceAlert } from "../AlertManager";
import syncLock from "../SyncLock";

/**
 * Hook (despite the lowercase name it uses React hooks, so it must be
 * called at the top level of a component) that uploads pending attachments.
 *
 * @param {SQLiteDatabase} db
 * @param {string} token - Firebase ID token
 * @param {Array<Object>} attachments - attachments currently listed
 * @param {() => Promise<void>} refreshAttachments - reloads the list
 * @returns {{processPendingAttachments: Function, isProcessing: boolean}}
 */
export function attachmentsProcess(db, token, attachments, refreshAttachments) {
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * Uploads every attachment with syncStatus "No" or "Pending".
   *
   * How it works:
   * 1. Does nothing if another sync is running (shared SyncLock) or there is
   *    nothing to upload; otherwise takes the lock.
   * 2. If there is no internet, marks them all "Pending" (the background
   *    sync will retry later), shows an alert and stops.
   * 3. Otherwise uploads them one at a time: mark "Uploading", re-check the
   *    connection, upload, then mark "Yes" on success or "Pending" on
   *    failure. If the connection drops part-way, the rest are left for later
   *    and the user is told.
   * 4. Reloads the list and always releases the lock.
   */
  const processPendingAttachments = useCallback(async () => {
    const pendingAttachments = attachments.filter(
      (att) => att.syncStatus === "No" || att.syncStatus === "Pending",
    );

    if (syncLock.isProcessing || pendingAttachments.length === 0) return;

    syncLock.isProcessing = true;
    setIsProcessing(true);

    try {
      let networkState = await Network.getNetworkStateAsync();
      let hasInternet =
        networkState.isConnected && networkState.isInternetReachable === true;

      if (!hasInternet) {
        await Promise.all(
          pendingAttachments.map(async (att) => {
            if (att.syncStatus !== "Pending") {
              att.syncStatus = "Pending";
              await updateAttachmentSqlite(db, att);
            }
          }),
        );

        showOnceAlert(
          "noInternet",
          "No internet connection",
          "Attachments were marked as pending. Please try again when you have internet access.",
        );

        await refreshAttachments();
        return;
      }

      for (const att of pendingAttachments) {
        try {
          att.syncStatus = "Uploading";
          await updateAttachmentSqlite(db, att);

          networkState = await Network.getNetworkStateAsync();
          hasInternet =
            networkState.isConnected &&
            networkState.isInternetReachable === true;

          if (!hasInternet) {
            att.syncStatus = "Pending";
            await updateAttachmentSqlite(db, att);
            break;
          }

          const response =
            att.type === "Photo"
              ? await postPhotosApi(token, att)
              : await postDocumentsApi(token, att);

          att.syncStatus = response?.status === 200 ? "Yes" : "Pending";
          await updateAttachmentSqlite(db, att);
        } catch (error) {
          console.log(`Upload failed for attachment ID ${att.id}:`, error);

          att.syncStatus = "Pending";
          try {
            await updateAttachmentSqlite(db, att);
          } catch (dbErr) {
            console.log("Failed to revert attachment to Pending:", dbErr);
          }

          networkState = await Network.getNetworkStateAsync();
          hasInternet =
            networkState.isConnected &&
            networkState.isInternetReachable === true;

          if (!hasInternet) {
            showOnceAlert(
              "noInternetDuringUpload",
              "Internet disconnected",
              "Some attachments were uploaded. Others were marked as pending. Try again once you're reconnected.",
            );
            break;
          }
        }
      }

      await refreshAttachments();
    } catch (err) {
      console.log("Error processing attachments:", err);
    } finally {
      syncLock.isProcessing = false;
      setIsProcessing(false);
    }
  }, [attachments, db, refreshAttachments, token]);

  return { processPendingAttachments, isProcessing };
}
