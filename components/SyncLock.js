/**
 * Module-level flags shared by the sync logic.
 *
 * Because this is a plain object (not React state), every importer sees the
 * same values and changes take effect immediately without re-rendering.
 * - isProcessing: true while a sync of pending local changes is running, so a
 *   second sync cannot start at the same time.
 * - didInitSession: true once the first full sync after login has completed,
 *   so it is not repeated every time the component re-mounts.
 */

const SyncLock = {
  isProcessing: false,
  didInitSession: false,
};

export default SyncLock;
