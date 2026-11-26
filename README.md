# Roll101 DM Screen

A configurable Game Master screen for Foundry VTT. Keep notes, rollable tables,
table-folder generators, journals and quick rules references in one grid window,
without leaving Foundry.

Made by [Roll101](https://roll101rpg.com/en). Join us on [Discord](https://discord.gg/MdMkW2egww).

> **Status:** 1.2.0. Tested on Foundry v14; v13 untested. Back up your world before first use.
> See [docs/TESTING.md](docs/TESTING.md).

## New in 1.2.0: storytelling tools

A GM screen should help you tell the story, not only look up rules. Version 1.2.0 adds a
**Storytelling (GM tools)** group to the Library, in English and Turkish:

- **Spotlight & Stakes**: see at a glance who has been quiet, and what each character cares about.
- **Tension Clocks**: colored countdown clocks you can show in chat or end with a curse.
- **Blessings & Curses**: improv prompts for twists, complications and success at a cost.
- **Scene Pacing & Transitions**: when to keep a scene and how to end it.
- **Command Center**: one click adds a tab with all of them.

Idea credit: the video [“Why are DM Screens Missing these?”](https://youtu.be/MLX4CiTOW9M)
by the YouTube channel **Corkboards & Curiosities**. Texts and code in this module are original.

## Screenshots

![The main layout: rules glossary, coin converter, notes, combat environment, random events and loot generator](docs/image/P1.png)

Several layouts as tabs. Empty cells take notes, library boxes or dropped journals and tables.

![An empty layout with add buttons in every cell](docs/image/P2.png)

## Features

- Grid layout you choose (up to 8 × 6), with adjustable window and text size.
  Boxes can be moved, swapped and resized over several cells.
- Box types: notes, journal, rollable table, table-folder generator, coin converter,
  reference templates (for example Services & Prices, 2014 and 2024, English and Turkish).
- Table-folder generator: browse or search a folder of rollable tables, generate one result
  or a whole folder at once, then reroll, copy or whisper it to the GM.
- Multiple layouts as tabs, with export and import as JSON and automatic local backups.
- Library with search and categories to add any box to an empty cell.
- Content packs: add your own reference tables. See [docs/content-packs.md](docs/content-packs.md).
- Visible to the Gamemaster only. Players and trusted players see nothing.

- Rules references summarized from SRD 5.2.1 (2024) and SRD 5.1 (2014), in English and Turkish:
  conditions, exhaustion, combat actions, cover, concentration, death and dying, DCs, light and vision,
  movement, damage, objects, traps, environmental hazards and weapon mastery, plus a searchable Rules Glossary.

- Generators (English and Turkish): Combat Environment (terrain, hazards, weather, magic, objects)
  and Random Events (city, village, town, wilderness, forest, snow, desert, general).
  Pick a category, press Generate, then reroll, copy or whisper the result to the GM.
- Party summary (D&D 5e): AC, HP, initiative, speed, passive scores, spell DC, inspiration and
  conditions of all player-owned characters, or of actors you drop in. Updates live.

- Loot Generator (English and Turkish): individual treasure or hoards for four CR tiers. Coins and
  items always add up to the same total value: gems, art objects, trade goods and equipment (names
  and prices from SRD 5.1), plus magic items in hoards. Amounts and gem/art descriptions are original.
- Party summary also shows dnd5e group actors (coins and members, read only). Toggle each section.

- Storytelling tools (English and Turkish), or all of them at once with the **Command Center** layout:
  - **Spotlight & Stakes**: mark who had a character moment; the quietest characters come first.
    "New session" moves everyone back one mark. Each character keeps a short list of stakes
    (patron, rival, fear, crush…) to make twists personal.
  - **Tension Clocks**: 3 to 12 segment clocks for chases, rituals, guards arriving. Click to fill,
    right-click to clear, show a clock in chat, or roll a curse when it fills up.
  - **Blessings & Curses**: improv prompts for twists, complications and success at a cost.
  - **Scene Pacing & Transitions**: when to keep a scene, and three ways to end one (cut, gentle close, hard push).
  - Each box has a language choice (EN / TR) and a **?** button that explains how to use it.
  - Idea from [Corkboards & Curiosities](https://youtu.be/MLX4CiTOW9M) on YouTube. Texts are original.

## Compatibility

| Foundry VTT | Status |
|---|---|
| v14 | Tested |
| v13 | Minimum supported, not tested yet. Reports welcome. |

System-agnostic. Some optional boxes (actor summary) need the dnd5e system.

## Installation

In Foundry: **Add-on Modules → Install Module**, then paste this manifest URL:

```
https://github.com/emirtopaloglu0/roll101-dm-screen/releases/latest/download/module.json
```

## Privacy note

The screen UI is GM-only, but Foundry sends world settings to every connected client.
Do not store secrets you would never want a technically skilled player to read.

## License

Open source. Code: [MIT](LICENSE).
Rules content: based on the System Reference Document 5.1 and 5.2.1 by Wizards of the Coast LLC,
licensed under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/legalcode). See [NOTICE.md](NOTICE.md).
This project is not affiliated with Wizards of the Coast or Foundry Gaming LLC.

## Contributing and security

Pull requests are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md).
To report a vulnerability, see [SECURITY.md](SECURITY.md).
