import {
  DEFAULT_GRID, FONT_LIMITS, GRID_LIMITS, SCHEMA_VERSION, TITLE_MAX_LENGTH
} from "./constants.mjs";

/**
 * Migrations keyed by the version they upgrade FROM.
 * Each function receives data at version N and returns data at version N + 1.
 */
const MIGRATIONS = {};

const randomId = () => foundry.utils.randomID();

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const isObject = value => !!value && (typeof value === "object") && !Array.isArray(value);

export function createLayout(name = "Main") {
  return {
    id: randomId(),
    name,
    cols: DEFAULT_GRID.cols,
    rows: DEFAULT_GRID.rows,
    fontScale: 1,
    boxes: []
  };
}

export function createDefaultData() {
  const layout = createLayout();
  return { schemaVersion: SCHEMA_VERSION, activeLayoutId: layout.id, layouts: [layout] };
}

function normalizeBox(raw) {
  if (!isObject(raw)) return null;
  return {
    id: (typeof raw.id === "string" && raw.id) ? raw.id : randomId(),
    col: clampInt(raw.col, 1, GRID_LIMITS.maxCols, 1),
    row: clampInt(raw.row, 1, GRID_LIMITS.maxRows, 1),
    colSpan: clampInt(raw.colSpan, 1, GRID_LIMITS.maxCols, 1),
    rowSpan: clampInt(raw.rowSpan, 1, GRID_LIMITS.maxRows, 1),
    type: (typeof raw.type === "string" && raw.type) ? raw.type : "notes",
    title: (typeof raw.title === "string") ? raw.title.slice(0, TITLE_MAX_LENGTH) : "",
    data: isObject(raw.data) ? raw.data : {}
  };
}

function normalizeLayout(raw) {
  if (!isObject(raw)) return null;
  const boxes = Array.isArray(raw.boxes) ? raw.boxes.map(normalizeBox).filter(Boolean) : [];
  return {
    id: (typeof raw.id === "string" && raw.id) ? raw.id : randomId(),
    name: (typeof raw.name === "string" && raw.name) ? raw.name.slice(0, TITLE_MAX_LENGTH) : "Main",
    cols: clampInt(raw.cols, 1, GRID_LIMITS.maxCols, DEFAULT_GRID.cols),
    rows: clampInt(raw.rows, 1, GRID_LIMITS.maxRows, DEFAULT_GRID.rows),
    fontScale: clampNumber(raw.fontScale, FONT_LIMITS.min, FONT_LIMITS.max, 1),
    boxes
  };
}

/**
 * Turn any stored value into valid screen data.
 * Never throws. Broken input falls back to defaults.
 * @param {unknown} raw
 * @returns {{data: object, readOnly: boolean}} readOnly is true when the data
 *   comes from a newer module version and must not be overwritten.
 */
export function migrateData(raw) {
  let input = raw;
  if (typeof input === "string") {
    try { input = JSON.parse(input); } catch { input = null; }
  }
  if (!isObject(input) || !Array.isArray(input.layouts)) {
    return { data: createDefaultData(), readOnly: false };
  }

  let version = clampInt(input.schemaVersion, 0, Number.MAX_SAFE_INTEGER, 1);
  if (version > SCHEMA_VERSION) {
    console.warn(`roll101-dm-screen | Stored data uses schema ${version}, this version supports ${SCHEMA_VERSION}. Opening read-only.`);
    return { data: normalizeData(input), readOnly: true };
  }

  let data = foundry.utils.deepClone(input);
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (step) data = step(data);
    version += 1;
  }
  return { data: normalizeData(data), readOnly: false };
}

function normalizeData(input) {
  const layouts = input.layouts.map(normalizeLayout).filter(Boolean);
  if (!layouts.length) layouts.push(createLayout());
  const activeLayoutId = layouts.some(l => l.id === input.activeLayoutId)
    ? input.activeLayoutId
    : layouts[0].id;
  return { schemaVersion: SCHEMA_VERSION, activeLayoutId, layouts };
}
