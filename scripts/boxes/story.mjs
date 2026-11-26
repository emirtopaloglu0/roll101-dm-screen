import { I18N, MODULE_ID } from "../constants.mjs";
import { partyActors } from "./actors.mjs";
import { escapeHTML } from "../tables.mjs";

/**
 * Storytelling tools: tension clocks and the spotlight tracker (with each character's stakes).
 * Ideas from the YouTube channel Corkboards & Curiosities; code and texts are original.
 * State lives in box.data only. Every value is clamped on read, so hand-edited or old data
 * never breaks the box.
 */

export const CLOCK_SIZES = Object.freeze([3, 4, 6, 8, 10, 12]);
export const CLOCK_COLORS = Object.freeze(["#b5462f", "#d9822b", "#c9a227", "#3d8b3d", "#2b8a8a", "#3567b5", "#7a4bb5", "#6b6b6b"]);
export const DEFAULT_CLOCK_COLOR = CLOCK_COLORS[0];
export const MAX_CLOCKS = 12;
export const MAX_PCS = 12;
export const MAX_EXTRAS = 12;
export const MAX_STAKES = 10;
export const NAME_MAX = 60;
export const STAKE_MAX = 60;
/** Languages the box texts exist in (module.json "languages"). */
export const STORY_LANGS = Object.freeze(["en", "tr"]);
const MAX_MARKS = 2;

const isObject = v => !!v && typeof v === "object" && !Array.isArray(v);
const toInt = (v, min, max, fallback) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const cleanName = v => (typeof v === "string" ? v.trim().slice(0, NAME_MAX) : "");
export const cleanColor = v => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : DEFAULT_CLOCK_COLOR);

/* -------------------------------------------- */
/*  Memory-only view state                      */
/* -------------------------------------------- */

const openStakes = new Set();
const openHelp = new Set();
const stakeKey = (boxId, key) => `${boxId}|${key}`;
const flip = (set, key) => {
  if (set.has(key)) set.delete(key);
  else set.add(key);
  return set.has(key);
};
export const toggleStakes = (boxId, key) => flip(openStakes, stakeKey(boxId, key));
export const toggleHelp = boxId => flip(openHelp, boxId);

/* -------------------------------------------- */
/*  Texts in the box's own language             */
/* -------------------------------------------- */

/** lang -> Promise of the R101DMSCREEN object of that language file (or null). */
const langFiles = new Map();

function loadLangFile(lang) {
  if (!langFiles.has(lang)) {
    const promise = fetch(`modules/${MODULE_ID}/lang/${lang}.json`)
      .then(r => (r.ok ? r.json() : null))
      .then(json => (isObject(json?.[I18N]) ? json[I18N] : null))
      .catch(() => null)
      .then(result => {
        if (!result) langFiles.delete(lang); // Allow a retry later.
        return result;
      });
    langFiles.set(lang, promise);
  }
  return langFiles.get(lang);
}

/** The language a box shows: its own choice, else Foundry's, else English. */
export function storyLanguage(chosen) {
  if (STORY_LANGS.includes(chosen)) return chosen;
  return STORY_LANGS.includes(game.i18n.lang) ? game.i18n.lang : "en";
}

/**
 * Texts of one section (Clocks, Spotlight) in a language, falling back to Foundry's own
 * translation and then to the key. The box can show Turkish while Foundry runs in English.
 * @returns {Promise<(key: string, data?: object) => string>}
 */
export async function storyTexts(lang) {
  const [own, en] = await Promise.all([loadLangFile(lang), lang === "en" ? null : loadLangFile("en")]);
  const read = (root, key) => key.split(".").reduce((o, p) => (isObject(o) ? o[p] : undefined), root);
  return (key, data) => {
    let text = read(own, key) ?? read(en, key);
    if (typeof text !== "string") text = game.i18n.localize(`${I18N}.${key}`);
    if (data) for (const [k, v] of Object.entries(data)) text = text.replaceAll(`{${k}}`, String(v));
    return text;
  };
}

