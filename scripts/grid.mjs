/**
 * Box placement on the grid. Pure functions: no DOM, no Foundry calls.
 *
 * A box covers the area from (col, row) over colSpan × rowSpan cells.
 * Spans are clamped to the grid and shrunk if they would overlap an earlier box.
 * A box whose start cell is outside the grid or already covered is hidden
 * (kept in data, not shown).
 */

export const cellKey = (col, row) => `${col}:${row}`;

/**
 * @param {Map<string, string>} taken  cell key -> box id
 * @param {string} [ignoreId]  cells of this box count as free
 */
export function areaFree(taken, col, row, colSpan, rowSpan, ignoreId) {
  for (let r = row; r < row + rowSpan; r++) {
    for (let c = col; c < col + colSpan; c++) {
      const owner = taken.get(cellKey(c, r));
      if (owner && owner !== ignoreId) return false;
    }
  }
  return true;
}

function markArea(taken, id, col, row, colSpan, rowSpan) {
  for (let r = row; r < row + rowSpan; r++) {
    for (let c = col; c < col + colSpan; c++) taken.set(cellKey(c, r), id);
  }
}

/**
 * Largest span up to (colSpan, rowSpan) that fits at (col, row).
 * @returns {{colSpan: number, rowSpan: number}|null}  null when the start cell is not usable
 */
export function fitSpan(layout, taken, col, row, colSpan, rowSpan, ignoreId) {
  if (col < 1 || row < 1 || col > layout.cols || row > layout.rows) return null;
  if (!areaFree(taken, col, row, 1, 1, ignoreId)) return null;
  let cs = Math.max(1, Math.min(colSpan, layout.cols - col + 1));
  let rs = Math.max(1, Math.min(rowSpan, layout.rows - row + 1));
  // 1 × 1 always fits here because the start cell is free.
  while ((cs > 1 || rs > 1) && !areaFree(taken, col, row, cs, rs, ignoreId)) {
    if (cs >= rs && cs > 1) cs -= 1;
    else rs -= 1;
  }
  return { colSpan: cs, rowSpan: rs };
}

/**
 * @param {{cols: number, rows: number, boxes: object[]}} layout
 * @returns {{placed: {box: object, colSpan: number, rowSpan: number}[], taken: Map<string, string>, hidden: number}}
 */
export function placeBoxes(layout) {
  const taken = new Map();
  const placed = [];
  let hidden = 0;
  for (const box of layout.boxes) {
    const fit = fitSpan(layout, taken, box.col, box.row, box.colSpan ?? 1, box.rowSpan ?? 1);
    if (!fit) {
      hidden += 1;
      continue;
    }
    markArea(taken, box.id, box.col, box.row, fit.colSpan, fit.rowSpan);
    placed.push({ box, ...fit });
  }
  return { placed, taken, hidden };
}
