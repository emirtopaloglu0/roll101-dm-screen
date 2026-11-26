import { MODULE_ID, SETTINGS } from "./constants.mjs";
import { validateGenerator } from "./generators.mjs";

/**
 * Read-only reference templates (prices, rules tables).
 *
 * Built-in templates ship in data/templates/ and load on first use.
 * Content packs are imported by the GM and stored in a world setting.
 * Every template is validated: text only, no HTML, size limits. A broken
 * template is skipped with a console warning, never thrown.
 *
 * Template keys: "builtin:<id>" or "pack:<packId>:<id>".
 */

export const PACK_FORMAT = "roll101-dm-screen-pack";
/** 1: templates only. 2: adds "generators". A v1 pack is still a valid v2 pack. */
export const PACK_FORMAT_VERSION = 2;
const MAX_PACK_GENERATORS = 20;

const LIMITS = { text: 2000, sections: 40, columns: 8, rows: 500, variants: 6, templates: 100 };
const INDEX_URL = `modules/${MODULE_ID}/data/templates/index.json`;

let builtins = null;     // Map id -> template, after load
let loading = null;
const listeners = new Set();

/* -------------------------------------------- */
/*  Validation                                  */
/* -------------------------------------------- */

const isObject = v => !!v && typeof v === "object" && !Array.isArray(v);
const cleanId = v => (typeof v === "string" && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(v)) ? v : null;

/** A localized text is a string or {en: "...", tr: "..."}. */
function cleanText(value) {
  if (typeof value === "string") return value.slice(0, LIMITS.text);
  if (typeof value === "number") return String(value);
  if (!isObject(value)) return "";
  const out = {};
  for (const [lang, text] of Object.entries(value)) {
    if (/^[a-z]{2}(-[A-Z]{2})?$/.test(lang) && typeof text === "string") out[lang] = text.slice(0, LIMITS.text);
  }
  return Object.keys(out).length ? out : "";
}

function cleanSection(raw) {
  if (!isObject(raw)) return null;
  const columns = Array.isArray(raw.columns) ? raw.columns.slice(0, LIMITS.columns).map(cleanText) : [];
  const width = Math.max(columns.length, 1);
  const rows = Array.isArray(raw.rows)
    ? raw.rows.slice(0, LIMITS.rows).filter(Array.isArray).map(r => r.slice(0, width).map(cleanText))
    : [];
  // hint: optional "what is this for" text shown above the table.
  return { title: cleanText(raw.title), columns, rows, note: cleanText(raw.note), hint: cleanText(raw.hint) };
}

function cleanVariant(raw) {
  if (!isObject(raw)) return null;
  const sections = Array.isArray(raw.sections) ? raw.sections.slice(0, LIMITS.sections).map(cleanSection).filter(Boolean) : [];
  if (!sections.length) return null;
  return {
    id: cleanId(raw.id) ?? "default",
    label: cleanText(raw.label),
    attribution: cleanText(raw.attribution),
    sections
  };
}

/** @returns {object|null} a safe copy of the template, or null when unusable */
export function validateTemplate(raw) {
  if (!isObject(raw)) return null;
  const id = cleanId(raw.id);
  const variants = Array.isArray(raw.variants) ? raw.variants.slice(0, LIMITS.variants).map(cleanVariant).filter(Boolean) : [];
  if (!id || !variants.length) return null;
  return {
    id,
    title: cleanText(raw.title) || id,
    category: cleanId(raw.category) ?? "",
    // Free-text heading the library groups pack templates under, e.g. {en: "Travel", tr: "Yolculuk"}.
    group: cleanText(raw.group),
    variants
  };
}

/**
 * Validate a content pack file.
 * @returns {{pack: object}|{error: string}}  error is a key under R101DMSCREEN.Packs
 */
export function validatePack(raw) {
  if (!isObject(raw) || raw.format !== PACK_FORMAT) return { error: "InvalidFile" };
  if (Number(raw.formatVersion) > PACK_FORMAT_VERSION) return { error: "NewerFile" };
  const id = cleanId(raw.id);
  const templates = Array.isArray(raw.templates)
    ? raw.templates.slice(0, LIMITS.templates).map(validateTemplate).filter(Boolean)
    : [];
  // A generator needs an id: boxes find it by that id.
  const generators = Array.isArray(raw.generators)
    ? raw.generators.slice(0, MAX_PACK_GENERATORS).map(validateGenerator).filter(g => g?.id)
    : [];
  if (!id || (!templates.length && !generators.length)) return { error: "InvalidFile" };
  return {
    pack: {
      id,
      name: typeof raw.name === "string" && raw.name ? raw.name.slice(0, 100) : id,
      version: typeof raw.version === "string" ? raw.version.slice(0, 20) : "",
      templates,
      generators
    }
  };
}

