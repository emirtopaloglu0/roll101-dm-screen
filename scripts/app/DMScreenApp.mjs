import {
  FONT_LIMITS, GRID_LIMITS, I18N, MODULE_ID, SETTINGS, TITLE_MAX_LENGTH
} from "../constants.mjs";
import * as storage from "../storage.mjs";
import { boxFromDrop } from "../boxes/drop.mjs";
import { journalContext, tableContext, tableFolderContext } from "../boxes/resolve.mjs";
import { getHistory, pushHistory } from "../history.mjs";
import { ResultDialog } from "./ResultDialog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const TEMPLATES = `modules/${MODULE_ID}/templates`;
const BOX_DRAG_TYPE = "application/x-r101-box";
const range = n => Array.from({ length: n }, (_, i) => i + 1);
const toChoices = n => Object.fromEntries(range(n).map(i => [i, String(i)]));

/** Box type -> context builder, template key and "missing" message. */
const LINKED_TYPES = {
  journal: { build: journalContext, key: "journal", missing: `${I18N}.Missing.Journal` },
  table: { build: tableContext, key: "table", missing: `${I18N}.Missing.Table` },
  tableFolder: { build: tableFolderContext, key: "folder", missing: `${I18N}.Missing.Folder` }
};

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
      toggleHistory: DMScreenApp.#onToggleHistory
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
        `${TEMPLATES}/boxes/history.hbs`
      ]
    }
  };

  /** @type {[string, number][]} */
  #hooks = [];
  #renderTimer = null;
  /** Boxes whose recent-results view is open. Memory only. */
  #historyOpen = new Set();
  /** Box being moved by its drag handle. */
  #draggingBoxId = null;

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const layout = storage.getActiveLayout();

    // First box wins a cell. Extra boxes and boxes outside the grid stay in data.
    const byCell = new Map();
    for (const box of layout.boxes) {
      const key = `${box.col}:${box.row}`;
      if (!byCell.has(key)) byCell.set(key, box);
    }

    const pending = [];
    for (const row of range(layout.rows)) {
      for (const col of range(layout.cols)) {
        const box = byCell.get(`${col}:${row}`);
        pending.push(box
          ? this.#boxContext(box).then(ctx => ({ col, row, box: ctx }))
          : Promise.resolve({ col, row, box: null }));
      }
    }
    const cells = await Promise.all(pending);
    const visible = cells.filter(c => c.box).length;
    const hiddenCount = layout.boxes.length - visible;

    return Object.assign(context, {
      layout,
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
      if (box.type === "table" || box.type === "tableFolder") {
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
    this.#watchDocuments();
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

    if (target.dataset.r101Setting === "fontScale") this.#applyFontScale(target, target.value);
    else if (target.hasAttribute("data-r101-search")) this.#filterTree(target);
  }

  #onChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
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

  /** Double-click on the text size control resets it to 100%. */
  #onDoubleClick(event) {
    const control = event.target instanceof Element ? event.target.closest(".r101-font") : null;
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
   * The cell under the pointer. While a box is being moved, every cell counts.
   * Otherwise text fields keep their native text drag and drop.
   */
  #dropCell(event) {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    if (!this.#draggingBoxId && target.matches("input, textarea")) return null;
    return target.closest(".r101-box");
  }

  /** Start moving a box by its drag handle. */
  #onDragStart(event) {
    const handle = event.target instanceof Element ? event.target.closest(".r101-drag-handle") : null;
    const cell = handle?.closest("[data-box-id]");
    if (!cell || !event.dataTransfer) return;
    event.stopPropagation();
    this.#draggingBoxId = cell.dataset.boxId;
    // Custom type only: other drop targets (canvas, sheets) ignore it.
    event.dataTransfer.setData(BOX_DRAG_TYPE, cell.dataset.boxId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setDragImage(cell, 16, 16);
    cell.classList.add("r101-dragging");
  }

  #onDragEnd() {
    this.#draggingBoxId = null;
    for (const el of this.element.querySelectorAll(".r101-dragging, .r101-drop-target")) {
      el.classList.remove("r101-dragging", "r101-drop-target");
    }
  }

  #onDragOver(event) {
    const cell = this.#dropCell(event);
    if (!cell) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = this.#draggingBoxId ? "move" : "copy";
    if (!cell.classList.contains("r101-drop-target")) {
      this.element.querySelector(".r101-drop-target")?.classList.remove("r101-drop-target");
      cell.classList.add("r101-drop-target");
    }
  }

  #onDragLeave(event) {
    const cell = this.#dropCell(event);
    if (cell && !cell.contains(event.relatedTarget)) cell.classList.remove("r101-drop-target");
  }

  async #onDrop(event) {
    const cell = this.#dropCell(event);
    if (!cell) return;
    event.preventDefault();
    event.stopPropagation();
    cell.classList.remove("r101-drop-target");

    const movingId = this.#draggingBoxId || event.dataTransfer?.getData(BOX_DRAG_TYPE);
    if (movingId) {
      this.#draggingBoxId = null;
      this.#moveBox(movingId, Number(cell.dataset.col), Number(cell.dataset.row));
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
      storage.update(() => { box.data = dropped.data; });
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
  }

  #unwatchDocuments() {
    for (const [name, id] of this.#hooks) Hooks.off(name, id);
    this.#hooks = [];
    if (this.#renderTimer) clearTimeout(this.#renderTimer);
    this.#renderTimer = null;
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

  /** Move a box to a cell. If another box is there, the two swap places. */
  #moveBox(boxId, col, row) {
    const box = this.#findBox(boxId);
    if (!box || !col || !row || (box.col === col && box.row === row)) return;
    storage.update(() => {
      const other = storage.getActiveLayout().boxes.find(b => b.col === col && b.row === row);
      if (other) {
        other.col = box.col;
        other.row = box.row;
      }
      box.col = col;
      box.row = row;
    });
    this.render();
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

    storage.update(() => {
      const layout = storage.getActiveLayout();
      layout.boxes = layout.boxes.filter(b => b.id !== boxId);
    });
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
    ResultDialog.show({ uuids: [uuid] }, (entry, updated) => this.#addHistory(boxId, entry, updated));
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
    storage.flush();
    const { left, top, width, height } = this.position;
    game.settings.set(MODULE_ID, SETTINGS.WINDOW, { left, top, width, height }).catch(() => {});
  }
}
