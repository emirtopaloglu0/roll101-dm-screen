import { I18N } from "../constants.mjs";
import { DENOMS, breakdown, normalizeAmounts, split, totalCp } from "../coins.mjs";
import { getBuiltinsByCategory, getTemplate, localize, templateLanguages } from "../templates.mjs";

/**
 * Template data for the coin converter and reference template boxes.
 */

export const MAX_PARTY = 20;

/* -------------------------------------------- */
/*  Coin converter                              */
/* -------------------------------------------- */

export function coinSettings(data) {
  const party = Math.floor(Number(data?.party));
  const showPP = data?.showPP !== false;
  const showEP = data?.showEP !== false;
  // Hidden coins stay in data (shown again when re-enabled) but do not count.
  const amounts = normalizeAmounts(data?.amounts);
  if (!showPP) amounts.pp = 0;
  if (!showEP) amounts.ep = 0;
  return {
    amounts,
    showPP,
    showEP,
    party: Number.isFinite(party) ? Math.min(MAX_PARTY, Math.max(1, party)) : 1
  };
}

/** Result lines for the coin box. Used on render and on every keystroke. */
export function coinTexts({ amounts, showPP, party }) {
  const lang = game.i18n.lang;
  const num = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 });
  const coins = cp => {
    const parts = breakdown(cp, showPP);
    return parts.length ? parts.map(p => `${num.format(p.count)} ${p.key}`).join(" ") : "0 cp";
  };
  const total = totalCp(amounts);
  const { each, remainder } = split(total, party);
  return {
    total: `${num.format(total / 100)} gp · ${num.format(total)} cp`,
    coins: coins(total),
    each: coins(each),
    rest: remainder ? coins(remainder) : "—"
  };
}

export function coinsContext(box) {
  const settings = coinSettings(box.data);
  const fields = DENOMS
    .filter(d => (d.key !== "pp" || settings.showPP) && (d.key !== "ep" || settings.showEP))
    .map(d => ({
      key: d.key,
      label: game.i18n.localize(`${I18N}.Coins.Denom.${d.key}`),
      value: settings.amounts[d.key] || ""
    }));
  return {
    name: game.i18n.localize(`${I18N}.Coins.Title`),
    fields,
    showPP: settings.showPP,
    showEP: settings.showEP,
    party: settings.party,
    maxParty: MAX_PARTY,
    texts: coinTexts(settings)
  };
}

/* -------------------------------------------- */
/*  Reference templates                         */
/* -------------------------------------------- */

export function pickLanguage(chosen, available) {
  if (chosen && chosen !== "auto" && available.includes(chosen)) return chosen;
  const current = game.i18n.lang;
  if (available.includes(current)) return current;
  if (available.includes("en")) return "en";
  return available[0] ?? "en";
}

/* -------------------------------------------- */
/*  Rules glossary                              */
/* -------------------------------------------- */

export const GLOSSARY_EDITIONS = Object.freeze(["2024", "2014"]);

/**
 * Every row of every built-in rules template, for one edition, as searchable entries.
 * The first column is the term; the other columns are joined as its text.
 */
export async function glossaryContext(box) {
  const rules = await getBuiltinsByCategory("rules");
  const edition = GLOSSARY_EDITIONS.includes(box.data.variant) ? box.data.variant : GLOSSARY_EDITIONS[0];
  const languages = [...new Set(rules.flatMap(templateLanguages))];
  const lang = pickLanguage(box.data.lang, languages);
  const L = value => localize(value, lang);

  const groups = [];
  let count = 0;
  for (const template of rules) {
    const variant = template.variants.find(v => v.id === edition);
    if (!variant) continue;
    const entries = [];
    for (const section of variant.sections) {
      for (const row of section.rows) {
        const term = L(row[0]);
        const text = row.slice(1).map(L).filter(Boolean).join(" — ");
        entries.push({ term, text, section: L(section.title), search: `${term} ${text}`.toLocaleLowerCase(lang) });
      }
    }
    count += entries.length;
    groups.push({ name: L(template.title), attribution: L(variant.attribution), entries });
  }

  const chosenLang = box.data.lang && box.data.lang !== "auto" ? box.data.lang : "auto";
  return {
    name: game.i18n.localize(`${I18N}.Glossary.Title`),
    // Glossary groups start closed; the toggle-all button stores the choice.
    open: box.data.collapsed === false,
    count,
    groups,
    variants: GLOSSARY_EDITIONS.map(id => ({ id, label: id, selected: id === edition })),
    langs: languages.length > 1
      ? [
        { id: "auto", label: game.i18n.localize(`${I18N}.Template.AutoLanguage`), selected: chosenLang === "auto" },
        ...languages.map(l => ({ id: l, label: l.toUpperCase(), selected: chosenLang === l }))
      ]
      : null
  };
}

export async function templateContext(box) {
  const template = await getTemplate(box.data.template);
  if (!template) return { missing: true };

  const languages = templateLanguages(template);
  const lang = pickLanguage(box.data.lang, languages);
  const variant = template.variants.find(v => v.id === box.data.variant) ?? template.variants[0];
  const L = value => localize(value, lang);

  const variants = template.variants.length > 1
    ? template.variants.map(v => ({ id: v.id, label: L(v.label) || v.id, selected: v === variant }))
    : null;
  const chosenLang = box.data.lang && box.data.lang !== "auto" ? box.data.lang : "auto";
  const langs = languages.length > 1
    ? [
      { id: "auto", label: game.i18n.localize(`${I18N}.Template.AutoLanguage`), selected: chosenLang === "auto" },
      ...languages.map(l => ({ id: l, label: l.toUpperCase(), selected: chosenLang === l }))
    ]
    : null;

  return {
    name: L(template.title),
    variants,
    langs,
    open: box.data.collapsed !== true,
    attribution: L(variant.attribution),
    sections: variant.sections.map(s => ({
      title: L(s.title),
      columns: s.columns.map(L),
      rows: s.rows.map(r => r.map(L)),
      note: L(s.note),
      hint: L(s.hint)
    }))
  };
}
