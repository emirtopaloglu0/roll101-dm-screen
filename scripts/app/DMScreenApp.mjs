import {
  FONT_LIMITS, GRID_LIMITS, I18N, MODULE_ID, SETTINGS, TITLE_MAX_LENGTH
} from "../constants.mjs";
import * as storage from "../storage.mjs";
import { boxFromDrop } from "../boxes/drop.mjs";
import { journalContext, tableContext, tableFolderContext } from "../boxes/resolve.mjs";
import { getHistory, pushHistory } from "../history.mjs";
import { ResultDialog } from "./ResultDialog.mjs";
import { exportLayouts, importLayouts, restoreBackup } from "./layout-io.mjs";
import { managePacks } from "./packs-io.mjs";
import { MAX_ACTORS, actorsContext, partyActors } from "../boxes/actors.mjs";
import { generatorContext, generatorRequest } from "../boxes/generator.mjs";
import { lastLoot, lootContext, lootRequest } from "../boxes/loot.mjs";
import { MAX_PARTY, coinSettings, coinTexts, coinsContext, glossaryContext, templateContext } from "../boxes/reference.mjs";
import { foldSearch, listTemplates, localize as localizeText } from "../templates.mjs";
import { areaFree, cellKey, fitSpan, placeBoxes } from "../grid.mjs";
import { cloneLayout, createLayout } from "../migrate.mjs";
import { MULTI_ROLL_COUNT, copyText, escapeHTML, whisperToGM } from "../tables.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const TEMPLATES = `modules/${MODULE_ID}/templates`;
const BOX_DRAG_TYPE = "application/x-r101-box";
const TAB_DRAG_TYPE = "application/x-r101-tab";
const TAB_SWITCH_DELAY_MS = 500;
const range = n => Array.from({ length: n }, (_, i) => i + 1);
const toChoices = n => Object.fromEntries(range(n).map(i => [i, String(i)]));

/** Box type -> context builder, template key and "missing" message. */
const LINKED_TYPES = {
  journal: { build: journalContext, key: "journal", missing: `${I18N}.Missing.Journal` },
  table: { build: tableContext, key: "table", missing: `${I18N}.Missing.Table` },
  tableFolder: { build: tableFolderContext, key: "folder", missing: `${I18N}.Missing.Folder` },
  template: { build: templateContext, key: "template", missing: `${I18N}.Missing.Template` },
  glossary: { build: glossaryContext, key: "glossary", missing: `${I18N}.Missing.Template` },
  generator: { build: generatorContext, key: "generator", missing: `${I18N}.Missing.Generator` },
  actors: { build: actorsContext, key: "actors", missing: `${I18N}.Missing.Template` },
  loot: { build: lootContext, key: "loot", missing: `${I18N}.Missing.Generator` }
};

/** Actor changes that refresh a party box. Watched only while the window is open. */
const ACTOR_HOOKS = [
  "createActor", "updateActor", "deleteActor",
  "createItem", "updateItem", "deleteItem",
  "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"
];

/** Document hooks watched only while the window is open. */
const WATCHED_HOOKS = [
  "updateJournalEntry", "deleteJournalEntry",
  "createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage",
  "createRollTable", "updateRollTable", "deleteRollTable",
  "createTableResult", "updateTableResult", "deleteTableResult",
  "createFolder", "updateFolder", "deleteFolder"
];

/**
 * The DM Screen window.
 * Edits to text and font size update the DOM directly and never re-render.
 * Grid changes, adding or removing boxes and changes to linked documents re-render.
 */
