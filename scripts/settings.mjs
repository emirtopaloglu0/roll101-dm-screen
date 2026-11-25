import { I18N, MODULE_ID, SETTINGS } from "./constants.mjs";
import * as storage from "./storage.mjs";

/** Register settings. Runs on every client in `init` and does no other work. */
export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.DATA, {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: value => storage.onRemoteChange(value)
  });

  game.settings.register(MODULE_ID, SETTINGS.ALLOW_ASSISTANT, {
    name: `${I18N}.Settings.AllowAssistant.Name`,
    hint: `${I18N}.Settings.AllowAssistant.Hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true
  });

  // Window size and place. Client scope: stored in this browser only, no network traffic.
  game.settings.register(MODULE_ID, SETTINGS.WINDOW, {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });
}

/**
 * Keybindings must be registered in `init`. Users can change them in Configure Controls.
 * @param {{canUse: () => boolean, toggle: () => void, showOrMinimize: () => void}} handlers
 */
export function registerKeybindings({ canUse, toggle, showOrMinimize }) {
  // Opens the screen, minimizes it, or restores it. Default Ctrl+F.
  game.keybindings.register(MODULE_ID, "showOrMinimize", {
    name: `${I18N}.Keybinding.ShowOrMinimize.Name`,
    hint: `${I18N}.Keybinding.ShowOrMinimize.Hint`,
    editable: [{ key: "KeyF", modifiers: ["Control"] }],
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
    onDown: () => {
      if (!canUse()) return false;
      showOrMinimize();
      return true;
    }
  });

  // Opens or fully closes the screen. No default key.
  game.keybindings.register(MODULE_ID, "toggleScreen", {
    name: `${I18N}.Keybinding.Toggle.Name`,
    hint: `${I18N}.Keybinding.Toggle.Hint`,
    editable: [],
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
    onDown: () => {
      if (!canUse()) return false;
      toggle();
      return true;
    }
  });
}
