import { I18N, MODULE_ID, SCHEMA_VERSION } from "../constants.mjs";
import * as storage from "../storage.mjs";
import { listBackups } from "../backups.mjs";
import { cloneLayout, parseExport } from "../migrate.mjs";
import { escapeHTML } from "../tables.mjs";

/**
 * Export, import and backup restore dialogs. Each function returns true when
 * the screen data changed and the window should re-render.
 */

const { DialogV2 } = foundry.applications.api;
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const L = key => game.i18n.localize(`${I18N}.${key}`);
const F = (key, data) => game.i18n.format(`${I18N}.${key}`, data);

function saveFile(text, filename) {
  const save = foundry.utils.saveDataToFile ?? globalThis.saveDataToFile;
  save(text, "application/json", filename);
}

function slug(name) {
  const s = typeof name.slugify === "function"
    ? name.slugify({ strict: true })
    : name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return s || "layout";
}

/* -------------------------------------------- */
/*  Export                                      */
/* -------------------------------------------- */

export async function exportLayouts() {
  const data = storage.getData();
  const active = storage.getActiveLayout();
  const choice = await DialogV2.wait({
    window: { title: `${I18N}.IO.ExportTitle`, icon: "fa-solid fa-file-export" },
    content: `<p>${escapeHTML(L("IO.ExportContent"))}</p>`,
    buttons: [
      { action: "current", label: F("IO.ExportCurrent", { name: active.name }), icon: "fa-solid fa-table-cells", default: true },
      { action: "all", label: F("IO.ExportAll", { count: data.layouts.length }), icon: "fa-solid fa-layer-group" }
    ],
    rejectClose: false
  });
  if (choice !== "current" && choice !== "all") return false;

  const layouts = choice === "all" ? data.layouts : [active];
  const payload = {
    module: MODULE_ID,
    kind: "layouts",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    layouts
  };
  const filename = choice === "all" ? "dm-screen-all-layouts.json" : `dm-screen-${slug(active.name)}.json`;
  saveFile(JSON.stringify(payload, null, 2), filename);
  return false;
}

/* -------------------------------------------- */
/*  Import                                      */
/* -------------------------------------------- */

/** Ask the user for one .json file. Resolves null when cancelled. */
export function pickFile() {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

function uniqueName(name, taken) {
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name} (${n})`)) n += 1;
  return `${name} (${n})`;
}

export async function importLayouts() {
  if (storage.isReadOnly()) return false;
  const file = await pickFile();
  if (!file) return false;

  let parsed;
  if (file.size > MAX_IMPORT_BYTES) parsed = { error: "TooLarge" };
  else {
    try {
      parsed = parseExport(JSON.parse(await file.text()));
    } catch {
      parsed = { error: "InvalidFile" };
    }
  }
  if (parsed.error) {
    ui.notifications.error(`${I18N}.IO.${parsed.error}`, { localize: true });
    return false;
  }

  const names = parsed.layouts.map(l => `<li>${escapeHTML(l.name)}</li>`).join("");
  const mode = await DialogV2.wait({
    window: { title: `${I18N}.IO.ImportTitle`, icon: "fa-solid fa-file-import" },
    content: `<p>${escapeHTML(F("IO.ImportContent", { count: parsed.layouts.length }))}</p><ul>${names}</ul>`
      + `<p class="hint">${escapeHTML(L("IO.ImportHint"))}</p>`,
    buttons: [
      { action: "merge", label: `${I18N}.IO.ImportMerge`, icon: "fa-solid fa-plus", default: true },
      { action: "replace", label: `${I18N}.IO.ImportReplace`, icon: "fa-solid fa-right-left" }
    ],
    rejectClose: false
  });
  if (mode !== "merge" && mode !== "replace") return false;

  const current = storage.getData();
  let imported;
  if (mode === "replace") {
    imported = parsed.layouts.map(l => cloneLayout(l));
    storage.replaceData({ ...current, layouts: imported, activeLayoutId: imported[0].id }, "Import");
  } else {
    storage.snapshot("Import");
    const taken = new Set(current.layouts.map(l => l.name));
    imported = parsed.layouts.map(l => {
      const copy = cloneLayout(l, uniqueName(l.name, taken));
      taken.add(copy.name);
      return copy;
    });
    storage.update(data => {
      data.layouts.push(...imported);
      data.activeLayoutId = imported[0].id;
    });
  }
  ui.notifications.info(F("IO.Imported", { count: imported.length }));
  return true;
}

/* -------------------------------------------- */
/*  Restore                                     */
/* -------------------------------------------- */

export async function restoreBackup() {
  if (storage.isReadOnly()) return false;
  const backups = listBackups();
  if (!backups.length) {
    ui.notifications.info(`${I18N}.Backup.None`, { localize: true });
    return false;
  }

  const lang = game.i18n.lang;
  const rows = backups.map((b, i) => {
    const time = new Date(b.time).toLocaleString(lang);
    const layouts = b.data.layouts?.length ?? 0;
    const boxes = (b.data.layouts ?? []).reduce((n, l) => n + (l.boxes?.length ?? 0), 0);
    const reasonKey = `${I18N}.Backup.Reason.${b.reason}`;
    const reason = game.i18n.has(reasonKey) ? game.i18n.localize(reasonKey) : "";
    return `<label class="r101-backup-row">
      <input type="radio" name="backup" value="${i}" ${i === 0 ? "checked" : ""}>
      <span class="r101-backup-time">${escapeHTML(time)}</span>
      <span class="r101-backup-meta">${escapeHTML(F("Backup.Meta", { layouts, boxes }))}${reason ? ` · ${escapeHTML(reason)}` : ""}</span>
    </label>`;
  }).join("");

  const index = await DialogV2.wait({
    window: { title: `${I18N}.Backup.Title`, icon: "fa-solid fa-clock-rotate-left" },
    classes: ["r101-backup-dialog"],
    content: `<p>${escapeHTML(L("Backup.Content"))}</p><div class="r101-backup-list">${rows}</div>`,
    buttons: [{
      action: "restore",
      label: `${I18N}.Backup.Restore`,
      icon: "fa-solid fa-clock-rotate-left",
      default: true,
      callback: (event, button) => Number(button.form?.elements.backup?.value ?? -1)
    }],
    rejectClose: false
  });
  const backup = Number.isInteger(index) ? backups[index] : null;
  if (!backup) return false;

  if (!storage.replaceData(backup.data, "Restore")) return false;
  ui.notifications.info(`${I18N}.Backup.Restored`, { localize: true });
  return true;
}
