/**
 * Coin math. Pure functions, all values in copper pieces (cp).
 * 1 pp = 10 gp, 1 gp = 2 ep = 10 sp = 100 cp, 1 ep = 5 sp.
 */

export const DENOMS = Object.freeze([
  { key: "pp", cp: 1000 },
  { key: "gp", cp: 100 },
  { key: "ep", cp: 50 },
  { key: "sp", cp: 10 },
  { key: "cp", cp: 1 }
]);

const MAX_COINS = 1e9;

/** Clean stored amounts: whole, non-negative numbers only. */
export function normalizeAmounts(raw) {
  const out = {};
  for (const { key } of DENOMS) {
    const n = Math.floor(Number(raw?.[key]));
    out[key] = Number.isFinite(n) ? Math.min(MAX_COINS, Math.max(0, n)) : 0;
  }
  return out;
}

export function totalCp(amounts) {
  return DENOMS.reduce((sum, d) => sum + (amounts[d.key] ?? 0) * d.cp, 0);
}

/**
 * Fewest coins for a value. Electrum is never used for change.
 * @param {number} cp
 * @param {boolean} usePP
 * @returns {{key: string, count: number}[]}
 */
export function breakdown(cp, usePP) {
  let rest = Math.max(0, Math.floor(cp));
  const parts = [];
  for (const d of DENOMS) {
    if (d.key === "ep" || (d.key === "pp" && !usePP)) continue;
    const count = Math.floor(rest / d.cp);
    if (count) parts.push({ key: d.key, count });
    rest -= count * d.cp;
  }
  return parts;
}

/**
 * Split a value between party members.
 * @returns {{each: number, remainder: number}} both in cp
 */
export function split(cp, party) {
  const n = Math.max(1, Math.floor(party) || 1);
  const each = Math.floor(cp / n);
  return { each, remainder: cp - each * n };
}