function languageChoices(chosen, t) {
  return [
    { id: "auto", label: t("Template.AutoLanguage"), selected: !STORY_LANGS.includes(chosen) },
    ...STORY_LANGS.map(l => ({ id: l, label: l.toUpperCase(), selected: chosen === l }))
  ];
}

/** Section names → every key of that section, resolved. */
async function sectionTexts(section, lang) {
  const t = await storyTexts(lang);
  const own = await loadLangFile(lang) ?? await loadLangFile("en");
  const keys = Object.keys(own?.[section] ?? {});
  return { t, S: Object.fromEntries(keys.map(k => [k, t(`${section}.${k}`)])) };
}

/* -------------------------------------------- */
/*  Clocks                                      */
/* -------------------------------------------- */

/** A clean list of clocks from any stored value. */
export function readClocks(data) {
  const list = Array.isArray(data?.clocks) ? data.clocks : [];
  return list.filter(isObject).slice(0, MAX_CLOCKS).map(c => {
    const size = CLOCK_SIZES.includes(Number(c.size)) ? Number(c.size) : 6;
    return {
      id: typeof c.id === "string" && c.id ? c.id : foundry.utils.randomID(),
      name: cleanName(c.name),
      size,
      filled: toInt(c.filled, 0, size, 0),
      color: cleanColor(c.color)
    };
  });
}

export function newClock() {
  return { id: foundry.utils.randomID(), name: "", size: 6, filled: 0, color: DEFAULT_CLOCK_COLOR };
}

/** SVG path of each pie segment, starting at 12 o'clock and going clockwise. */
export function clockSegments(size, filled) {
  const r = 46;
  const point = deg => {
    const rad = (deg - 90) * Math.PI / 180;
    return `${(50 + r * Math.cos(rad)).toFixed(2)} ${(50 + r * Math.sin(rad)).toFixed(2)}`;
  };
  return Array.from({ length: size }, (_, i) => {
    const a0 = (360 / size) * i;
    const a1 = (360 / size) * (i + 1);
    return { index: i, filled: i < filled, d: `M50 50 L${point(a0)} A${r} ${r} 0 0 1 ${point(a1)} Z` };
  });
}

/** Template data for a clocks box. */
export async function clocksContext(box) {
  const lang = storyLanguage(box.data.lang);
  const { t, S } = await sectionTexts("Clocks", lang);
  const clocks = readClocks(box.data).map(c => ({
    ...c,
    full: c.filled >= c.size,
    segments: clockSegments(c.size, c.filled),
    sizes: CLOCK_SIZES.map(n => ({ n, selected: n === c.size })),
    colors: CLOCK_COLORS.map(hex => ({ hex, selected: hex === c.color }))
  }));
  return {
    name: S.Title,
    S,
    langs: languageChoices(box.data.lang, t),
    langLabel: t("Template.Language"),
    helpOpen: openHelp.has(box.id),
    credit: t("Library.Credit"),
    clocks,
    canAdd: clocks.length < MAX_CLOCKS,
    nameMax: NAME_MAX
  };
}

/** HTML for a chat message showing one clock. Colors are inline: chat has none of our CSS. */
export async function clockChatHTML(clock, lang) {
  const t = await storyTexts(storyLanguage(lang));
  const label = clock.name || t("Clocks.Untitled");
  const color = cleanColor(clock.color);
  const paths = clockSegments(clock.size, clock.filled).map(s =>
    `<path d="${s.d}" fill="${s.filled ? color : "#e8e2d6"}" stroke="#3a3a3a" stroke-width="2"/>`).join("");
  return `<div class="r101-chat-clock" style="display:flex;align-items:center;gap:8px">`
    + `<svg viewBox="0 0 100 100" width="48" height="48" role="img" aria-label="${clock.filled}/${clock.size}">${paths}</svg>`
    + `<p style="margin:0"><strong>${escapeHTML(label)}</strong><br>${clock.filled} / ${clock.size}</p></div>`;
}

/* -------------------------------------------- */
/*  Spotlight and stakes                        */
/* -------------------------------------------- */

