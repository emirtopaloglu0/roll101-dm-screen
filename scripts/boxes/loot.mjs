import { I18N } from "../constants.mjs";
import { LOOT_LANGS, LOOT_MODES, LOOT_TIERS, generateLoot, loadLoot } from "../loot.mjs";
import { localize } from "../templates.mjs";
import { pickLanguage } from "./reference.mjs";

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
    hint: t(`Hint.${mode}`),
    attribution: localize(data.attribution, lang)
  };
}

/**
 * What the result window needs to roll this box's loot.
 * Choices are read once, so rerolling keeps what the dialog opened with.
 */
export async function lootRequest(box) {
  const data = await loadLoot();
  if (!data) return null;
  const mode = choose(box.data.mode, LOOT_MODES);
  const tier = choose(box.data.tier, LOOT_TIERS);
  const lang = pickLanguage(box.data.lang, LOOT_LANGS);
  const title = `${t("Title")} · ${t(`Mode.${mode}`)} · ${t(`Tier.${tier}`)}`;
  return {
    title,
    generate: async () => ({ name: title, texts: generateLoot(data, { mode, tier }, lang) })
  };
}
