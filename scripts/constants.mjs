export const MODULE_ID = "roll101-dm-screen";
export const I18N = "R101DMSCREEN";

export const SETTINGS = Object.freeze({
  DATA: "screenData",
  ALLOW_ASSISTANT: "allowAssistantGM",
  WINDOW: "windowPosition"
});

export const SCHEMA_VERSION = 1;

/** Delay before edits are written to the world setting. */
export const SAVE_DELAY_MS = 1000;

export const GRID_LIMITS = Object.freeze({ maxCols: 8, maxRows: 6 });
export const DEFAULT_GRID = Object.freeze({ cols: 3, rows: 2 });
export const FONT_LIMITS = Object.freeze({ min: 0.7, max: 1.6, step: 0.1 });

export const TITLE_MAX_LENGTH = 100;