/** A clean copy of a spotlight box's data. Unknown keys (lang) are kept. */
export function readSpotlight(data) {
  const marks = {};
  const stakes = {};
  if (isObject(data?.marks)) {
    for (const [k, v] of Object.entries(data.marks).slice(0, 100)) marks[k] = toInt(v, 0, MAX_MARKS, 0);
  }
  if (isObject(data?.stakes)) {
    for (const [k, v] of Object.entries(data.stakes).slice(0, 100)) {
      if (!Array.isArray(v)) continue;
      stakes[k] = v.filter(s => typeof s === "string" && s.trim()).slice(0, MAX_STAKES).map(s => s.trim().slice(0, STAKE_MAX));
    }
  }
  const extras = (Array.isArray(data?.extras) ? data.extras : []).filter(isObject).slice(0, MAX_EXTRAS).map(e => ({
    id: typeof e.id === "string" && e.id ? e.id : foundry.utils.randomID(),
    name: cleanName(e.name),
    uuid: typeof e.uuid === "string" ? e.uuid : ""
  })).filter(e => e.name || e.uuid);
  const hidden = (Array.isArray(data?.hidden) ? data.hidden : []).filter(u => typeof u === "string").slice(0, 50);
  const lang = STORY_LANGS.includes(data?.lang) ? data.lang : "auto";
  return { marks, stakes, extras, hidden, lang };
}

function safeActor(uuid) {
  try { return fromUuidSync(uuid) ?? null; } catch { return null; }
}

/** Template data for a spotlight box. Quietest characters first. */
export async function spotlightContext(box) {
  const data = readSpotlight(box.data);
  const lang = storyLanguage(data.lang);
  const { t, S } = await sectionTexts("Spotlight", lang);
  const hidden = new Set(data.hidden);
  const members = [];
  const seen = new Set();

  for (const actor of partyActors()) {
    if (hidden.has(actor.uuid)) continue;
    seen.add(actor.uuid);
    members.push({ key: actor.uuid, name: actor.name, img: actor.img, uuid: actor.uuid });
  }
  for (const extra of data.extras) {
    if (extra.uuid) {
      if (seen.has(extra.uuid)) continue;
      seen.add(extra.uuid);
      const actor = safeActor(extra.uuid);
      members.push(actor
        ? { key: extra.id, name: actor.name, img: actor.img, uuid: extra.uuid }
        : { key: extra.id, name: S.Missing, missing: true });
    } else {
      members.push({ key: extra.id, name: extra.name });
    }
  }

  const rows = members.slice(0, MAX_PCS).map(m => {
    const marks = data.marks[m.key] ?? 0;
    const stakes = data.stakes[m.key] ?? [];
    return {
      ...m,
      marks,
      pips: Array.from({ length: MAX_MARKS }, (_, i) => ({ n: i + 1, on: i < marks })),
      stakes: stakes.map((text, i) => ({ i, text })),
      stakeCount: stakes.length,
      canAddStake: stakes.length < MAX_STAKES,
      open: openStakes.has(stakeKey(box.id, m.key))
    };
  });
  rows.sort((a, b) => a.marks - b.marks || String(a.name).localeCompare(String(b.name), lang));

  return {
    name: S.Title,
    S,
    showAllText: t("Spotlight.ShowAll", { count: data.hidden.length }),
    langs: languageChoices(data.lang, t),
    langLabel: t("Template.Language"),
    helpOpen: openHelp.has(box.id),
    credit: t("Library.Credit"),
    rows,
    empty: !rows.length,
    hiddenCount: data.hidden.length,
    canAddExtra: data.extras.length < MAX_EXTRAS,
    nameMax: NAME_MAX,
    stakeMax: STAKE_MAX
  };
}

/** Start of a session: everyone moves back one mark, so last session's stars can wait. */
export function shiftMarks(data) {
  const clean = readSpotlight(data);
  for (const k of Object.keys(clean.marks)) clean.marks[k] = Math.max(0, clean.marks[k] - 1);
  return clean;
}
