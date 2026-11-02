// Shared constants used across multiple screens and components

/**
 * Placeholder blur hash shown by expo-image while a photo is loading.
 */
export const BLURHASH = "LOMIJ@0J0JE0%3~E9sEK%3IoNFEK";

/**
 * Safe-area edges to pad on screens (bottom is left to the tab bar).
 */
export const SAFE_AREA_EDGES = ["top", "left", "right"];

/**
 * Returns only the jobs that are not finished yet.
 *
 * @param {Array<Object>} jobs - list of work orders
 * @returns {Array<Object>} jobs whose status_label is anything except "Completed"
 */
export const getActiveJobs = (jobs) =>
  jobs.filter((j) => j.status_label !== "Completed");

/**
 * Returns only the finished jobs.
 *
 * @param {Array<Object>} jobs - list of work orders
 * @returns {Array<Object>} jobs whose status_label is "Completed"
 */
export const getCompletedJobs = (jobs) =>
  jobs.filter((j) => j.status_label === "Completed");