/* -------------------------------------------- */
/*  Localization                                */
/* -------------------------------------------- */

/** Pick the text for a language: exact, then English, then any. */
export function localize(value, lang) {
  if (typeof value === "string") return value;
  if (!isObject(value)) return "";
  return value[lang] ?? value.en ?? Object.values(value)[0] ?? "";
}

/**
 * Lower-case text for loose search: accents and the Turkish dotless i fold away,
 * so "sifa" finds "Şifa" and "initiative" finds "İnitiative".
 */
export function foldSearch(text) {
  return String(text ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/ı/g, "i");
}

/** Languages a template offers (from its title and first section). */
export function templateLanguages(template) {
  const langs = new Set();
  const collect = v => { if (isObject(v)) Object.keys(v).forEach(l => langs.add(l)); };
  collect(template.title);
  for (const variant of template.variants) {
    collect(variant.label);
    variant.sections.slice(0, 1).forEach(s => { collect(s.title); s.columns.forEach(collect); });
  }
  return [...langs];
}

/* -------------------------------------------- */
/*  Built-in templates                          */
/* -------------------------------------------- */

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

/** Load the built-in templates once. Failures are logged and give an empty list. */
async function loadBuiltins() {
  if (builtins) return builtins;
  loading ??= (async () => {
    const map = new Map();
    try {
      const index = await fetchJson(INDEX_URL);
      const files = Array.isArray(index?.templates) ? index.templates : [];
      // Fetch in parallel, keep index order.
      const loaded = await Promise.all(files.map(async file => {
        if (typeof file !== "string" || !/^[a-z0-9._-]+\.json$/i.test(file)) return null;
        try {
          const template = validateTemplate(await fetchJson(`modules/${MODULE_ID}/data/templates/${file}`));
          if (!template) console.warn(`${MODULE_ID} | Skipped invalid template ${file}`);
          return template;
        } catch (err) {
          console.warn(`${MODULE_ID} | Could not load template ${file}`, err);
          return null;
        }
      }));
      for (const template of loaded) if (template) map.set(template.id, template);
    } catch (err) {
      console.warn(`${MODULE_ID} | Could not load template index`, err);
    }
    builtins = map;
    return map;
  })();
  return loading;
}

/* -------------------------------------------- */
/*  Content packs                               */
/* -------------------------------------------- */

/** Validated packs, cached until the setting changes. */
let packCache = null;

export function getPacks() {
  if (packCache) return packCache;
  const stored = game.settings.get(MODULE_ID, SETTINGS.PACKS);
  const packs = Array.isArray(stored?.packs) ? stored.packs : [];
  packCache = packs.map(p => validatePack({ ...p, format: PACK_FORMAT }).pack).filter(Boolean);
  return packCache;
}

export async function savePacks(packs) {
  await game.settings.set(MODULE_ID, SETTINGS.PACKS, { packs });
}

/** Called by the setting's onChange. */
export function onPacksChanged() {
  packCache = null;
  for (const fn of listeners) fn();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* -------------------------------------------- */
/*  Lookup                                      */
/* -------------------------------------------- */

/**
 * Every template the screen can add. Pack templates also carry their pack id and group.
 * @returns {Promise<{key: string, title: object|string, source: string, category: string, group?: object|string, packId?: string}[]>}
 */
export async function listTemplates() {
  const out = [];
  for (const t of (await loadBuiltins()).values()) {
    out.push({ key: `builtin:${t.id}`, title: t.title, source: "builtin", category: t.category });
  }
  for (const pack of getPacks()) {
    for (const t of pack.templates) {
      out.push({
        key: `pack:${pack.id}:${t.id}`, title: t.title, source: pack.name,
        category: t.category, group: t.group, packId: pack.id
      });
    }
  }
  return out;
}

/** Built-in templates of one category (for example "rules"), in index order. */
export async function getBuiltinsByCategory(category) {
  return [...(await loadBuiltins()).values()].filter(t => t.category === category);
}

/** The first installed pack template with this id. @returns {{packId: string, template: object}|null} */
export function findPackTemplate(id) {
  for (const pack of getPacks()) {
    const template = pack.templates.find(t => t.id === id);
    if (template) return { packId: pack.id, template };
  }
  return null;
}

/** @returns {Promise<object|null>} */
export async function getTemplate(key) {
  if (typeof key !== "string") return null;
  const [kind, a, b] = key.split(":");
  if (kind === "builtin") {
    // A template that moved from the module into a content pack keeps working once the pack is imported.
    return (await loadBuiltins()).get(a) ?? findPackTemplate(a)?.template ?? null;
  }
  if (kind === "pack") return getPacks().find(p => p.id === a)?.templates.find(t => t.id === b) ?? null;
  return null;
}
