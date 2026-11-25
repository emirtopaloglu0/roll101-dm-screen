import { I18N } from "../constants.mjs";
import { LOOT_LANGS, LOOT_MODES, LOOT_TIERS, cleanRange, generateLoot, loadLoot } from "../loot.mjs";
import { localize } from "../templates.mjs";
import { pickLanguage } from "./reference.mjs";

/** Last result of each loot box. Memory only: a new roll replaces it, closing the window clears it. */
export const lastLoot = new Map();

const choose = (value, list) => (list.includes(value) ? value : list[0]);
const t = key => game.i18n.localize(`${I18N}.Loot.${key}`);

/** Template data for a loot box. */
export async function lootContext(box) {
  const data = await loadLoot();
  if (!data) return { missing: true };
  const mode = choose(box.data.mode, LOOT_MODES);
  const tier = choose(box.data.tier, LOOT_TIERS);
  const lang = pickLanguage(box.data.lang, LOOT_LANGS);
  const chosenLang = box.data.lang && box.data.lang !== "auto" ? box.data.lang : "auto";
  return {
    name: t("Title"),
    modes: LOOT_MODES.map(id => ({ id, label: t(`Mode.${id}`), selected: id === mode })),
    tiers: LOOT_TIERS.map(id => ({ id, label: t(`Tier.${id}`), selected: id === tier })),
    langs: [
      { id: "auto", label: game.i18n.localize(`${I18N}.Template.AutoLanguage`), selected: chosenLang === "auto" },
      ...LOOT_LANGS.map(l => ({ id: l, label: l.toUpperCase(), selected: chosenLang === l }))
    ],
    range: { min: box.data.range?.min ?? "", max: box.data.range?.max ?? "" },
    result: lastLoot.get(box.id) ?? [],
    attribution: localize(data.attribution, lang)
  };
}

/**
 * What a roll needs. Choices are read when the button is pressed.
 * @returns {Promise<{title: string, generate: () => Promise<{name: string, texts: string[]}>}|null>}
 */
export async function lootRequest(box) {
  const data = await loadLoot();
  if (!data) return null;
  const mode = choose(box.data.mode, LOOT_MODES);
  const tier = choose(box.data.tier, LOOT_TIERS);
  const lang = pickLanguage(box.data.lang, LOOT_LANGS);
  const range = cleanRange(box.data.range);
  const title = `${t("Title")} · ${t(`Mode.${mode}`)} · ${t(`Tier.${tier}`)}`;
  return {
    title,
    generate: async () => ({ name: title, texts: generateLoot(data, { mode, tier, range }, lang) })
  };
}
