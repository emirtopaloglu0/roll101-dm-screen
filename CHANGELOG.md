# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Repository skeleton: license, README, contributing guide, release workflow.
- DM Screen window (ApplicationV2) for the Gamemaster only. Assistant GMs can be allowed in settings.
- Adjustable grid (up to 8 × 6) and text size slider. Double-click the slider or its icon to reset to 100%.
- "Show / minimize" keybinding (default Ctrl+F): opens, minimizes or restores the screen.
- Tab moves from a box title to its text, then to the next box, and stays inside the window.
- Notes box with title and autosave (1 second after the last edit).
- Scene Controls button (Token controls) and an unbound "Open / close" keybinding in Configure Controls.
- English and Turkish translations.
- Journal box: drop a journal or a journal page. Shows text and image pages read-only, with an Open button.
- Rollable table box: shows the results list and rolls in a result window (no chat message).
- Table folder generator: drop a rollable table folder or a compendium of rollable tables.
  Browse subfolders or search by name, then generate a result.
- Result window with Reroll, Copy, Whisper to GM and OK.
- Roll a whole folder at once (dice button on the folder): one result per table in one window.
  Reroll a single row or all rows. Copy gives one "Table: result" line per table.
- Recent results (last 10 per box, not saved) open from a button next to the box title.
- Move a box by dragging its grip handle. Dropping on another box swaps the two (place and size).
- Resize a box over several cells by dragging its bottom-right corner.
- Multiple layouts as tabs: add, duplicate, rename (double-click) and delete.
- Move a box to another layout: hold it over a tab to open that layout, then drop it on a cell.
  Dropping on the tab itself puts the box in that layout's first free cell.
- Export one or all layouts to a .json file; import with Add or Replace all.
  Invalid or newer-version files are rejected without changing anything.
- Library button on empty cells: add notes, the coin converter or a reference template.
- Coin converter: pp/gp/ep/sp/cp inputs, total, fewest coins, split between up to 20 characters.
  Platinum and electrum can be hidden.
- Services & Prices template (EN/TR): inn, meals, food and drink, lifestyle, hirelings, travel,
  spellcasting services and healing, for 2024 (SRD 5.2.1) and 2014 (SRD 5.1), plus labelled homebrew rows.
- Content packs: import your own reference templates from a .json file (see docs/content-packs.md).
- Automatic backups (last 5, stored on this computer only): before the first edit after opening,
  before removing a box, deleting a layout, importing or restoring. Restore from the toolbar.
- Deleted or missing journals, tables and folders show a warning in the box instead of an error.
  Drop a replacement on the box to reconnect it.
- Linked boxes update when their journal, table or folder changes, only while the screen is open.
