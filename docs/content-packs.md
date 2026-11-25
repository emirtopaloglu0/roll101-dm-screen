# Content packs

A content pack is a `.json` file with your own reference tables: house prices, tavern menus,
homebrew rules, notes from books you own. Import it in the DM Screen with the
**Content packs** button (box icon in the toolbar). Its templates then appear in the
**Library** of every empty cell.

Packs are stored in the world, not in this repository. Keep copyrighted material
(text from books you bought) in your own packs and do not publish it.

> Like every world setting, a pack is sent to every connected client when the world loads.
> Players never see it in the interface, but a technically skilled player could read it.

See [`examples/example-pack.json`](../examples/example-pack.json) for a complete file.

## Format

```json
{
  "format": "roll101-dm-screen-pack",
  "formatVersion": 1,
  "id": "my-pack",
  "name": "My Pack",
  "version": "1.0.0",
  "templates": []
}
```

| Field | Rule |
|---|---|
| `format` | Always `"roll101-dm-screen-pack"`. |
| `formatVersion` | `1`. Files from a newer format are rejected. |
| `id` | Letters, digits, `.`, `_`, `-`. Importing a pack with the same `id` replaces it. |
| `name`, `version` | Shown in the pack list. |
| `templates` | 1 to 100 templates (see below). |

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
- **Sections** are tables. `columns` and `note` are optional. Up to 8 columns and 500 rows.
- HTML is not allowed. All text is shown as plain text.
