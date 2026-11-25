import { MODULE_ID } from "./constants.mjs";

/**
 * Automatic backups of the screen data, newest first, at most MAX_BACKUPS.
 * Stored in this computer's localStorage, per world. Never sent over the network,
 * so backups cost players nothing. Another computer has its own backups.
 */

const MAX_BACKUPS = 5;

const storageKey = () => `${MODULE_ID}.backups.${game.world?.id ?? "unknown"}`;

/** @returns {{time: number, reason: string, data: object}[]} */
export function listBackups() {
  try {
    const list = JSON.parse(localStorage.getItem(storageKey()) ?? "[]");
    if (!Array.isArray(list)) return [];
    return list.filter(b => b && Number.isFinite(b.time) && b.data && typeof b.data === "object");
  } catch {
    return [];
  }
}

/**
 * Store a copy of the data. Skipped when it equals the newest backup.
 * @param {object} data
 * @param {string} reason  key under R101DMSCREEN.Backup.Reason
 */
export function addBackup(data, reason) {
  const json = JSON.stringify(data);
  const list = listBackups();
  if (list[0] && JSON.stringify(list[0].data) === json) return;
  list.unshift({ time: Date.now(), reason, data: JSON.parse(json) });
  try {
    localStorage.setItem(storageKey(), JSON.stringify(list.slice(0, MAX_BACKUPS)));
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not store backup`, err);
  }
}
