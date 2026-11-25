# Release testing checklist (1.0.0)

Run this in a **test world** first, never in a live campaign. Back up your Foundry user data before the first run.
Do the full list on **v14** and again on **v13**.

## 1. Visibility and safety
- [ ] GM: Scene Controls button (Token controls) and the keybinding open the screen.
- [ ] Player and Trusted Player (second browser): no button, no window, no errors in the console (F12).
- [ ] Assistant GM: hidden by default; visible after enabling the setting.
- [ ] Disable the module: the world loads normally. Only the module's own setting key remains.

## 2. Missing data (must not crash)
- [ ] Delete a linked journal, rollable table and table folder: each box shows a warning, the screen keeps working.
- [ ] Drop a replacement on the box: it reconnects.
- [ ] Import a broken `.json` layout or pack: rejected, nothing changes.

## 3. Boxes
- [ ] Notes, Journal, Rollable Table, Table Folder generator, Coin Converter.
- [ ] Rules references and Rules Glossary (EN and TR, 2014 and 2024).
- [ ] Combat Environment, Random Events, Loot Generator (min/max total).
- [ ] Party Summary (dnd5e): PCs, dropped actors, group actor.
- [ ] Layouts: add, duplicate, rename, delete, move a box between tabs, export, import, backup restore.

## 4. Performance
Use the browser DevTools (F12) in the GM client, with the screen closed and then open.
- [ ] Console: no errors or warnings that mention `roll101-dm-screen`.
- [ ] Performance tab, record 10 s while idle with the screen open: no long tasks, no steady scripting activity.
- [ ] Memory tab: open and close the screen 10 times. Heap returns to the same level (no growth per cycle).
- [ ] Network: no extra requests from the module after load, except its own templates and data files.
- [ ] Players connected over Tailscale: no new traffic when the GM edits notes (settings sync only, debounced).

## 5. Compatibility
Enable the module together with the modules you use most (for example Dice So Nice, sheet modules, other GM-screen modules).
- [ ] No console errors on load.
- [ ] Keybinding does not clash with another module (Configure Controls shows no conflict).
- [ ] Windows and styles of other modules are not affected.

## 6. Release
1. Move the entries from `[Unreleased]` in `CHANGELOG.md` under a new version heading with the date.
2. Add README screenshots to `docs/images/`.
3. Tag and push: `git tag v1.0.0`, then `git push origin v1.0.0`. The workflow builds `module.zip` and `module.json`.
4. Open the release page and check that both files are attached.
5. Install from the manifest URL in a clean Foundry install.
6. Submit the manifest URL to the Foundry package listing from the roll101 account.

## Decisions
- **Pop-out / second monitor:** not in 1.0.0. The window stays inside Foundry. Revisit after feedback.
