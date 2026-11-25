import { I18N, MODULE_ID, SETTINGS } from "./constants.mjs";
import { registerKeybindings, registerSettings } from "./settings.mjs";
import * as storage from "./storage.mjs";
import { DMScreenApp } from "./app/DMScreenApp.mjs";

const TOOL_NAME = "r101DmScreen";

/** @type {DMScreenApp|null} */
let app = null;

/**
 * Only the Gamemaster role may use the screen.
 * Assistant GMs only when the world setting allows it.
 */
function canUse() {
  const user = game.user;
  if (!user) return false;
  const roles = CONST.USER_ROLES;
  if (user.role >= roles.GAMEMASTER) return true;
  if (user.role === roles.ASSISTANT) return !!game.settings.get(MODULE_ID, SETTINGS.ALLOW_ASSISTANT);
  return false;
}

function open() {
  if (!canUse() || !storage.isLoaded()) return;
  app ??= new DMScreenApp({ position: savedPosition() });
  if (app.minimized) app.maximize();
  app.render({ force: true });
}

async function close() {
  if (app?.rendered) await app.close();
}

function toggle() {
  if (app?.rendered) close();
  else open();
}

/** Closed: open. Minimized: restore. Open: minimize. */
function showOrMinimize() {
  if (!app?.rendered) return open();
  if (app.minimized) return app.maximize();
  return app.minimize();
}

function savedPosition() {
  const pos = game.settings.get(MODULE_ID, SETTINGS.WINDOW);
  const out = {};
  for (const key of ["left", "top", "width", "height"]) {
    if (Number.isFinite(pos?.[key])) out[key] = pos[key];
  }
  return out;
}

function addControlButton(controls) {
  const tokens = controls?.tokens;
  if (!tokens?.tools) return;
  tokens.tools[TOOL_NAME] = {
    name: TOOL_NAME,
    title: `${I18N}.Controls.Toggle`,
    icon: "fa-solid fa-book-open-reader",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => toggle()
  };
}

Hooks.once("init", () => {
  registerSettings();
  registerKeybindings({ canUse, toggle, showOrMinimize });
});

// `setup` runs after world data and the user are known, before the UI renders.
// Users who cannot use the screen stop here: no hooks, no templates, no data work.
Hooks.once("setup", () => {
  if (!canUse()) return;

  try {
    storage.load();
  } catch (err) {
    console.error(`${MODULE_ID} | Could not load screen data`, err);
    return;
  }

  storage.subscribe(() => {
    if (app?.rendered) app.render();
  });

  Hooks.on("getSceneControlButtons", addControlButton);

  const module = game.modules.get(MODULE_ID);
  if (module) module.api = { open, close, toggle, showOrMinimize };
});
