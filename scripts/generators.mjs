import { MODULE_ID } from "./constants.mjs";
import { getPacks, localize } from "./templates.mjs";

/**
 * Text generators (combat environment, random events, blessings & curses…).
 * Their content comes from content packs (see docs/content-packs.md). A box keeps only the
 * generator id, so importing a pack with the same id brings an old box back.
 * Built-in files in data/generators/<id>.json are still supported but none ship today.
 * Everything is validated: text only, size limits. Missing content gives null, never an exception.
 */

/** Built-in generator files shipped with the module. */
export const BUILTIN_GENERATORS = Object.freeze([]);

const LIMITS = { groups: 20, entries: 200, text: 1000 };
const isObject = v => !!v && typeof v === "object" && !Array.isArray(v);
const cleanId = v => (typeof v === "string" && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(v)) ? v : null;

/** @type {Map<string, Promise<object|null>>} */
const cache = new Map();

function cleanText(value) {
  if (typeof value === "string") return value.slice(0, LIMITS.text);
  if (!isObject(value)) return "";
  const out = {};
  for (const [lang, text] of Object.entries(value)) {
    if (/^[a-z]{2}(-[A-Z]{2})?$/.test(lang) && typeof text === "string") out[lang] = text.slice(0, LIMITS.text);
  }
  return Object.keys(out).length ? out : "";
}

/** A safe copy of a generator, or null when unusable. Used for built-in files and packs. */
export function validateGenerator(raw) {
  if (!isObject(raw) || !Array.isArray(raw.groups)) return null;
  const groups = raw.groups.slice(0, LIMITS.groups).map(g => {
    const id = isObject(g) ? cleanId(g.id) : null;
    if (!id) return null;
    const entries = Array.isArray(g.entries) ? g.entries.slice(0, LIMITS.entries).map(cleanText).filter(Boolean) : [];
    return entries.length ? { id, label: cleanText(g.label) || id, entries } : null;
  }).filter(Boolean);
  if (!groups.length) return null;
  return {
    id: cleanId(raw.id) ?? "",
    title: cleanText(raw.title),
    attribution: cleanText(raw.attribution),
    alwaysInclude: cleanId(raw.alwaysInclude),
    groups
  };
}

/**
 * Every generator from the installed content packs. A later pack wins on a duplicate id.
 * @returns {{id: string, title: object|string, packId: string, packName: string, gen: object}[]}
 */
export function listGenerators() {
  const byId = new Map();
  for (const pack of getPacks()) {
    for (const gen of pack.generators ?? []) byId.set(gen.id, { id: gen.id, title: gen.title, packId: pack.id, packName: pack.name, gen });
  }
  return [...byId.values()];
}

/**
 * A generator by id: from a content pack first, then from a built-in file.
 * @returns {Promise<object|null>}
 */
export function loadGenerator(kind) {
  const fromPack = typeof kind === "string" ? listGenerators().find(g => g.id === kind) : null;
  if (fromPack) return Promise.resolve(fromPack.gen);
  if (!BUILTIN_GENERATORS.includes(kind)) return Promise.resolve(null);
  if (!cache.has(kind)) {
    const promise = fetch(`modules/${MODULE_ID}/data/generators/${kind}.json`)
      .then(response => (response.ok ? response.json() : null))
      .then(validateGenerator)
      .catch(err => {
        console.warn(`${MODULE_ID} | Could not load generator "${kind}"`, err);
        return null;
      })
      .then(result => {
        if (!result) cache.delete(kind); // Allow a retry later.
        return result;
      });
    cache.set(kind, promise);
  }
  return cache.get(kind);
}

/** Languages that appear in the generator's texts. */
export function generatorLanguages(gen) {
  const langs = new Set();
  const scan = value => { if (isObject(value)) Object.keys(value).forEach(k => langs.add(k)); };
  scan(gen.title);
  for (const group of gen.groups) {
    scan(group.label);
    group.entries.forEach(scan);
  }
  return [...langs];
}

/**
 * Entries a filter allows. "any" or an unknown id means everything.
 * A generator may name a group that is always mixed in (general events).
 * @returns {{group: object, entry: (string|object)}[]}
 */
export function poolFor(gen, filter) {
  const chosen = gen.groups.find(g => g.id === filter);
  const groups = !chosen
    ? gen.groups
    : [chosen, ...gen.groups.filter(g => g.id === gen.alwaysInclude && g !== chosen)];
  return groups.flatMap(group => group.entries.map(entry => ({ group, entry })));
}

const randomIndex = n => {
  const r = CONFIG?.Dice?.randomUniform?.() ?? Math.random();
  return Math.min(n - 1, Math.floor(r * n));
};

/**
 * Pick one entry at random.
 * @returns {{group: string, text: string}|null}
 */
export function pickEntry(gen, filter, lang) {
  const pool = poolFor(gen, filter);
  if (!pool.length) return null;
  const { group, entry } = pool[randomIndex(pool.length)];
  return { group: localize(group.label, lang), text: localize(entry, lang) };
}
