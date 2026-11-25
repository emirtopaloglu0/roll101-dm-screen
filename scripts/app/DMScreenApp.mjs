import {
  FONT_LIMITS, GRID_LIMITS, I18N, MODULE_ID, SETTINGS, TITLE_MAX_LENGTH
} from "../constants.mjs";
import * as storage from "../storage.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const range = n => Array.from({ length: n }, (_, i) => i + 1);
const toChoices = n => Object.fromEntries(range(n).map(i => [i, String(i)]));

/**
 * The DM Screen window.
 * Edits to text and font size update the DOM directly and never re-render.
 * Only grid changes and adding or removing boxes re-render.
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
      removeBox: DMScreenApp.#onRemoveBox
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/dm-screen.hbs` }
  };

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

    const cells = [];
    let visible = 0;
    for (const row of range(layout.rows)) {
      for (const col of range(layout.cols)) {
        const box = byCell.get(`${col}:${row}`);
        if (box) visible += 1;
        cells.push({ col, row, box: box ? this.#boxContext(box) : null });
      }
    }
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

  #boxContext(box) {
    return {
      id: box.id,
      title: box.title,
      isNotes: box.type === "notes",
      text: typeof box.data.text === "string" ? box.data.text : ""
    };
  }

  /**
   * Delegated listeners, attached once. The window element survives re-renders,
   * so listeners are never duplicated.
   * @override
   */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.element.addEventListener("input", this.#onInput.bind(this));
    this.element.addEventListener("change", this.#onChange.bind(this));
    this.element.addEventListener("keydown", this.#onKeyDown.bind(this));
    this.element.addEventListener("dblclick", this.#onDoubleClick.bind(this));
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

  #onInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const field = target.dataset.r101Field;
    if (field) {
      const boxId = target.closest("[data-box-id]")?.dataset.boxId;
      if (!boxId) return;
      const value = target.value;
      storage.update(() => {
        const box = storage.getActiveLayout().boxes.find(b => b.id === boxId);
        if (!box) return;
        if (field === "title") box.title = value.slice(0, TITLE_MAX_LENGTH);
        else if (field === "text") box.data.text = value;
      });
      return;
    }

    if (target.dataset.r101Setting === "fontScale") this.#applyFontScale(target, target.value);
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

  /** @this {DMScreenApp} */
  static #onAddNotes(event, target) {
    const cell = target.closest("[data-col]");
    const col = Number(cell?.dataset.col);
    const row = Number(cell?.dataset.row);
    if (!col || !row) return;
    storage.update(() => {
      const layout = storage.getActiveLayout();
      if (layout.boxes.some(b => b.col === col && b.row === row)) return;
      layout.boxes.push({
        id: foundry.utils.randomID(),
        col, row, colSpan: 1, rowSpan: 1,
        type: "notes",
        title: "",
        data: { text: "" }
      });
    });
    this.render();
  }

  /** @this {DMScreenApp} */
  static async #onRemoveBox(event, target) {
    const boxId = target.closest("[data-box-id]")?.dataset.boxId;
    if (!boxId) return;
    const box = storage.getActiveLayout().boxes.find(b => b.id === boxId);
    if (!box) return;

    const hasContent = !!(box.title || box.data?.text);
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

  /** Save pending edits and remember the window position. @override */
  _onClose(options) {
    super._onClose(options);
    storage.flush();
    const { left, top, width, height } = this.position;
    game.settings.set(MODULE_ID, SETTINGS.WINDOW, { left, top, width, height }).catch(() => {});
  }
}
