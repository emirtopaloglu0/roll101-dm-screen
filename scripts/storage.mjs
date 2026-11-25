import { MODULE_ID, SAVE_DELAY_MS, SETTINGS } from "./constants.mjs";
import { migrateData } from "./migrate.mjs";
import { addBackup } from "./backups.mjs";

/**
 * In-memory copy of the screen data with debounced writes to one world setting.
 * Only loaded for users who can use the screen.
 */

let current = null;
let readOnly = false;
let lastSavedJSON = null;
let saveTimer = null;
let sessionBackupPending = false;
const listeners = new Set();

export const isLoaded = () => current !== null;
export const isReadOnly = () => readOnly;

export function load() {
  const raw = game.settings.get(MODULE_ID, SETTINGS.DATA);
  const result = migrateData(raw);
  current = result.data;
  readOnly = result.readOnly;
  lastSavedJSON = JSON.stringify(current);
}

export function getData() {
  return current;
}

export function getActiveLayout() {
  return current.layouts.find(l => l.id === current.activeLayoutId) ?? current.layouts[0];
}

/**
 * Change the data in place and schedule a save.
 * @param {(data: object) => void} mutator
 */
export function update(mutator) {
  if (!current) return;
  // First change after the window opens: keep the state from before this session.
  if (sessionBackupPending) {
    sessionBackupPending = false;
    snapshot("Session");
  }
  mutator(current);
  scheduleSave();
}

/** Call when the window opens. The next change stores a backup first. */
export function beginSession() {
  sessionBackupPending = true;
}

/** Store a backup of the current data, for example before a destructive change. */
export function snapshot(reason) {
  if (current && !readOnly) addBackup(current, reason);
}

/**
 * Replace all data (restore or import). The old data is backed up first.
 * @param {object} raw
 * @param {string} reason
 */
export function replaceData(raw, reason) {
  if (!current || readOnly) return false;
  snapshot(reason);
  current = migrateData(raw).data;
  scheduleSave();
  return true;
}

function scheduleSave() {
  if (readOnly) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveNow();
  }, SAVE_DELAY_MS);
}

async function saveNow() {
  if (readOnly || !current) return;
  const json = JSON.stringify(current);
  if (json === lastSavedJSON) return;
  lastSavedJSON = json;
  try {
    await game.settings.set(MODULE_ID, SETTINGS.DATA, JSON.parse(json));
  } catch (err) {
    console.error(`${MODULE_ID} | Save failed`, err);
    lastSavedJSON = null;
    ui.notifications?.error("R101DMSCREEN.Notifications.SaveFailed", { localize: true });
  }
}

/** Write pending changes now, for example when the window closes. */
export async function flush() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  await saveNow();
}

/**
 * Called by the setting's onChange on every client.
 * Ignores our own writes. A remote write is ignored while local edits are pending:
 * the last writer wins.
 */
export function onRemoteChange(value) {
  if (!current) return;
  if (JSON.stringify(value) === lastSavedJSON) return;
  if (saveTimer) return;
  const result = migrateData(value);
  current = result.data;
  readOnly = result.readOnly;
  lastSavedJSON = JSON.stringify(current);
  for (const fn of listeners) fn();
}

/** @param {() => void} fn */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
