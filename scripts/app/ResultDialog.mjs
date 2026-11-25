import { I18N } from "../constants.mjs";
import { copyText, escapeHTML, rollTableByUuid, whisperToGM } from "../tables.mjs";

const { ApplicationV2 } = foundry.applications.api;

/** @type {ResultDialog|null} */
let instance = null;

/**
 * @typedef {{table: string, text: string}} HistoryEntry
 * @typedef {(entry: HistoryEntry, updated: boolean) => void} ResultCallback
 *   `updated` is true when an existing entry changed (group row reroll).
 */

/**
 * Window that shows table results.
 * Single mode: one table, Reroll adds a new history entry.
 * Group mode: every table of a folder at once. Each row can be rerolled on its own;
 * that changes the same history entry. "Reroll all" starts a new entry.
 * One shared instance: generating again replaces what is shown.
 */
export class ResultDialog extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "r101-result-dialog",
    classes: ["r101-dm-screen", "r101-result-dialog"],
    window: { title: `${I18N}.Result.Title`, icon: "fa-solid fa-dice-d20", resizable: false },
    position: { width: 380, height: "auto" },
    actions: {
      reroll: ResultDialog.#onReroll,
      rerollOne: ResultDialog.#onRerollOne,
      copy: ResultDialog.#onCopy,
      whisper: ResultDialog.#onWhisper,
      ok: ResultDialog.#onOk
    }
  };

  #group = false;
  #groupTitle = "";
  /** @type {{uuid: string, name: string, texts: string[], error: string}[]} */
  #items = [];
  /** @type {HistoryEntry|null} */
  #entry = null;
  /** @type {ResultCallback|null} */
  #onResult = null;

  /**
   * Roll one table, or every table of a group, and show the result.
   * @param {{uuids: string[], title?: string, group?: boolean, count?: number}} request
   *   `count` above 1 (single table only) rolls that many different results at once.
   * @param {ResultCallback} [onResult]
   */
  static async show({ uuids, title = "", group = false, count = 1 }, onResult) {
    if (!uuids?.length) return;
    instance ??= new ResultDialog();
    const dialog = instance;
    dialog.#group = group;
    dialog.#groupTitle = title;
    dialog.#onResult = onResult ?? null;
    dialog.#items = uuids.map(uuid => ({ uuid, count: group ? 1 : count, name: "", texts: [], error: "" }));
    await dialog.#rollAll();
    await dialog.render({ force: true, position: { width: group ? 560 : 380, height: "auto" } });
    dialog.bringToFront?.();
  }

  /**
   * Show a generated text (combat environment, random events) in the same window.
   * @param {{title: string, generate: () => Promise<{name: string, texts: string[]}>}} request
   * @param {ResultCallback} [onResult]
   */
  static async showGenerated({ title, generate }, onResult) {
    if (typeof generate !== "function") return;
    instance ??= new ResultDialog();
    const dialog = instance;
    dialog.#group = false;
    dialog.#groupTitle = title ?? "";
    dialog.#onResult = onResult ?? null;
    dialog.#items = [{ uuid: "", generate, name: title ?? "", texts: [], error: "" }];
    await dialog.#rollAll();
    await dialog.render({ force: true, position: { width: 380, height: "auto" } });
    dialog.bringToFront?.();
  }

  get title() {
    if (this.#group) return this.#groupTitle || game.i18n.localize(`${I18N}.Result.Title`);
    return this.#items[0]?.name || game.i18n.localize(`${I18N}.Result.Title`);
  }

  get #hasResult() {
    return this.#items.some(i => i.texts.length);
  }

  #joined() {
    if (!this.#group) return this.#items[0]?.texts.join("\n") ?? "";
    return this.#items.map(i => `${i.name || "?"}: ${i.texts.join(", ") || "—"}`).join("\n");
  }

  async #rollItem(item) {
    item.error = "";
    try {
      const { name, texts } = item.generate ? await item.generate() : await rollTableByUuid(item.uuid, item.count);
      item.name = name;
      item.texts = texts;
      if (!texts.length) item.error = game.i18n.localize(`${I18N}.Result.Empty`);
    } catch (err) {
      item.texts = [];
      const known = err?.message === "missing" ? "Missing" : err?.message === "empty" ? "NoEntries" : null;
      item.error = game.i18n.localize(`${I18N}.Result.${known ?? "Failed"}`);
      if (!known) console.error("roll101-dm-screen | Roll failed", err);
    }
  }

  /** Roll every item and record a new history entry. */
  async #rollAll() {
    await Promise.all(this.#items.map(i => this.#rollItem(i)));
    this.#entry = null;
    this.#report();
  }

  #report() {
    if (!this.#hasResult) return;
    const text = this.#joined();
    if (this.#entry) {
      this.#entry.text = text;
      this.#onResult?.(this.#entry, true);
      return;
    }
    this.#entry = { table: this.title, text };
    this.#onResult?.(this.#entry, false);
  }

  /** @override */
  async _renderHTML() {
    const t = key => escapeHTML(game.i18n.localize(`${I18N}.Result.${key}`));
    const disabled = this.#hasResult ? "" : "disabled";
    let body;

    if (this.#group) {
      const rows = this.#items.map((item, index) => `
        <div class="r101-group-row">
          <span class="r101-group-label">${escapeHTML(item.name || "?")}</span>
          <span class="r101-group-text${item.error ? " r101-result-error" : ""}">${escapeHTML(item.error || item.texts.join(", "))}</span>
          <button type="button" class="r101-small-button" data-action="rerollOne" data-index="${index}"
                  data-tooltip="${t("Reroll")}" aria-label="${t("Reroll")}">
            <i class="fa-solid fa-rotate" aria-hidden="true"></i>
          </button>
        </div>`).join("");
      body = `<div class="r101-group">${rows}</div>`;
    } else {
      const item = this.#items[0];
      body = item?.error
        ? `<p class="r101-result-error">${escapeHTML(item.error)}</p>`
        : `<div class="r101-result-text">${(item?.texts ?? []).map(x => `<p>${escapeHTML(x)}</p>`).join("")}</div>`;
    }

    return `
      ${body}
      <footer class="r101-result-buttons">
        <button type="button" data-action="reroll" autofocus><i class="fa-solid fa-rotate" aria-hidden="true"></i> ${t(this.#group ? "RerollAll" : "Reroll")}</button>
        <button type="button" data-action="copy" ${disabled}><i class="fa-solid fa-copy" aria-hidden="true"></i> ${t("Copy")}</button>
        <button type="button" data-action="whisper" ${disabled}><i class="fa-solid fa-user-secret" aria-hidden="true"></i> ${t("Whisper")}</button>
        <button type="button" data-action="ok"><i class="fa-solid fa-check" aria-hidden="true"></i> ${t("Ok")}</button>
      </footer>`;
  }

  /** @override */
  _replaceHTML(result, content) {
    content.innerHTML = result;
    content.querySelector("[autofocus]")?.focus();
  }

  /** @this {ResultDialog} */
  static async #onReroll(event) {
    // Ctrl+Reroll switches a single table to the multi result. Plain Reroll keeps the current mode.
    if (!this.#group && (event.ctrlKey || event.metaKey)) {
      for (const item of this.#items) if (!item.generate) item.count = MULTI_ROLL_COUNT;
    }
    await this.#rollAll();
    await this.render();
  }

  /** Reroll one row of a group. Updates the same history entry. @this {ResultDialog} */
  static async #onRerollOne(event, target) {
    const item = this.#items[Number(target.dataset.index)];
    if (!item) return;
    await this.#rollItem(item);
    this.#report();
    await this.render();
    this.element?.querySelector(`[data-action="rerollOne"][data-index="${target.dataset.index}"]`)?.focus();
  }

  /** @this {ResultDialog} */
  static async #onCopy() {
    const ok = await copyText(this.#joined());
    if (ok) ui.notifications.info(`${I18N}.Result.Copied`, { localize: true });
  }

  /** @this {ResultDialog} */
  static async #onWhisper() {
    try {
      await whisperToGM(this.title, this.#joined());
      ui.notifications.info(`${I18N}.Result.Whispered`, { localize: true });
    } catch (err) {
      console.error("roll101-dm-screen | Whisper failed", err);
    }
  }

  /** @this {ResultDialog} */
  static #onOk() {
    this.close();
  }
}
