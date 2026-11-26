import { I18N } from "../constants.mjs";
import { escapeHTML } from "../tables.mjs";
import { pickFile } from "./layout-io.mjs";
import * as templates from "../templates.mjs";

/**
 * Content pack manager: import a pack file, list installed packs, remove one.
 * Packs are stored in a world setting. Boxes that use a removed pack show
 * "not found" until the pack is imported again.
 */

const { DialogV2 } = foundry.applications.api;
const MAX_PACK_BYTES = 2 * 1024 * 1024;
const L = key => game.i18n.localize(`${I18N}.Packs.${key}`);
const F = (key, data) => game.i18n.format(`${I18N}.Packs.${key}`, data);

/** @returns {Promise<boolean>} true when packs changed */
export async function managePacks() {
  const packs = templates.getPacks();
  const lang = game.i18n.lang;
  const rows = packs.length
    ? packs.map((p, i) => {
      // A long list is cut to two lines; the full list shows on hover.
      const contents = escapeHTML([...p.templates, ...(p.generators ?? [])].map(t => templates.localize(t.title, lang)).join(", "));
      return `<label class="r101-backup-row">
        <input type="radio" name="pack" value="${i}" ${i === 0 ? "checked" : ""}>
        <span class="r101-backup-time">${escapeHTML(p.name)}${p.version ? ` <small>v${escapeHTML(p.version)}</small>` : ""}</span>
        <span class="r101-backup-meta r101-pack-contents" title="${contents}">${contents}</span>
      </label>`;
    }).join("")
    : `<p class="r101-note">${escapeHTML(L("None"))}</p>`;

  const buttons = [{ action: "import", label: `${I18N}.Packs.Import`, icon: "fa-solid fa-file-import", default: true }];
  if (packs.length) {
    buttons.push({
      action: "remove",
      label: `${I18N}.Packs.Remove`,
      icon: "fa-solid fa-trash",
      callback: (event, button) => ({ remove: Number(button.form?.elements.pack?.value ?? -1) })
    });
  }

  const result = await DialogV2.wait({
    window: { title: `${I18N}.Packs.Title`, icon: "fa-solid fa-box-archive" },
    classes: ["r101-backup-dialog", "r101-packs-dialog"],
    // Fixed width: a pack with many templates must not stretch the dialog.
    position: { width: 520 },
    content: `<p>${escapeHTML(L("Content"))}</p><div class="r101-backup-list">${rows}</div>`
      + `<p class="hint">${escapeHTML(L("PrivacyHint"))}</p>`,
    buttons,
    rejectClose: false
  });

  if (result === "import") return importPack();
  if (result && Number.isInteger(result.remove) && packs[result.remove]) return removePack(packs[result.remove]);
  return false;
}

async function importPack() {
  const file = await pickFile();
  if (!file) return false;

  let parsed;
  if (file.size > MAX_PACK_BYTES) parsed = { error: "TooLarge" };
  else {
    try {
      parsed = templates.validatePack(JSON.parse(await file.text()));
    } catch {
      parsed = { error: "InvalidFile" };
    }
  }
  if (parsed.error) {
    ui.notifications.error(`${I18N}.Packs.${parsed.error}`, { localize: true });
    return false;
  }

  const pack = parsed.pack;
  const packs = templates.getPacks();
  const existing = packs.findIndex(p => p.id === pack.id);
  if (existing >= 0) {
    const ok = await DialogV2.confirm({
      window: { title: `${I18N}.Packs.ReplaceTitle` },
      content: `<p>${escapeHTML(F("ReplaceContent", { name: packs[existing].name }))}</p>`,
      rejectClose: false
    });
    if (!ok) return false;
  }

  const next = packs.filter(p => p.id !== pack.id);
  next.push(pack);
  await templates.savePacks(next);
  ui.notifications.info(F("Imported", { name: pack.name, count: pack.templates.length + pack.generators.length }));
  return true;
}

async function removePack(pack) {
  const ok = await DialogV2.confirm({
    window: { title: `${I18N}.Packs.RemoveTitle` },
    content: `<p><strong>${escapeHTML(pack.name)}</strong></p><p>${escapeHTML(L("RemoveContent"))}</p>`,
    rejectClose: false
  });
  if (!ok) return false;
  await templates.savePacks(templates.getPacks().filter(p => p.id !== pack.id));
  return true;
}
