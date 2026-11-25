import { I18N, MODULE_ID } from "./constants.mjs";
import { localize } from "./templates.mjs";

/**
 * Loot generator. Treasure amounts are original (a wealth budget per tier). Item names and
 * prices come from SRD 5.1 (data/loot/loot.json). The budget is split into coins and items
 * of the same total value: gems, art objects, trade goods and equipment, plus magic items
 * for hoards.
 */

export const LOOT_TIERS = Object.freeze(["t1", "t2", "t3", "t4"]);
export const LOOT_MODES = Object.freeze(["individual", "hoard"]);
export const LOOT_LANGS = Object.freeze(["en", "tr"]);

/** [dice, sides, multiplier] in gp. */
const BUDGET = Object.freeze({
  individual: { t1: [2, 6, 3], t2: [3, 6, 15], t3: [4, 6, 60], t4: [4, 6, 350] },
  hoard: { t1: [6, 6, 20], t2: [6, 6, 150], t3: [6, 6, 1000], t4: [6, 6, 8000] }
});

/** Share of the coin value paid in each coin. The first coins are filled first. */
const COIN_MIX = Object.freeze({
  t1: { cp: 0.15, sp: 0.35, gp: 0.5 },
  t2: { sp: 0.2, ep: 0.1, gp: 0.6, pp: 0.1 },
  t3: { gp: 0.7, pp: 0.3 },
  t4: { gp: 0.6, pp: 0.4 }
});
const RATE = Object.freeze({ cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 });
const MAGIC_RARITY = Object.freeze({
  t1: ["common", "uncommon"],
  t2: ["uncommon", "rare"],
  t3: ["rare", "very-rare"],
  t4: ["very-rare", "legendary"]
});

const LIMITS = { entries: 400, text: 300 };
const isObject = v => !!v && typeof v === "object" && !Array.isArray(v);
const text = v => (typeof v === "string" ? v.slice(0, LIMITS.text) : "");
const positive = v => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

function cleanLocal(value) {
  if (typeof value === "string") return value.slice(0, LIMITS.text);
  if (!isObject(value)) return "";
  const out = {};
  for (const [lang, t] of Object.entries(value)) if (/^[a-z]{2}$/.test(lang) && typeof t === "string") out[lang] = t.slice(0, LIMITS.text);
  return Object.keys(out).length ? out : "";
}

function validate(raw) {
  if (!isObject(raw)) return null;
  const list = (arr, fn) => (Array.isArray(arr) ? arr.slice(0, LIMITS.entries).map(fn).filter(Boolean) : []);
  const priced = e => (isObject(e) && cleanLocal(e.n) && positive(e.v) ? { n: cleanLocal(e.n), v: positive(e.v) } : null);
  const tiered = e => {
    if (!isObject(e) || !positive(e.v)) return null;
    const n = list(e.n, cleanLocal);
    return n.length ? { v: positive(e.v), n } : null;
  };
  const magic = {};
  for (const rarity of ["common", "uncommon", "rare", "very-rare", "legendary"]) {
    magic[rarity] = isObject(raw.magic) ? list(raw.magic[rarity], text) : [];
  }
  const result = {
    attribution: cleanLocal(raw.attribution),
    goods: list(raw.goods, priced),
    trade: list(raw.trade, priced),
    gems: list(raw.gems, tiered),
    art: list(raw.art, tiered),
    magic
  };
  return (result.goods.length || result.trade.length || result.gems.length) ? result : null;
}

/** @type {Promise<object|null>|null} */
let cache = null;

/** @returns {Promise<object|null>} */
export function loadLoot() {
  cache ??= fetch(`modules/${MODULE_ID}/data/loot/loot.json`)
    .then(response => (response.ok ? response.json() : null))
    .then(validate)
    .catch(err => {
      console.warn(`${MODULE_ID} | Could not load loot data`, err);
      return null;
    })
    .then(result => {
      if (!result) cache = null; // Allow a retry later.
      return result;
    });
  return cache;
}

const rand = () => CONFIG?.Dice?.randomUniform?.() ?? Math.random();
const pickOne = arr => arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))];

function rollBudget([dice, sides, mult]) {
  let sum = 0;
  for (let i = 0; i < dice; i++) sum += 1 + Math.floor(rand() * sides);
  return sum * mult;
}

function formatValue(gp, lang) {
  const num = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 });
  if (gp >= 1) return `${num.format(gp)} gp`;
  if (gp >= 0.1) return `${num.format(gp * 10)} sp`;
  return `${num.format(gp * 100)} cp`;
}

/** Split a gp value into coins following the tier's mix. Rounds down; the rest goes to gp, sp, cp. */
function makeCoins(value, tier) {
  const coins = {};
  let remain = value;
  for (const [denom, share] of Object.entries(COIN_MIX[tier])) {
    const wanted = Math.min(remain, value * share * (0.7 + rand() * 0.6));
    const count = Math.floor(wanted / RATE[denom] + 1e-9);
    if (count > 0) {
      coins[denom] = count;
      remain -= count * RATE[denom];
    }
  }
  for (const denom of ["gp", "sp", "cp"]) {
    const count = Math.floor(remain / RATE[denom] + 1e-9);
    if (count > 0) {
      coins[denom] = (coins[denom] ?? 0) + count;
      remain -= count * RATE[denom];
    }
  }
  return coins;
}

