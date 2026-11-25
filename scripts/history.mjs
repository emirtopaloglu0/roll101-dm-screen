/**
 * Recent generator and table results per box. Memory only: not saved,
 * so rolling never causes network traffic. Cleared on reload.
 */

const MAX_ENTRIES = 10;
const store = new Map();

/** @returns {{table: string, text: string}[]} newest first */
export function getHistory(boxId) {
  return store.get(boxId) ?? [];
}

export function pushHistory(boxId, entry) {
  const list = [entry, ...getHistory(boxId)].slice(0, MAX_ENTRIES);
  store.set(boxId, list);
  return list;
}
