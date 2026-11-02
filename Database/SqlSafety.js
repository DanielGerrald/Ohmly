/**
 * Guards for building SQLite queries safely.
 *
 * Values in our queries are always passed as `?` parameters, which SQLite
 * escapes for us. Column names and sort directions can't be passed that
 * way, so they are pasted into the SQL text. These helpers make sure only
 * plain identifiers (letters, digits, underscores) and ASC/DESC ever get
 * pasted in, so a bad or malicious key can't change the query.
 */

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Checks that a column name is a plain SQL identifier.
 *
 * @param {string} name - column name passed in by code
 * @returns {string} the same name, safe to put in SQL
 * @throws {Error} if the name contains anything other than letters,
 *   digits and underscores (or starts with a digit)
 */
export function safeColumn(name) {
  if (typeof name !== "string" || !IDENTIFIER_RE.test(name)) {
    throw new Error(`Invalid SQL column name: ${JSON.stringify(name)}`);
  }
  return name;
}

/**
 * Checks a sort direction.
 *
 * @param {string} order - "ASC" or "DESC" (any letter case)
 * @returns {"ASC"|"DESC"}
 * @throws {Error} for anything else
 */
export function safeSortOrder(order) {
  const upper = String(order).toUpperCase();
  if (upper !== "ASC" && upper !== "DESC") {
    throw new Error(`Invalid SQL sort order: ${JSON.stringify(order)}`);
  }
  return upper;
}

/**
 * Picks the columns to write from a data object.
 *
 * Keeps keys whose value isn't null/undefined (so table defaults are not
 * overwritten). Keys that aren't plain identifiers (e.g. unexpected keys in
 * data from the server) are skipped with a warning instead of being put
 * into the SQL.
 *
 * @param {Object} data - row data
 * @param {string[]} [exclude=[]] - keys to leave out (e.g. the WHERE key)
 * @returns {string[]} safe column names
 */
export function safeColumnsFrom(data, exclude = []) {
  return Object.keys(data).filter((key) => {
    if (exclude.includes(key)) return false;
    if (data[key] === undefined || data[key] === null) return false;
    if (!IDENTIFIER_RE.test(key)) {
      console.warn("Skipping invalid SQL column name:", key);
      return false;
    }
    return true;
  });
}
