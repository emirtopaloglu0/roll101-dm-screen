import { I18N } from "../constants.mjs";
import { generatorLanguages, loadGenerator, pickEntry, poolFor } from "../generators.mjs";
import { localize } from "../templates.mjs";
import { pickLanguage } from "./reference.mjs";

/** Most entries the box lists. The generators are far smaller; this is only a guard. */
const LIST_LIMIT = 200;

const ICONS = Object.freeze({ environment: "fa-solid fa-cloud-bolt", events: "fa-solid fa-signs-post", twists: "fa-solid fa-yin-yang" });

function languageChoices(languages, chosen) {
  if (languages.length < 2) return null;
  return [
    { id: "auto", label: game.i18n.localize(`${I18N}.Template.AutoLanguage`), selected: !chosen || chosen === "auto" },
    ...languages.map(l => ({ id: l, label: l.toUpperCase(), selected: chosen === l }))
  ];
}

/** Template data for a generator box. */
export async function generatorContext(box) {
  const gen = await loadGenerator(box.data.generator);
  if (!gen) return { missing: true };

  const languages = generatorLanguages(gen);
  const lang = pickLanguage(box.data.lang, languages);
  const L = value => localize(value, lang);
  const filter = gen.groups.some(g => g.id === box.data.filter) ? box.data.filter : "any";
  const pool = poolFor(gen, filter);
  const showGroup = new Set(pool.map(p => p.group.id)).size > 1;

  return {
    name: L(gen.title),
    icon: ICONS[box.data.generator] ?? "fa-solid fa-dice",
    filters: [
      { id: "any", label: game.i18n.localize(`${I18N}.Generator.Any`), selected: filter === "any" },
      ...gen.groups.map(g => ({ id: g.id, label: L(g.label), selected: g.id === filter }))
    ],
    langs: languageChoices(languages, box.data.lang),
    count: pool.length,
    attribution: L(gen.attribution),
    entries: pool.slice(0, LIST_LIMIT).map(({ group, entry }) => ({
      group: showGroup ? L(group.label) : "",
      text: L(entry)
    }))
  };
}

/**
 * What the result window needs to roll this box's generator.
 * Choices are read once, so rerolling keeps the filter and language the dialog opened with.
 * @returns {Promise<{title: string, generate: () => Promise<{name: string, texts: string[]}>}|null>}
 */
export async function generatorRequest(box) {
  const gen = await loadGenerator(box.data.generator);
  if (!gen) return null;
  const lang = pickLanguage(box.data.lang, generatorLanguages(gen));
  const filter = gen.groups.some(g => g.id === box.data.filter) ? box.data.filter : "any";
  const title = localize(gen.title, lang);
  return {
    title,
    generate: async () => {
      const pick = pickEntry(gen, filter, lang);
      if (!pick) throw new Error("empty");
      return { name: `${title} · ${pick.group}`, texts: [pick.text] };
    }
  };
}
