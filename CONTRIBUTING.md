# Contributing

Thanks for your interest in Roll101 DM Screen.

## Ground rules

- No build step. The module is plain ES modules, Handlebars templates and CSS.
- Supported Foundry VTT versions: 13 (minimum) and 14 (verified).
- Do not patch core Foundry classes or other modules. Use hooks and the public API.
- Prefix every CSS class and custom property with `r101-`.
- Nothing may run for non-GM users. Players must get zero overhead.
- Missing or deleted documents (journals, tables, actors) must never throw.
  Show a "not found" state in the box instead.
- User-facing strings go in `lang/en.json` and `lang/tr.json`.

## Content and copyright

- Rules text must come from the SRD 5.1 / 5.2.1 (CC-BY-4.0) and be written in our own words.
- Do not commit text from non-SRD books or other copyrighted sources.
  Such content belongs in a private content pack (`private/`, ignored by git).

## Workflow

1. Fork and create a branch: `feat/<short-name>` or `fix/<short-name>`.
2. Test in a separate test world, never in a live campaign world.
3. Update `CHANGELOG.md` under `[Unreleased]`.
4. Open a pull request with a short description and test steps.

## Releases

Maintainers push a tag like `v0.1.0`. The release workflow builds
`module.zip` and attaches it with `module.json` to the GitHub release.