export class DMScreenApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "r101-dm-screen",
    classes: ["r101-dm-screen"],
    window: {
      title: `${I18N}.Title`,
      icon: "fa-solid fa-book-open-reader",
      resizable: true,
      minimizable: true
    },
    position: { width: 960, height: 600 },
    actions: {
      addNotes: DMScreenApp.#onAddNotes,
      removeBox: DMScreenApp.#onRemoveBox,
      openDocument: DMScreenApp.#onOpenDocument,
      rollTable: DMScreenApp.#onRollTable,
      generate: DMScreenApp.#onRollTable,
      generateGroup: DMScreenApp.#onGenerateGroup,
      toggleHistory: DMScreenApp.#onToggleHistory,
      toggleSections: DMScreenApp.#onToggleSections,
      switchLayout: DMScreenApp.#onSwitchLayout,
      addLayout: DMScreenApp.#onAddLayout,
      duplicateLayout: DMScreenApp.#onDuplicateLayout,
      deleteLayout: DMScreenApp.#onDeleteLayout,
      exportLayouts: DMScreenApp.#onExport,
      importLayouts: DMScreenApp.#onImport,
      restoreBackup: DMScreenApp.#onRestore,
      managePacks: DMScreenApp.#onManagePacks,
      openLibrary: DMScreenApp.#onOpenLibrary,
      toggleCoin: DMScreenApp.#onToggleCoin,
      clearCoins: DMScreenApp.#onClearCoins,
      generateText: DMScreenApp.#onGenerateText,
      toggleActorMode: DMScreenApp.#onToggleActorMode,
      removeActor: DMScreenApp.#onRemoveActor,
      toggleActorSection: DMScreenApp.#onToggleActorSection,
      copyLoot: DMScreenApp.#onCopyLoot,
      whisperLoot: DMScreenApp.#onWhisperLoot
    }
  };

  static PARTS = {
    main: {
      template: `${TEMPLATES}/dm-screen.hbs`,
      templates: [
        `${TEMPLATES}/boxes/journal.hbs`,
        `${TEMPLATES}/boxes/table.hbs`,
        `${TEMPLATES}/boxes/folder.hbs`,
        `${TEMPLATES}/boxes/tree-node.hbs`,
        `${TEMPLATES}/boxes/history.hbs`,
        `${TEMPLATES}/boxes/coins.hbs`,
        `${TEMPLATES}/boxes/template.hbs`,
        `${TEMPLATES}/boxes/glossary.hbs`,
        `${TEMPLATES}/boxes/generator.hbs`,
        `${TEMPLATES}/boxes/actors.hbs`,
        `${TEMPLATES}/boxes/actors-list.hbs`,
        `${TEMPLATES}/boxes/loot.hbs`
      ]
    }
  };

  /** @type {[string, number][]} */
  #hooks = [];
  #renderTimer = null;
  #actorTimer = null;
  /** Boxes whose recent-results view is open. Memory only. */
  #historyOpen = new Set();
  /** Pending "open this layout" while a box hovers a tab. */
  #tabSwitch = null;

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const layout = storage.getActiveLayout();

    // Boxes that do not fit (outside the grid or overlapping) stay in data but are hidden.
    const { placed, taken, hidden: hiddenCount } = placeBoxes(layout);
    const byStart = new Map(placed.map(p => [cellKey(p.box.col, p.box.row), p]));

    // DOM order row by row, so Tab follows the visual order.
    const pending = [];
    for (const row of range(layout.rows)) {
      for (const col of range(layout.cols)) {
        const p = byStart.get(cellKey(col, row));
        if (p) {
          pending.push(this.#boxContext(p.box).then(box => ({
            col, row, colSpan: p.colSpan, rowSpan: p.rowSpan, box
          })));
        } else if (!taken.has(cellKey(col, row))) {
          pending.push(Promise.resolve({ col, row, colSpan: 1, rowSpan: 1, box: null }));
        }
      }
    }
    const cells = await Promise.all(pending);

    const data = storage.getData();
    return Object.assign(context, {
      layout,
      tabs: data.layouts.map(l => ({ id: l.id, name: l.name, active: l.id === layout.id })),
      canDeleteLayout: data.layouts.length > 1,
      cells,
      colChoices: toChoices(GRID_LIMITS.maxCols),
      rowChoices: toChoices(GRID_LIMITS.maxRows),
      font: { ...FONT_LIMITS, value: layout.fontScale, percent: Math.round(layout.fontScale * 100) },
      titleMaxLength: TITLE_MAX_LENGTH,
      hiddenText: hiddenCount ? game.i18n.format(`${I18N}.Toolbar.HiddenBoxes`, { count: hiddenCount }) : "",
      readOnly: storage.isReadOnly()
    });
  }

  async #boxContext(box) {
    const ctx = {
      id: box.id,
      type: box.type,
      title: box.title,
      placeholder: game.i18n.localize(`${I18N}.Box.UntitledNotes`)
    };
    if (box.type === "notes") {
      ctx.isNotes = true;
      ctx.text = typeof box.data.text === "string" ? box.data.text : "";
      return ctx;
    }
    if (box.type === "coins") {
      ctx.coins = coinsContext(box);
      ctx.placeholder = ctx.coins.name;
      return ctx;
    }

    const linked = LINKED_TYPES[box.type];
    if (!linked) return ctx; // Unknown type from a newer version: shown as unsupported.

    let data;
    try {
      data = await linked.build(box);
    } catch (err) {
      console.warn(`${MODULE_ID} | Could not read box ${box.id}`, err);
      data = { missing: true };
    }
    if (data.missing) {
      ctx.missing = true;
      ctx.missingText = game.i18n.localize(linked.missing);
    } else {
      ctx[linked.key] = data;
      ctx.placeholder = data.name ?? ctx.placeholder;
      if (box.type === "table" || box.type === "tableFolder" || box.type === "generator" || box.type === "loot") {
        ctx.hasHistory = true;
        ctx.history = getHistory(box.id);
        ctx.historyOpen = this.#historyOpen.has(box.id);
      }
    }
    return ctx;
  }

  /* -------------------------------------------- */
  /*  Listeners                                   */
  /* -------------------------------------------- */

  /**
   * Delegated listeners on the window element, attached once per opening.
   * @override
   */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    const el = this.element;
    el.addEventListener("input", this.#onInput.bind(this));
    el.addEventListener("change", this.#onChange.bind(this));
    el.addEventListener("keydown", this.#onKeyDown.bind(this));
    el.addEventListener("dblclick", this.#onDoubleClick.bind(this));
    el.addEventListener("dragstart", this.#onDragStart.bind(this));
    el.addEventListener("dragend", this.#onDragEnd.bind(this));
    el.addEventListener("dragover", this.#onDragOver.bind(this));
    el.addEventListener("dragleave", this.#onDragLeave.bind(this));
    el.addEventListener("drop", this.#onDrop.bind(this));
    el.addEventListener("pointerdown", this.#onPointerDown.bind(this));
    this.#watchDocuments();
    storage.beginSession();
  }

  #onInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const field = target.dataset.r101Field;
    if (field) {
      const boxId = target.closest("[data-box-id]")?.dataset.boxId;
      if (!boxId) return;
      const value = target.value;
      storage.update(() => {
        const box = this.#findBox(boxId);
        if (!box) return;
        if (field === "title") box.title = value.slice(0, TITLE_MAX_LENGTH);
        else if (field === "text") box.data.text = value;
      });
      return;
    }

    const bound = target.dataset.r101LootRange;
    if (bound === "min" || bound === "max") {
      const box = this.#findBox(target.closest("[data-box-id]")?.dataset.boxId);
      if (!box) return;
      const value = target.value;
      storage.update(() => { box.data.range = { ...(box.data.range ?? {}), [bound]: value }; });
      return;
    }

    if (target.dataset.r101Setting === "fontScale") this.#applyFontScale(target, target.value);
    else if (target.hasAttribute("data-r101-search")) this.#filterTree(target);
    else if (target.matches("[data-r101-coin], [data-r101-coin-party]")) this.#onCoinInput(target);
    else if (target.hasAttribute("data-r101-glossary-search")) this.#filterGlossary(target);
  }

  /** Rules glossary: show entries whose term or text contains the query. DOM only. */
  #filterGlossary(input) {
    const list = input.closest("[data-box-id]")?.querySelector(".r101-glossary-list");
    if (!list) return;
    const query = input.value.trim().toLocaleLowerCase(game.i18n.lang);
    for (const li of list.querySelectorAll(".r101-glossary-entry")) {
      li.hidden = !!query && !(li.dataset.search ?? "").includes(query);
    }
    // While searching, groups with matches open. An empty query restores the saved state.
    const box = this.#findBox(input.closest("[data-box-id]")?.dataset.boxId);
    const savedOpen = box?.data.collapsed === false;
    for (const group of list.querySelectorAll(".r101-glossary-group")) {
      group.hidden = !!query && !group.querySelector(".r101-glossary-entry:not([hidden])");
      group.open = query ? !group.hidden : savedOpen;
    }
  }

  /** Coin converter: save amounts and update the result lines. DOM only: no re-render. */
  #onCoinInput(input) {
    const cell = input.closest("[data-box-id]");
    const box = cell ? this.#findBox(cell.dataset.boxId) : null;
    if (!box) return;
    const amounts = {};
    for (const el of cell.querySelectorAll("[data-r101-coin]")) amounts[el.dataset.r101Coin] = el.value;
    const partyInput = cell.querySelector("[data-r101-coin-party]");
    storage.update(() => {
      box.data.amounts = { ...(box.data.amounts ?? {}), ...coinSettings({ amounts }).amounts };
      if (partyInput) box.data.party = Math.min(MAX_PARTY, Math.max(1, Math.floor(Number(partyInput.value)) || 1));
    });
    const texts = coinTexts(coinSettings(box.data));
    for (const [key, text] of Object.entries(texts)) {
      const out = cell.querySelector(`[data-r101-coin-out="${key}"]`);
      if (out) out.textContent = text;
    }
  }

  #onChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;

    const generatorKey = target.dataset.r101Generator;
    if (["filter", "lang", "mode", "tier"].includes(generatorKey)) {
      const box = this.#findBox(target.closest("[data-box-id]")?.dataset.boxId);
      if (!box) return;
      storage.update(() => { box.data[generatorKey] = target.value; });
      this.render();
      return;
    }

    const templateKey = target.dataset.r101Template;
    if (templateKey === "variant" || templateKey === "lang") {
      const box = this.#findBox(target.closest("[data-box-id]")?.dataset.boxId);
      if (!box) return;
      storage.update(() => { box.data[templateKey] = target.value; });
      this.render();
      return;
    }

    const key = target.dataset.r101Setting;
    if (key !== "cols" && key !== "rows") return;
    const max = key === "cols" ? GRID_LIMITS.maxCols : GRID_LIMITS.maxRows;
    const value = Math.min(max, Math.max(1, Number.parseInt(target.value, 10) || 1));
    storage.update(() => { storage.getActiveLayout()[key] = value; });
    this.render();
  }

  /**
   * Foundry binds Tab to "Cycle View" when focus is not in a text field, so Tab on a
   * button inside this window would jump to the canvas. Keep Tab for normal focus moves.
   */
  #onKeyDown(event) {
    if (event.key === "Tab") event.stopPropagation();
  }

  /** Double-click: a layout tab starts renaming, the text size control resets to 100%. */
  #onDoubleClick(event) {
    if (!(event.target instanceof Element)) return;
    const tab = event.target.closest(".r101-tab[data-layout-id]");
    if (tab) {
      this.#startRename(tab);
      return;
    }
    const control = event.target.closest(".r101-font");
    const input = control?.querySelector('input[type="range"]');
    if (!input) return;
    input.value = "1";
    this.#applyFontScale(input, 1);
  }

  #applyFontScale(input, value) {
    const scale = Math.min(FONT_LIMITS.max, Math.max(FONT_LIMITS.min, Number(value) || 1));
    const screen = input.closest(".r101-screen");
    screen?.style.setProperty("--r101-font-scale", String(scale));
    const output = screen?.querySelector(".r101-font-value");
    if (output) output.textContent = `${Math.round(scale * 100)}%`;
    storage.update(() => { storage.getActiveLayout().fontScale = scale; });
  }

  /**
   * Show only tables whose name contains the query. Folders without matches hide,
   * folders with matches open. DOM only: no re-render.
   */
  #filterTree(input) {
    const tree = input.closest("[data-box-id]")?.querySelector(".r101-tree");
    if (!tree) return;
    const query = input.value.trim().toLocaleLowerCase();
    for (const li of tree.querySelectorAll(".r101-tree-table")) {
      li.hidden = !!query && !(li.dataset.name ?? "").toLocaleLowerCase().includes(query);
    }
    // Reverse document order: children are processed before their parents.
    for (const li of [...tree.querySelectorAll(".r101-tree-folder")].reverse()) {
      const hasMatch = !!li.querySelector(".r101-tree-table:not([hidden])");
      li.hidden = !!query && !hasMatch;
      if (query) li.querySelector(":scope > details").open = hasMatch;
    }
  }

  /* -------------------------------------------- */
  /*  Drag and drop                               */
  /* -------------------------------------------- */

  /**
   * True while one of our boxes is being dragged. Uses the drag data type, which
   * survives a re-render (switching layouts removes the original drag handle).
   */
  #isBoxDrag(event) {
    return !!event.dataTransfer?.types?.includes(BOX_DRAG_TYPE);
  }

  /**
   * The cell under the pointer. While a box is being moved, every cell counts.
   * Otherwise text fields keep their native text drag and drop.
   */
  #dropCell(event) {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    if (!this.#isBoxDrag(event) && target.matches("input, textarea")) return null;
    return target.closest(".r101-box");
  }

  /** A layout tab under the pointer, only while a box is being moved. */
  #dropTab(event) {
    if (!this.#isBoxDrag(event) || !(event.target instanceof Element)) return null;
    return event.target.closest(".r101-tab[data-layout-id]");
  }

  /** True while one of our layout tabs is being dragged to a new position. */
  #isTabDrag(event) {
    return !!event.dataTransfer?.types?.includes(TAB_DRAG_TYPE);
  }

  #tabUnderPointer(event) {
    return event.target instanceof Element ? event.target.closest(".r101-tab[data-layout-id]") : null;
  }

  /** Move a layout tab to the position of the tab it was dropped on. */
  #reorderTabs(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    storage.update(data => {
      const from = data.layouts.findIndex(l => l.id === fromId);
      const to = data.layouts.findIndex(l => l.id === toId);
      if (from < 0 || to < 0) return;
      const [layout] = data.layouts.splice(from, 1);
      data.layouts.splice(to, 0, layout);
    });
    this.render();
  }

  /** Start moving a tab, or a box by its drag handle. */
  #onDragStart(event) {
    const dragTab = this.#tabUnderPointer(event);
    if (dragTab && event.dataTransfer) {
      event.stopPropagation();
      event.dataTransfer.setData(TAB_DRAG_TYPE, dragTab.dataset.layoutId);
      event.dataTransfer.effectAllowed = "move";
      dragTab.classList.add("r101-dragging");
      return;
    }
    const handle = event.target instanceof Element ? event.target.closest(".r101-drag-handle") : null;
    const cell = handle?.closest("[data-box-id]");
    if (!cell || !event.dataTransfer) return;
    event.stopPropagation();
    // Custom type only: other drop targets (canvas, sheets) ignore it.
    const payload = { boxId: cell.dataset.boxId, layoutId: storage.getActiveLayout().id };
    event.dataTransfer.setData(BOX_DRAG_TYPE, JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setDragImage(cell, 16, 16);
    cell.classList.add("r101-dragging");
  }

  #onDragEnd() {
    this.#cancelTabSwitch();
    for (const el of this.element.querySelectorAll(".r101-dragging, .r101-drop-target")) {
      el.classList.remove("r101-dragging", "r101-drop-target");
    }
  }

  #onDragOver(event) {
    if (this.#isTabDrag(event)) {
      const overTab = this.#tabUnderPointer(event);
      if (!overTab) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      this.#highlight(overTab);
      return;
    }
    const tab = this.#dropTab(event);
    if (tab) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      this.#highlight(tab);
      this.#scheduleTabSwitch(tab.dataset.layoutId);
      return;
    }
    const cell = this.#dropCell(event);
    if (!cell) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = this.#isBoxDrag(event) ? "move" : "copy";
    this.#highlight(cell);
  }

  #highlight(el) {
    if (el.classList.contains("r101-drop-target")) return;
    this.element.querySelector(".r101-drop-target")?.classList.remove("r101-drop-target");
    el.classList.add("r101-drop-target");
  }

  #onDragLeave(event) {
    if (this.#isTabDrag(event)) {
      const leaving = this.#tabUnderPointer(event);
      if (leaving && !leaving.contains(event.relatedTarget)) leaving.classList.remove("r101-drop-target");
      return;
    }
    const el = this.#dropTab(event) ?? this.#dropCell(event);
    if (!el || el.contains(event.relatedTarget)) return;
    el.classList.remove("r101-drop-target");
    if (el.matches(".r101-tab")) this.#cancelTabSwitch();
  }

  /** Hovering a tab with a box for a moment opens that layout. */
  #scheduleTabSwitch(layoutId) {
    if (layoutId === storage.getActiveLayout().id) return;
    if (this.#tabSwitch?.layoutId === layoutId) return;
    this.#cancelTabSwitch();
    const timer = setTimeout(() => {
      this.#tabSwitch = null;
      if (!this.rendered) return;
      storage.update(data => { data.activeLayoutId = layoutId; });
      this.render();
    }, TAB_SWITCH_DELAY_MS);
    this.#tabSwitch = { layoutId, timer };
  }

  #cancelTabSwitch() {
    if (this.#tabSwitch) clearTimeout(this.#tabSwitch.timer);
    this.#tabSwitch = null;
  }

  #readBoxDrag(event) {
    try {
      const data = JSON.parse(event.dataTransfer?.getData(BOX_DRAG_TYPE) || "null");
      return (data && typeof data.boxId === "string") ? data : null;
    } catch {
      return null;
    }
  }

  async #onDrop(event) {
    if (this.#isTabDrag(event)) {
      const overTab = this.#tabUnderPointer(event);
      if (!overTab) return;
      event.preventDefault();
      event.stopPropagation();
      overTab.classList.remove("r101-drop-target");
      this.#reorderTabs(event.dataTransfer.getData(TAB_DRAG_TYPE), overTab.dataset.layoutId);
      return;
    }
    const tab = this.#dropTab(event);
    if (tab) {
      event.preventDefault();
      event.stopPropagation();
      this.#cancelTabSwitch();
      tab.classList.remove("r101-drop-target");
      const moving = this.#readBoxDrag(event);
      if (moving) this.#moveToLayout(moving.boxId, moving.layoutId, tab.dataset.layoutId);
      return;
    }

    const cell = this.#dropCell(event);
    if (!cell) return;
    event.preventDefault();
    event.stopPropagation();
    cell.classList.remove("r101-drop-target");

    if (this.#isBoxDrag(event)) {
      this.#cancelTabSwitch();
      const moving = this.#readBoxDrag(event);
      if (moving) this.#moveBox(moving.boxId, moving.layoutId, Number(cell.dataset.col), Number(cell.dataset.row));
      return;
    }

    const dropped = await boxFromDrop(event);
    if (!dropped) return;
    if (dropped.error) {
      ui.notifications.warn(`${I18N}.Notifications.${dropped.error}`, { localize: true });
      return;
    }

    const boxId = cell.dataset.boxId;
    const col = Number(cell.dataset.col);
    const row = Number(cell.dataset.row);

    if (boxId) {
      // Dropping on a linked box of the same type reconnects it.
      const box = this.#findBox(boxId);
      if (!box || box.type !== dropped.type) {
        ui.notifications.warn(`${I18N}.Notifications.DropOccupied`, { localize: true });
        return;
      }
      if (box.type === "actors") this.#addActors(box, dropped.data.uuids);
      else storage.update(() => { box.data = dropped.data; });
    } else {
      if (!col || !row) return;
      storage.update(() => {
        const layout = storage.getActiveLayout();
        if (layout.boxes.some(b => b.col === col && b.row === row)) return;
        layout.boxes.push(this.#newBox(col, row, dropped.type, dropped.data));
      });
    }
    this.render();
  }

  /* -------------------------------------------- */
  /*  Linked document changes                     */
  /* -------------------------------------------- */

  /** Watch document hooks only while the window is open. */
  #watchDocuments() {
    this.#unwatchDocuments();
    const handler = doc => this.#onDocumentChange(doc);
    for (const name of WATCHED_HOOKS) this.#hooks.push([name, Hooks.on(name, handler)]);
    for (const name of ACTOR_HOOKS) {
      this.#hooks.push([name, Hooks.on(name, (doc, changes) => this.#onActorChange(name, doc, changes))]);
    }
  }

  #unwatchDocuments() {
    for (const [name, id] of this.#hooks) Hooks.off(name, id);
    this.#hooks = [];
    if (this.#renderTimer) clearTimeout(this.#renderTimer);
    this.#renderTimer = null;
    if (this.#actorTimer) clearTimeout(this.#actorTimer);
    this.#actorTimer = null;
  }

  /**
   * An actor, one of its items or one of its effects changed. Refresh only the party
   * boxes that show it, and only their list (not the whole window).
   */
  #onActorChange(name, doc, changes) {
    if (!this.rendered || !doc) return;
    const boxes = storage.getActiveLayout().boxes.filter(b => b.type === "actors");
    if (!boxes.length) return;
    const actor = doc.documentName === "Actor" ? doc : doc.parent;
    if (actor?.documentName !== "Actor") return;
    // Ignore actor updates that cannot change what the box shows (flags, sort, stats of others).
    if (name === "updateActor" && changes && !("system" in changes || "name" in changes || "ownership" in changes || "effects" in changes)) return;
    const shown = boxes.some(b => (b.data.mode === "custom"
      ? (Array.isArray(b.data.uuids) && b.data.uuids.includes(actor.uuid))
      : (actor.hasPlayerOwner || name === "deleteActor")));
    if (!shown) return;
    if (this.#actorTimer) clearTimeout(this.#actorTimer);
    this.#actorTimer = setTimeout(() => {
      this.#actorTimer = null;
      this.#refreshActors();
    }, 300);
  }

  /** Redraw the actor lists in place. */
  async #refreshActors() {
    if (!this.rendered) return;
    const renderTpl = foundry.applications.handlebars?.renderTemplate ?? globalThis.renderTemplate;
    for (const box of storage.getActiveLayout().boxes.filter(b => b.type === "actors")) {
      try {
        const html = await renderTpl(`${TEMPLATES}/boxes/actors-list.hbs`, await actorsContext(box));
        const list = this.element?.querySelector(`[data-box-id="${CSS.escape(box.id)}"] [data-r101-actors]`);
        if (list) list.innerHTML = html;
      } catch (err) {
        console.warn(`${MODULE_ID} | Could not refresh actors box ${box.id}`, err);
      }
    }
  }

  /** Dropped actors join a party box. A party box becomes a custom list first. */
  #addActors(box, uuids) {
    storage.update(() => {
      const current = (box.data.mode === "custom" && Array.isArray(box.data.uuids))
        ? box.data.uuids
        : partyActors().map(a => a.uuid);
      box.data = { mode: "custom", uuids: [...new Set([...current, ...uuids])].slice(0, MAX_ACTORS) };
    });
  }

  #onDocumentChange(doc) {
    if (!this.rendered || !doc) return;
    const boxes = storage.getActiveLayout().boxes;
    const uuid = doc.uuid;
    const parentUuid = doc.parent?.uuid;
    const touches = box => {
      const ref = box.data?.uuid;
      switch (doc.documentName) {
        case "JournalEntry":
          return box.type === "journal" && (ref === uuid || ref?.startsWith(`${uuid}.`));
        case "JournalEntryPage":
          return box.type === "journal" && (ref === uuid || ref === parentUuid);
        case "RollTable":
          return (box.type === "table" && ref === uuid) || box.type === "tableFolder";
        case "TableResult":
          return box.type === "table" && ref === parentUuid;
        case "Folder":
          return box.type === "tableFolder" && doc.type === "RollTable";
        default:
          return false;
      }
    };
    if (!boxes.some(touches)) return;
    // Several hooks often fire together: render once.
    if (this.#renderTimer) clearTimeout(this.#renderTimer);
    this.#renderTimer = setTimeout(() => {
      this.#renderTimer = null;
      if (this.rendered) this.render();
    }, 250);
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  /**
   * Move a box to a cell.
   * Empty cell: the box keeps its size, shrunk if it does not fit there.
   * Another box: the two swap places and sizes, so they always fit.
   */
  #moveBox(boxId, fromLayoutId, col, row) {
    const data = storage.getData();
    const target = storage.getActiveLayout();
    const source = data.layouts.find(l => l.id === fromLayoutId) ?? target;
    if (source !== target) {
      this.#moveAcross(boxId, source, target, col, row);
      return;
    }

    const { placed, taken } = placeBoxes(target);
    const me = placed.find(p => p.box.id === boxId);
    if (!me || !col || !row) return;
    const targetId = taken.get(cellKey(col, row));
    if (targetId === boxId) return;

    if (targetId) {
      const other = placed.find(p => p.box.id === targetId);
      if (!other) return;
      storage.update(() => {
        const a = { col: me.box.col, row: me.box.row, colSpan: me.colSpan, rowSpan: me.rowSpan };
        Object.assign(me.box, { col: other.box.col, row: other.box.row, colSpan: other.colSpan, rowSpan: other.rowSpan });
        Object.assign(other.box, a);
      });
    } else {
      const fit = fitSpan(target, taken, col, row, me.colSpan, me.rowSpan, boxId);
      if (!fit) return;
      storage.update(() => Object.assign(me.box, { col, row, ...fit }));
    }
    this.render();
  }

  /**
   * Move a box from another layout to a cell of the open layout.
   * Empty cell: the box goes there, shrunk if needed.
   * Another box: that box goes to the source layout, into the moved box's place.
   */
  #moveAcross(boxId, source, target, col, row) {
    const box = source.boxes.find(b => b.id === boxId);
    if (!box || !col || !row) return;
    const { placed, taken } = placeBoxes(target);
    const otherId = taken.get(cellKey(col, row));

    if (otherId) {
      const other = placed.find(p => p.box.id === otherId);
      if (!other) return;
      storage.update(() => {
        const myRect = { col: box.col, row: box.row, colSpan: box.colSpan, rowSpan: box.rowSpan };
        Object.assign(box, { col: other.box.col, row: other.box.row, colSpan: other.colSpan, rowSpan: other.rowSpan });
        Object.assign(other.box, myRect);
        source.boxes = source.boxes.filter(b => b !== box);
        target.boxes = target.boxes.filter(b => b !== other.box);
        source.boxes.push(other.box);
        target.boxes.push(box);
      });
    } else {
      const fit = fitSpan(target, taken, col, row, box.colSpan, box.rowSpan);
      if (!fit) return;
      storage.update(() => {
        Object.assign(box, { col, row, ...fit });
        source.boxes = source.boxes.filter(b => b !== box);
        target.boxes.push(box);
      });
    }
    this.render();
  }

  /** Dropped on a tab: move the box to the first free cell of that layout. */
  #moveToLayout(boxId, fromLayoutId, toLayoutId) {
    const data = storage.getData();
    const source = data.layouts.find(l => l.id === fromLayoutId);
    const target = data.layouts.find(l => l.id === toLayoutId);
    const box = source?.boxes.find(b => b.id === boxId);
    if (!box || !target || source === target) return;

    const { taken } = placeBoxes(target);
    let spot = null;
    for (let r = 1; r <= target.rows && !spot; r++) {
      for (let c = 1; c <= target.cols && !spot; c++) {
        const fit = fitSpan(target, taken, c, r, box.colSpan, box.rowSpan);
        if (fit) spot = { col: c, row: r, ...fit };
      }
    }
    if (!spot) {
      ui.notifications.warn(`${I18N}.Notifications.LayoutFull`, { localize: true });
      return;
    }
    storage.update(d => {
      Object.assign(box, spot);
      source.boxes = source.boxes.filter(b => b !== box);
      target.boxes.push(box);
      d.activeLayoutId = target.id;
    });
    this.render();
  }

  /* -------------------------------------------- */
  /*  Resize                                      */
  /* -------------------------------------------- */

  /**
   * Drag the corner handle to make a box cover more or fewer cells.
   * Preview changes only inline styles; data is saved and the window re-renders on release.
   */
  #onPointerDown(event) {
    const handle = event.target instanceof Element ? event.target.closest(".r101-resize-handle") : null;
    if (!handle || event.button !== 0) return;
    const section = handle.closest("[data-box-id]");
    const grid = this.element.querySelector(".r101-grid");
    const layout = storage.getActiveLayout();
    const box = section ? this.#findBox(section.dataset.boxId) : null;
    if (!box || !grid) return;
    event.preventDefault();
    event.stopPropagation();

    const { taken } = placeBoxes(layout);
    const rect = grid.getBoundingClientRect();
    const style = getComputedStyle(grid);
    const padL = parseFloat(style.paddingLeft) || 0;
    const padT = parseFloat(style.paddingTop) || 0;
    const gapX = parseFloat(style.columnGap) || 0;
    const gapY = parseFloat(style.rowGap) || 0;
    const cellW = (rect.width - padL - (parseFloat(style.paddingRight) || 0) - gapX * (layout.cols - 1)) / layout.cols;
    const cellH = (rect.height - padT - (parseFloat(style.paddingBottom) || 0) - gapY * (layout.rows - 1)) / layout.rows;
    const clamp = (v, max) => Math.min(max, Math.max(1, v));
    const colAt = x => clamp(Math.floor((x - rect.left - padL + gapX / 2) / (cellW + gapX)) + 1, layout.cols);
    const rowAt = y => clamp(Math.floor((y - rect.top - padT + gapY / 2) / (cellH + gapY)) + 1, layout.rows);

    let current = {
      colSpan: Number(section.dataset.colSpan) || 1,
      rowSpan: Number(section.dataset.rowSpan) || 1
    };
    const initial = { ...current };
    section.classList.add("r101-resizing");
    handle.setPointerCapture(event.pointerId);

    const onMove = ev => {
      const cs = Math.max(1, colAt(ev.clientX) - box.col + 1);
      const rs = Math.max(1, rowAt(ev.clientY) - box.row + 1);
      if (cs === current.colSpan && rs === current.rowSpan) return;
      if (!areaFree(taken, box.col, box.row, cs, rs, box.id)) return;
      current = { colSpan: cs, rowSpan: rs };
      section.style.gridColumn = `${box.col} / span ${cs}`;
      section.style.gridRow = `${box.row} / span ${rs}`;
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      section.classList.remove("r101-resizing");
      if (current.colSpan === initial.colSpan && current.rowSpan === initial.rowSpan) return;
      storage.update(() => Object.assign(box, current));
      this.render();
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  }

  /* -------------------------------------------- */
  /*  Layouts                                     */
  /* -------------------------------------------- */

  /** Replace a tab label with a text field. Enter or leaving the field saves, Escape cancels. */
  #startRename(tab) {
    const layoutId = tab.dataset.layoutId;
    const layout = storage.getData().layouts.find(l => l.id === layoutId);
    if (!layout) return;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "r101-tab-rename";
    input.value = layout.name;
    input.maxLength = TITLE_MAX_LENGTH;
    input.setAttribute("aria-label", game.i18n.localize(`${I18N}.Layout.Rename`));
    tab.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    const finish = save => {
      if (done) return;
      done = true;
      const name = input.value.trim().slice(0, TITLE_MAX_LENGTH);
      if (save && name && name !== layout.name) storage.update(() => { layout.name = name; });
      this.render();
    };
    input.addEventListener("keydown", ev => {
      ev.stopPropagation();
      if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
      else if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  }

  #findBox(boxId) {
    return storage.getActiveLayout().boxes.find(b => b.id === boxId) ?? null;
  }

  #newBox(col, row, type, data) {
    return { id: foundry.utils.randomID(), col, row, colSpan: 1, rowSpan: 1, type, title: "", data };
  }

  /**
   * Add a result to a box's recent list, or show a changed entry, without re-rendering.
   * @param {string} boxId
   * @param {{table: string, text: string}} entry
   * @param {boolean} updated  The entry is already in the list and its text changed.
   */
  #addHistory(boxId, entry, updated) {
    if (!boxId) return;
    const list = updated ? getHistory(boxId) : pushHistory(boxId, entry);
    const ul = this.element?.querySelector(`[data-box-id="${CSS.escape(boxId)}"] [data-r101-history]`);
    if (!ul) return;
    ul.replaceChildren(...list.map(item => {
      const li = document.createElement("li");
      const table = document.createElement("span");
      table.className = "r101-history-table";
      table.textContent = item.table;
      const text = document.createElement("span");
      text.className = "r101-history-text";
      text.textContent = item.text;
      li.append(table, text);
      return li;
    }));
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /** @this {DMScreenApp} */
  static #onAddNotes(event, target) {
    const cell = target.closest("[data-col]");
    const col = Number(cell?.dataset.col);
    const row = Number(cell?.dataset.row);
    if (!col || !row) return;
    storage.update(() => {
      const layout = storage.getActiveLayout();
      if (layout.boxes.some(b => b.col === col && b.row === row)) return;
      layout.boxes.push(this.#newBox(col, row, "notes", { text: "" }));
    });
    this.render();
  }

  /** @this {DMScreenApp} */
  static async #onRemoveBox(event, target) {
    const boxId = target.closest("[data-box-id]")?.dataset.boxId;
    const box = boxId ? this.#findBox(boxId) : null;
    if (!box) return;

    // Only notes hold content of their own. Linked boxes just hold a reference.
    const hasContent = box.type === "notes" && !!(box.title || box.data?.text);
    if (hasContent) {
      const confirmed = await DialogV2.confirm({
        window: { title: `${I18N}.Box.RemoveConfirmTitle` },
        content: `<p>${game.i18n.localize(`${I18N}.Box.RemoveConfirmContent`)}</p>`,
        rejectClose: false
      });
      if (!confirmed) return;
    }

    storage.snapshot("RemoveBox");
    storage.update(() => {
      const layout = storage.getActiveLayout();
      layout.boxes = layout.boxes.filter(b => b.id !== boxId);
    });
    this.render();
  }

  /** @this {DMScreenApp} */
  static #onSwitchLayout(event, target) {
    const id = target.dataset.layoutId;
    if (!id || id === storage.getData().activeLayoutId) return;
    storage.update(data => { data.activeLayoutId = id; });
    this.render();
  }

  /** @this {DMScreenApp} */
  static #onAddLayout() {
    const data = storage.getData();
    const layout = createLayout(game.i18n.format(`${I18N}.Layout.DefaultName`, { n: data.layouts.length + 1 }));
    storage.update(d => {
      d.layouts.push(layout);
      d.activeLayoutId = layout.id;
    });
    this.render();
  }

  /** @this {DMScreenApp} */
  static #onDuplicateLayout() {
    const source = storage.getActiveLayout();
    const copy = cloneLayout(source, game.i18n.format(`${I18N}.Layout.CopyName`, { name: source.name }));
    storage.update(d => {
      d.layouts.splice(d.layouts.indexOf(source) + 1, 0, copy);
      d.activeLayoutId = copy.id;
    });
    this.render();
  }

  /** @this {DMScreenApp} */
  static async #onDeleteLayout() {
    const data = storage.getData();
    const layout = storage.getActiveLayout();
    if (data.layouts.length < 2) return;
    const confirmed = await DialogV2.confirm({
      window: { title: `${I18N}.Layout.DeleteTitle` },
      content: `<p><strong>${escapeHTML(layout.name)}</strong></p><p>${game.i18n.localize(`${I18N}.Layout.DeleteContent`)}</p>`,
      rejectClose: false
    });
    if (!confirmed) return;
    storage.snapshot("DeleteLayout");
    storage.update(d => {
      const index = d.layouts.indexOf(layout);
      d.layouts = d.layouts.filter(l => l !== layout);
      d.activeLayoutId = d.layouts[Math.max(0, index - 1)].id;
    });
    this.render();
  }

  /** @this {DMScreenApp} */
  static async #onExport() {
    await storage.flush();
    await exportLayouts();
  }

  /** @this {DMScreenApp} */
  static async #onImport() {
    if (await importLayouts()) this.render();
  }

  /** @this {DMScreenApp} */
  static async #onRestore() {
    if (await restoreBackup()) this.render();
  }

  /** @this {DMScreenApp} */
  static async #onManagePacks() {
    // The pack setting's onChange re-renders the window when packs change.
    await managePacks();
  }

  /**
   * Choose what to put in an empty cell: notes, coin converter or a reference template.
   * @this {DMScreenApp}
   */
  static async #onOpenLibrary(event, target) {
    const cell = target.closest("[data-col]");
    const col = Number(cell?.dataset.col);
    const row = Number(cell?.dataset.row);
    if (!col || !row) return;

    const choice = await DialogV2.wait({
      window: { title: `${I18N}.Library.Title`, icon: "fa-solid fa-book" },
      classes: ["r101-backup-dialog", "r101-library-dialog"],
      position: { width: 460 },
      content: await this.#libraryContent(),
      buttons: [{
        action: "add",
        label: `${I18N}.Library.Add`,
        icon: "fa-solid fa-plus",
        default: true,
        callback: (ev, button) => button.form?.elements.namedItem("libraryChoice")?.value ?? null
      }],
      // v13 passes the dialog, older versions passed its element.
      render: (event, dialog) => DMScreenApp.#bindLibrary(dialog?.element ?? dialog),
      rejectClose: false
    });
    if (typeof choice !== "string" || choice === "add") return;

    let type;
    let data;
    if (choice === "notes") [type, data] = ["notes", { text: "" }];
    else if (choice === "coins") [type, data] = ["coins", { amounts: {}, showPP: true, showEP: true, party: 1 }];
    else if (choice === "glossary") [type, data] = ["glossary", { variant: "2024", lang: "auto" }];
    else if (choice.startsWith("gen:")) [type, data] = ["generator", { generator: choice.slice(4), filter: "any", lang: "auto" }];
    else if (choice === "actors") [type, data] = ["actors", { mode: "party", uuids: [] }];
    else if (choice === "loot") [type, data] = ["loot", { mode: "individual", tier: "t1", lang: "auto" }];
    else [type, data] = ["template", { template: choice, variant: null, lang: "auto" }];

    storage.update(() => {
      const layout = storage.getActiveLayout();
      if (layout.boxes.some(b => b.col === col && b.row === row)) return;
      layout.boxes.push(this.#newBox(col, row, type, data));
    });
    this.render();
  }

  /**
   * Collapse every section of a reference box, or expand all when all are closed.
   * The choice is saved so a re-render keeps it. DOM only: no re-render.
   * @this {DMScreenApp}
   */
  static #onToggleSections(event, target) {
    const cell = target.closest("[data-box-id]");
    const box = this.#findBox(cell?.dataset.boxId);
    if (!box) return;
    const sections = [...cell.querySelectorAll("details.r101-tpl-section")].filter(d => !d.hidden);
    const open = !sections.some(d => d.open);
    for (const details of sections) details.open = open;
    const icon = target.querySelector("i");
    icon?.classList.toggle("fa-angles-up", open);
    icon?.classList.toggle("fa-angles-down", !open);
    storage.update(() => { box.data.collapsed = !open; });
  }

  /**
   * Library dialog body: a search field and one collapsible group per category.
   * Tools, then built-in rules, then other built-ins, then one group per content pack
   * (sub-headed by each template's "group").
   */
  async #libraryContent() {
    const lang = game.i18n.lang;
    const t = key => escapeHTML(game.i18n.localize(`${I18N}.${key}`));
    const allText = value => (value && typeof value === "object") ? Object.values(value).join(" ") : String(value ?? "");
    let first = true;
    const row = (value, icon, label, meta, searchText) => {
      const checked = first ? "checked" : "";
      first = false;
      return `<label class="r101-backup-row" data-search="${escapeHTML(foldSearch(`${label} ${meta} ${searchText}`))}">
        <input type="radio" name="libraryChoice" value="${escapeHTML(value)}" ${checked}>
        <span class="r101-backup-time"><i class="${icon}" aria-hidden="true"></i> ${escapeHTML(label)}</span>
        ${meta ? `<span class="r101-backup-meta">${escapeHTML(meta)}</span>` : ""}
      </label>`;
    };
    const group = (icon, label, rows, open) => {
      const count = rows.filter(r => r.trimStart().startsWith("<label")).length;
      if (!count) return "";
      return `<details class="r101-library-group" ${open ? "open" : ""} data-default-open="${open}">
        <summary><i class="${icon}" aria-hidden="true"></i> ${escapeHTML(label)} <span class="r101-library-count">${count}</span></summary>
        <div class="r101-backup-list">${rows.join("")}</div>
      </details>`;
    };

    const groups = [group("fa-solid fa-toolbox", game.i18n.localize(`${I18N}.Library.Tools`), [
      row("notes", "fa-solid fa-note-sticky", game.i18n.localize(`${I18N}.Library.Notes`), game.i18n.localize(`${I18N}.Library.NotesHint`), ""),
      row("coins", "fa-solid fa-coins", game.i18n.localize(`${I18N}.Coins.Title`), game.i18n.localize(`${I18N}.Library.CoinsHint`), ""),
      row("glossary", "fa-solid fa-magnifying-glass", game.i18n.localize(`${I18N}.Glossary.Title`), game.i18n.localize(`${I18N}.Library.GlossaryHint`), "")
    ], true)];

    const lib = key => game.i18n.localize(`${I18N}.Library.${key}`);
    groups.push(group("fa-solid fa-wand-magic-sparkles", lib("Generators"), [
      row("gen:environment", "fa-solid fa-cloud-bolt", lib("Environment"), lib("EnvironmentHint"),
        "combat environment terrain hazard weather savas ortami arazi tehlike hava"),
      row("gen:events", "fa-solid fa-signs-post", lib("Events"), lib("EventsHint"),
        "random events city village town wilderness forest snow desert rastgele olaylar sehir koy kasaba orman kar col"),
      row("loot", "fa-solid fa-sack-dollar", lib("Loot"), lib("LootHint"),
        "loot treasure hoard gold coins gems magic items hazine ganimet altin"),
      row("actors", "fa-solid fa-users", lib("Actors"), lib("ActorsHint"),
        "party actor players characters summary oyuncu karakter ozet")
    ], true));

    const templates = await listTemplates();
    const byTitle = (a, b) => localizeText(a.title, lang).localeCompare(localizeText(b.title, lang), lang);
    // Search matches every language of the title, not only the shown one.
    const tplRow = tpl => row(tpl.key, "fa-solid fa-table-list", localizeText(tpl.title, lang), "",
      `${allText(tpl.title)} ${allText(tpl.group)}`);
    const builtins = templates.filter(tpl => tpl.source === "builtin");
    groups.push(group("fa-solid fa-scale-balanced", game.i18n.localize(`${I18N}.Library.Rules`),
      builtins.filter(tpl => tpl.category === "rules").sort(byTitle).map(tplRow), false));
    groups.push(group("fa-solid fa-coins", game.i18n.localize(`${I18N}.Library.Prices`),
      builtins.filter(tpl => tpl.category !== "rules").sort(byTitle).map(tplRow), false));

    // Content packs: one group each, templates sorted under their sub-heading.
    const packs = new Map();
    for (const tpl of templates) {
      if (tpl.source === "builtin") continue;
      if (!packs.has(tpl.packId)) packs.set(tpl.packId, { name: tpl.source, items: [] });
      packs.get(tpl.packId).items.push(tpl);
    }
    for (const { name, items } of packs.values()) {
      const sub = tpl => localizeText(tpl.group, lang);
      items.sort((a, b) => sub(a).localeCompare(sub(b), lang) || byTitle(a, b));
      const rows = [];
      let heading = "";
      for (const tpl of items) {
        if (sub(tpl) && sub(tpl) !== heading) {
          heading = sub(tpl);
          rows.push(`<p class="r101-library-sub">${escapeHTML(heading)}</p>`);
        }
        rows.push(tplRow(tpl));
      }
      groups.push(group("fa-solid fa-box-archive", name, rows, false));
    }

    return `<div class="r101-library">
      <input type="search" class="r101-library-search" placeholder="${t("Library.Search")}" aria-label="${t("Library.Search")}">
      <div class="r101-library-list">${groups.join("")}</div>
      <p class="r101-library-empty hint" hidden>${t("Library.NoMatch")}</p>
    </div>
    <p class="hint">${t("Library.PacksHint")}</p>`;
  }

  /** Library search: filter rows, hide empty groups, open groups with matches. DOM only. */
  static #bindLibrary(root) {
    const el = root instanceof HTMLElement ? root : root?.[0];
    const input = el?.querySelector(".r101-library-search");
    if (!input) return;
    const groups = [...el.querySelectorAll(".r101-library-group")];
    const empty = el.querySelector(".r101-library-empty");

    input.addEventListener("input", () => {
      const words = foldSearch(input.value).split(/\s+/).filter(Boolean);
      let any = false;
      for (const details of groups) {
        let matches = 0;
        for (const label of details.querySelectorAll(".r101-backup-row")) {
          const hit = words.every(w => label.dataset.search.includes(w));
          label.hidden = !hit;
          if (hit) matches++;
        }
        // A sub-heading shows when a row after it (before the next heading) is visible.
        for (const sub of details.querySelectorAll(".r101-library-sub")) {
          let next = sub.nextElementSibling;
          let visible = false;
          while (next && !next.matches(".r101-library-sub")) {
            if (!next.hidden) { visible = true; break; }
            next = next.nextElementSibling;
          }
          sub.hidden = !visible;
        }
        details.hidden = matches === 0;
        details.open = words.length ? matches > 0 : details.dataset.defaultOpen === "true";
        if (matches) any = true;
      }
      if (empty) empty.hidden = any;
      // Keep the selection on a visible row so Add never picks a hidden one.
      const radios = [...el.querySelectorAll('input[name="libraryChoice"]')];
      const checked = radios.find(r => r.checked);
      if (!checked || checked.closest("[hidden]")) {
        const firstVisible = radios.find(r => !r.closest("[hidden]"));
        if (firstVisible) firstVisible.checked = true;
      }
    });

    // Enter in the search field adds the selected row.
    input.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      el.querySelector('button[data-action="add"]')?.click();
    });

    // Double-click a row to add it at once.
    el.addEventListener("dblclick", event => {
      const label = event.target instanceof Element ? event.target.closest(".r101-backup-row") : null;
      if (!label) return;
      label.querySelector("input").checked = true;
      el.querySelector('button[data-action="add"]')?.click();
    });

    input.focus();
  }

  /** Show or hide platinum or electrum in a coin box. @this {DMScreenApp} */
  static #onToggleCoin(event, target) {
    const box = this.#findBox(target.closest("[data-box-id]")?.dataset.boxId);
    const denom = target.dataset.denom;
    if (!box || (denom !== "pp" && denom !== "ep")) return;
    const key = denom === "pp" ? "showPP" : "showEP";
    storage.update(() => { box.data[key] = box.data[key] === false; });
    this.render();
  }

  /** @this {DMScreenApp} */
  static #onClearCoins(event, target) {
    const box = this.#findBox(target.closest("[data-box-id]")?.dataset.boxId);
    if (!box) return;
    storage.update(() => { box.data.amounts = {}; });
    this.render();
  }

  /** @this {DMScreenApp} */
  static async #onOpenDocument(event, target) {
    let doc = null;
    try { doc = await fromUuid(target.dataset.uuid); } catch { doc = null; }
    if (!doc) {
      ui.notifications.warn(`${I18N}.Notifications.NotFound`, { localize: true });
      this.render();
      return;
    }
    if (doc.documentName === "JournalEntryPage") doc.parent.sheet.render({ force: true, pageId: doc.id });
    else doc.sheet?.render({ force: true });
  }

  /** Roll a table (table box) or a table from a folder tree (generator). @this {DMScreenApp} */
  static #onRollTable(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    const boxId = target.closest("[data-box-id]")?.dataset.boxId;
    // Ctrl (Cmd on Mac) + click: several different results at once.
    const count = event.ctrlKey || event.metaKey ? MULTI_ROLL_COUNT : 1;
    ResultDialog.show({ uuids: [uuid], count }, (entry, updated) => this.#addHistory(boxId, entry, updated));
  }

  /**
   * Roll every table directly inside a folder (not its subfolders) into one result.
   * The button sits in the box toolbar (root folder) or in a folder's summary row.
   * @this {DMScreenApp}
   */
  static #onGenerateGroup(event, target) {
    // A click inside <summary> would also open or close the folder.
    event.preventDefault();
    event.stopPropagation();
    const cell = target.closest("[data-box-id]");
    const list = target.closest(".r101-tree-folder")?.querySelector(":scope > details > .r101-tree-list")
      ?? cell?.querySelector(".r101-tree > .r101-tree-list");
    if (!list) return;
    const uuids = [...list.querySelectorAll(":scope > .r101-tree-table > button[data-uuid]")].map(b => b.dataset.uuid);
    if (!uuids.length) return;
    const boxId = cell?.dataset.boxId;
    ResultDialog.show(
      { uuids, title: target.dataset.name ?? "", group: true },
      (entry, updated) => this.#addHistory(boxId, entry, updated)
    );
  }

  /** Generate one result from a generator box (combat environment, random events). @this {DMScreenApp} */
  static async #onGenerateText(event, target) {
    const box = this.#findBox(target.closest("[data-box-id]")?.dataset.boxId);
    if (!box) return;
    const request = await (box.type === "loot" ? lootRequest(box) : generatorRequest(box));
    if (!request) {
      ui.notifications.warn(`${I18N}.Missing.Generator`, { localize: true });
      return;
    }
    if (box.type !== "loot") {
      ResultDialog.showGenerated(request, (entry, updated) => this.#addHistory(box.id, entry, updated));
      return;
    }
    // Loot shows in the box itself. A new roll replaces the last one.
    const { texts } = await request.generate();
    lastLoot.set(box.id, texts);
    const out = this.element?.querySelector(`[data-box-id="${CSS.escape(box.id)}"] [data-r101-loot-result]`);
    out?.replaceChildren(...texts.map(line => {
      const p = document.createElement("p");
      p.textContent = line;
      return p;
    }));
    this.#addHistory(box.id, { table: request.title, text: texts.join("; ") }, false);
  }

  /** @this {DMScreenApp} */
  static async #onCopyLoot(event, target) {
    const lines = lastLoot.get(target.closest("[data-box-id]")?.dataset.boxId);
    if (!lines?.length) return;
    if (await copyText(lines.join("\n"))) ui.notifications.info(`${I18N}.Result.Copied`, { localize: true });
  }

  /** @this {DMScreenApp} */
  static async #onWhisperLoot(event, target) {
    const lines = lastLoot.get(target.closest("[data-box-id]")?.dataset.boxId);
    if (!lines?.length) return;
    try {
      await whisperToGM(game.i18n.localize(`${I18N}.Loot.Title`), lines.join("\n"));
      ui.notifications.info(`${I18N}.Result.Whispered`, { localize: true });
    } catch (err) {
      console.error(`${MODULE_ID} | Whisper failed`, err);
    }
  }

  /** Party box: switch between all player characters and a hand-picked list. @this {DMScreenApp} */
  static #onToggleActorMode(event, target) {
    const box = this.#findBox(target.closest("[data-box-id]")?.dataset.boxId);
    if (!box) return;
    storage.update(() => {
      if (box.data.mode === "custom") {
        box.data = { mode: "party", uuids: Array.isArray(box.data.uuids) ? box.data.uuids : [] };
      } else {
        const kept = Array.isArray(box.data.uuids) ? box.data.uuids : [];
        box.data = { mode: "custom", uuids: kept.length ? kept : partyActors().map(a => a.uuid).slice(0, MAX_ACTORS) };
      }
    });
    this.render();
  }

  /** Group actors: show or hide their coins or member list. @this {DMScreenApp} */
  static #onToggleActorSection(event, target) {
    const box = this.#findBox(target.closest("[data-box-id]")?.dataset.boxId);
    const section = target.dataset.section;
    if (!box || (section !== "currency" && section !== "members")) return;
    storage.update(() => {
      const show = { currency: true, members: true, ...(box.data.show ?? {}) };
      show[section] = !show[section];
      box.data.show = show;
    });
    this.render();
  }

  /** Remove one actor from a hand-picked list. @this {DMScreenApp} */
  static #onRemoveActor(event, target) {
    const box = this.#findBox(target.closest("[data-box-id]")?.dataset.boxId);
    const uuid = target.dataset.uuid;
    if (!box || box.data.mode !== "custom" || !uuid) return;
    storage.update(() => { box.data.uuids = (box.data.uuids ?? []).filter(u => u !== uuid); });
    this.render();
  }

  /** Switch a box between its content and its recent results. DOM only. @this {DMScreenApp} */
  static #onToggleHistory(event, target) {
    const cell = target.closest("[data-box-id]");
    const boxId = cell?.dataset.boxId;
    if (!boxId) return;
    const open = cell.classList.toggle("r101-show-history");
    target.setAttribute("aria-pressed", String(open));
    if (open) this.#historyOpen.add(boxId);
    else this.#historyOpen.delete(boxId);
  }

  /* -------------------------------------------- */
  /*  Close                                       */
  /* -------------------------------------------- */

  /** Stop watching documents, save pending edits and remember the window position. @override */
  _onClose(options) {
    super._onClose(options);
    this.#unwatchDocuments();
    this.#cancelTabSwitch();
    storage.flush();
    const { left, top, width, height } = this.position;
    game.settings.set(MODULE_ID, SETTINGS.WINDOW, { left, top, width, height }).catch(() => {});
  }
}
