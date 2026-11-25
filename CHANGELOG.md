# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.0] - 2026-11-25

### Added
- Layout tabs can be reordered by dragging one onto another.
- Many more entries for Combat Environment (40 → 80) and Random Events (65 → 126), in English and Turkish.

### Changed
- Several results at once (Ctrl+Reroll) show as a spaced, bulleted list.
- The action bar of every box wraps its controls in small boxes instead of cutting them off.

## [1.0.0] - 2026-11-25

First release. Tested on Foundry VTT v14. Not tested on v13 yet (v13 is the declared minimum, so
please report any problem there).

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
- Rules references (EN/TR, 2024 and 2014, summarized from SRD 5.2.1 and 5.1): Conditions, Exhaustion,
  Combat Actions, Cover, Concentration, Death & Dying, DC Table, Light & Vision, Movement, Damage,
  Objects (AC & HP), Traps, Environmental Hazards and Weapon Mastery. Each can be its own box.
- Rules Glossary box: search all rules references at once, by edition and language.
- Collapse / expand all button in reference template and glossary boxes. The choice is kept
  after a re-render, and clearing the glossary search no longer leaves every group open.
- Library dialog with a search field (ignores accents, matches every language of a title) and
  collapsible categories: Tools, Rules reference, Prices and services, and one per content pack.
  Double-click a row or press Enter to add it.
- Content pack templates can set an optional `group` to sort them under sub-headings in the library.
- Content packs: import your own reference templates from a .json file (see docs/content-packs.md).
- Automatic backups (last 5, stored on this computer only): before the first edit after opening,
  before removing a box, deleting a layout, importing or restoring. Restore from the toolbar.
- Deleted or missing journals, tables and folders show a warning in the box instead of an error.
  Drop a replacement on the box to reconnect it.
- Linked boxes update when their journal, table or folder changes, only while the screen is open.
- Generator boxes (EN/TR): Combat Environment (40 entries: terrain, hazards, weather, magic, objects)
  and Random Events (69 entries by setting: city, village, town, wilderness, forest, snow, desert;
  general events mix into every setting). Results open in the result window with Reroll, Copy and
  Whisper, and appear in the box's recent results.
- Party summary box (dnd5e): AC, HP bar with temp HP, initiative, speed, passive Perception,
  Investigation and Insight, spell DC, inspiration and conditions. Shows all player-owned characters,
  or a list you build by dropping actors. Only its list refreshes when an actor changes.
- Loot Generator box (EN/TR): individual or hoard, four CR tiers. The coin share and the item share
  add up to one total value. Items are gems, art objects, trade goods and equipment (SRD 5.1 names and
  prices); hoards add magic items by rarity. Results use the result window and recent results.
- Party summary: drop a dnd5e group actor to see its coins and members (read only). Coins and members
  can be shown or hidden separately.
- Loot: the result now appears inside the box and each new roll replaces it (no dialog). Copy and
  whisper buttons sit in the box toolbar. Coins are gp, sp and cp only. An optional min and max set the
  total worth (coins and items, without magic items) in gp.
