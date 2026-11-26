# Content packs

A content pack is a `.json` file with your own reference tables (house prices, tavern menus,
homebrew rules, notes from books you own) and text generators (random events, encounters,
NPC quirks). Import it in the DM Screen with the **Content packs** button (box icon in the
toolbar). Its templates and generators then appear in the **Library** of every empty cell.

Ready-made packs: [`content-packs/`](../content-packs).

Packs are stored in the world, not in this repository. Keep copyrighted material
(text from books you bought) in your own packs and do not publish it.

> Like every world setting, a pack is sent to every connected client when the world loads.
> Players never see it in the interface, but a technically skilled player could read it.

See [`examples/example-pack.json`](../examples/example-pack.json) for a complete file.

## Format

```json
{
  "format": "roll101-dm-screen-pack",
  "formatVersion": 2,
  "id": "my-pack",
  "name": "My Pack",
  "version": "1.0.0",
  "templates": [],
  "generators": []
}
```

| Field | Rule |
|---|---|
| `format` | Always `"roll101-dm-screen-pack"`. |
| `formatVersion` | `2` (`1` still works: templates only). Files from a newer format are rejected. |
| `id` | Letters, digits, `.`, `_`, `-`. Importing a pack with the same `id` replaces it. |
| `name`, `version` | Shown in the pack list. |
| `templates` | Up to 100 templates (see below). |
| `generators` | Up to 20 generators (see below). A pack needs at least one template or generator. |

### Template

```json
{
  "id": "tavern-menu",
  "title": { "en": "Menu", "tr": "Menü" },
  "group": { "en": "Taverns", "tr": "Hanlar" },
  "variants": [
    {
      "id": "default",
      "label": { "en": "Homebrew", "tr": "Homebrew" },
      "attribution": "Optional source or license line.",
      "sections": [
        {
          "title": "Drinks",
          "columns": ["Drink", "Cost"],
          "rows": [["Ale (mug)", "4 cp"]],
          "note": "Optional line under the table."
        }
      ]
    }
  ]
}
```

- **Text** is either a plain string or an object with one string per language, for example
  `{ "en": "Ale", "tr": "Bira" }`. The box shows the Foundry language, then English, then any.
  A language switch appears in the box when a template has more than one language.
- **Group** is optional. The library lists each pack as its own category and sorts the
  pack's templates under these sub-headings, so a large pack stays easy to browse.
- **Variants** are versions of the same template, for example 2014 and 2024 rules.
  A switch appears in the box when there is more than one.
- **Sections** are tables. `columns`, `note` and `hint` (a short "what is this for" text shown above the table) are optional. Up to 8 columns and 500 rows.
- HTML is not allowed. All text is shown as plain text.

### Generator

```json
{
  "id": "events",
  "title": { "en": "Random Events", "tr": "Rastgele Olaylar" },
  "attribution": "Optional source or license line.",
  "alwaysInclude": "general",
  "groups": [
    { "id": "city", "label": { "en": "City", "tr": "Şehir" }, "entries": ["A pickpocket…", "A street fight…"] },
    { "id": "general", "label": "General", "entries": ["A storm rolls in…"] }
  ]
}
```

- **id** is required. A generator box stores only this id, so a box comes back to life when a
  pack with the same generator id is imported. If two packs have the same id, the one imported last wins.
- **groups** become the categories of the box. Up to 20 groups, 200 entries each, 1000 characters per entry.
- **alwaysInclude** (optional) names a group that is mixed into every category, for example general events.
- Entries use the same text rules as templates: a string or one string per language.
