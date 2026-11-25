import { I18N } from "../constants.mjs";

/**
 * Party / actor summary box. Reads actor data only; never writes to actors.
 * Built for the dnd5e system. Every value is read defensively, so a different
 * system version or a missing field just leaves that stat out.
 */

export const MAX_ACTORS = 20;
const MAX_CONDITIONS = 8;
const NON_PLAYER_TYPES = new Set(["npc", "vehicle", "group", "encounter"]);

const num = value => (typeof value === "number" && Number.isFinite(value) ? value : null);
const signed = value => (value >= 0 ? `+${value}` : String(value));

/** Player-owned characters, sorted by name. */
export function partyActors() {
  return (game.actors?.contents ?? [])
    .filter(a => a.hasPlayerOwner && !NON_PLAYER_TYPES.has(a.type))
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

/** Names of the active conditions (statuses), localized. */
function conditionNames(actor) {
  const statuses = actor.statuses instanceof Set ? [...actor.statuses] : [];
  const effects = CONFIG.statusEffects ?? [];
  return statuses.slice(0, MAX_CONDITIONS).map(id => {
    const effect = effects.find(e => e.id === id);
    const name = effect?.name ?? effect?.label ?? id;
    return game.i18n.localize(name);
  });
}

/** "Fighter 3 / Rogue 2", or the total level, or "". */
function classText(actor, get) {
  const classes = Object.values(actor.classes ?? {})
    .map(item => `${item.name} ${num(item.system?.levels) ?? ""}`.trim());
  if (classes.length) return classes.join(" / ");
  const level = num(get("details.level"));
  return level ? `${game.i18n.localize(`${I18N}.Actors.Level`)} ${level}` : "";
}

function summarize(actor) {
  const get = path => foundry.utils.getProperty(actor.system ?? {}, path);
  const t = key => game.i18n.localize(`${I18N}.Actors.Stat.${key}`);

  const hp = num(get("attributes.hp.value"));
  const max = num(get("attributes.hp.max"));
  const temp = num(get("attributes.hp.temp")) ?? 0;
  const percent = (hp !== null && max) ? Math.min(100, Math.max(0, Math.round((hp / max) * 100))) : null;

  const stats = [];
  const add = (key, value, suffix = "") => {
    if (value !== null && value !== undefined && value !== "") stats.push({ label: t(key), value: `${value}${suffix}` });
  };
  add("ac", num(get("attributes.ac.value")));
  const init = num(get("attributes.init.total")) ?? num(get("attributes.init.mod"));
  add("init", init === null ? null : signed(init));
  const walk = num(get("attributes.movement.walk"));
  add("speed", walk, ` ${get("attributes.movement.units") ?? "ft"}`);
  add("pp", num(get("skills.prc.passive")));
  add("inv", num(get("skills.inv.passive")));
  add("ins", num(get("skills.ins.passive")));
  const dc = num(get("attributes.spell.dc")) ?? num(get("attributes.spelldc"));
  add("dc", dc || null);

  return {
    uuid: actor.uuid,
    name: actor.name,
    classText: classText(actor, get),
    hasHp: hp !== null,
    hp: hp ?? 0,
    max: max ?? 0,
    temp,
    percent: percent ?? 0,
    hpClass: percent === null ? "" : percent > 50 ? "r101-hp-high" : percent > 25 ? "r101-hp-mid" : "r101-hp-low",
    inspiration: !!get("attributes.inspiration"),
    stats,
    conditions: conditionNames(actor)
  };
}

/** Template data for the actors box (the whole box, including the list). */
export async function actorsContext(box) {
  const mode = box.data.mode === "custom" ? "custom" : "party";
  const rows = [];

  if (mode === "party") {
    for (const actor of partyActors().slice(0, MAX_ACTORS)) rows.push(safeSummary(actor));
  } else {
    const uuids = Array.isArray(box.data.uuids) ? box.data.uuids.slice(0, MAX_ACTORS) : [];
    const docs = await Promise.all(uuids.map(uuid => fromUuid(uuid).catch(() => null)));
    docs.forEach((doc, i) => {
      if (doc?.documentName === "Actor") rows.push(safeSummary(doc));
      else rows.push({ uuid: uuids[i], missing: true, name: game.i18n.localize(`${I18N}.Actors.Missing`) });
    });
  }

  return {
    name: game.i18n.localize(`${I18N}.Actors.Title`),
    isParty: mode === "party",
    editable: mode === "custom",
    rows,
    empty: !rows.length,
    emptyText: game.i18n.localize(`${I18N}.Actors.${mode === "party" ? "EmptyParty" : "EmptyCustom"}`),
    wrongSystem: game.system.id !== "dnd5e"
  };
}

/** A failure while reading one actor must not break the box. */
function safeSummary(actor) {
  try {
    return summarize(actor);
  } catch (err) {
    console.warn("roll101-dm-screen | Could not read actor", actor?.uuid, err);
    return { uuid: actor?.uuid ?? "", missing: true, name: actor?.name ?? "?" };
  }
}