/**
 * Candidates that cost at most `left`. Gems and art use only the priciest tier that fits;
 * trade goods and equipment use the priciest quarter, so the budget goes to a few good
 * items before small ones.
 */
function candidates(entries, left, flat) {
  const fits = entries.filter(e => e.v <= left + 1e-9);
  if (!fits.length) return [];
  const top = Math.max(...fits.map(e => e.v));
  return fits.filter(e => e.v >= top / (flat ? 4 : 1));
}

/**
 * Roll treasure.
 * @param {object} data  Loaded loot data.
 * @param {{mode: string, tier: string}} choice
 * @param {string} lang
 * @returns {string[]}  Result lines.
 */
export function generateLoot(data, { mode, tier }, lang) {
  const t = key => game.i18n.localize(`${I18N}.Loot.${key}`);
  const L = value => localize(value, lang);
  const budget = rollBudget(BUDGET[mode][tier]);
  const coinShare = mode === "hoard" ? 0.35 + rand() * 0.25 : 0.7 + rand() * 0.3;
  let coinValue = budget * coinShare;
  let left = budget - coinValue;

  // Spend the item budget on items of the same total value.
  const weights = mode === "hoard" ? { gems: 3, art: 2, trade: 2, goods: 2 } : { gems: 1, art: 0, trade: 2, goods: 2 };
  const sources = {
    gems: data.gems.map(g => ({ ...g, kind: "gem" })),
    art: data.art.map(g => ({ ...g, kind: "art" })),
    trade: data.trade.map(g => ({ ...g, kind: "trade" })),
    goods: data.goods.map(g => ({ ...g, kind: "goods" }))
  };
  const picked = new Map();
  // Stop when what is left is too small to bother with; it stays as coins.
  const floor = Math.max(1, budget * 0.02);
  for (let i = 0; i < 12 && left > floor; i++) {
    const options = Object.entries(sources)
      .filter(([key]) => weights[key] > 0)
      .map(([key, entries]) => ({ key, list: candidates(entries, left, key === "trade" || key === "goods"), weight: weights[key] }))
      .filter(o => o.list.length);
    if (!options.length) break;
    const total = options.reduce((s, o) => s + o.weight, 0);
    let roll = rand() * total;
    const source = options.find(o => (roll -= o.weight) < 0) ?? options[0];
    const entry = pickOne(source.list);
    const name = entry.kind === "gem" || entry.kind === "art" ? L(pickOne(entry.n)) : L(entry.n);
    const flat = entry.kind === "trade" || entry.kind === "goods";
    const qty = 1 + Math.floor(rand() * Math.min(flat ? 20 : 4, Math.floor(left / entry.v + 1e-9)));
    const key = `${entry.kind}:${name}`;
    const prior = picked.get(key);
    if (prior) prior.qty += qty;
    else picked.set(key, { kind: entry.kind, name, qty, each: entry.v });
    left -= qty * entry.v;
  }
  coinValue += Math.max(0, left); // Whatever the items did not use stays as coins.

  const lines = [];
  const coins = makeCoins(coinValue, tier);
  const coinText = ["pp", "gp", "ep", "sp", "cp"].filter(d => coins[d]).map(d => `${coins[d].toLocaleString(lang)} ${d}`).join(", ");
  if (coinText) lines.push(`${t("Coins")}: ${coinText}`);

  for (const item of picked.values()) {
    const label = item.kind === "gem" ? `${t("Gem")}: ` : item.kind === "art" ? `${t("Art")}: ` : "";
    const price = formatValue(item.each, lang);
    lines.push(item.qty > 1 ? `${item.qty}× ${label}${item.name} (${price} ${t("Each")})` : `${label}${item.name} (${price})`);
  }

  if (mode === "hoard") {
    const rarities = MAGIC_RARITY[tier];
    const count = tier === "t1" ? Math.floor(rand() * 3) : 1 + Math.floor(rand() * (tier === "t4" ? 3 : 2));
    const seen = new Set();
    for (let i = 0; i < count; i++) {
      const rarity = pickOne(rarities);
      const pool = data.magic[rarity]?.length ? data.magic[rarity] : rarities.flatMap(r => data.magic[r] ?? []);
      if (!pool.length) continue;
      const name = pickOne(pool);
      if (seen.has(name)) continue;
      seen.add(name);
      lines.push(`✦ ${name} (${t(`Rarity.${rarity}`)})`);
    }
  }

  if (!lines.length) lines.push(t("Nothing"));
  else lines.push(`${t("Worth")} ≈ ${formatValue(budget, lang)}${mode === "hoard" ? ` ${t("MagicExcluded")}` : ""}`);
  return lines;
}
