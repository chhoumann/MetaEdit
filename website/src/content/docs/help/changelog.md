---
title: Changelog
description: MetaEdit version history - what changed in each release, when it shipped, and which Obsidian version it requires.
sidebar:
  order: 3
---

Every MetaEdit release, newest first, with its date and minimum Obsidian version. Full commit-level notes live on the [GitHub releases page](https://github.com/chhoumann/MetaEdit/releases).

| Version | Date | Minimum Obsidian |
| ------- | ---- | ---------------- |
| [1.9.0](#190-2026-07-01) | 2026-07-01 | 1.12.7 |
| [1.8.4](#184-2026-01-22) | 2026-01-22 | 1.4.1 |
| [1.8.3](#183-2026-01-22) | 2026-01-22 | 1.4.1 |
| [1.8.2](#182-2023-07-30) | 2023-07-30 | 1.4.1 |
| [1.8.1](#181-2023-07-30) | 2023-07-30 | 1.4.1 |
| [1.8.0](#180-2023-03-02) | 2023-03-02 | 0.12.0 |

## 1.9.0 (2026-07-01)

The biggest release in years. Property editing now runs on Obsidian's own property widgets, new properties are created in one type-aware modal, and whole folders can be edited in one pass. See [what's new in 1.9.0](/getting-started/whats-new/) for the guided tour, or the [full authored notes on GitHub](https://github.com/chhoumann/MetaEdit/releases/tag/1.9.0).

### Features

- **Native property editing.** Picking a property opens the exact widget Obsidian's Properties view would use: a date picker for dates, a checkbox for booleans, chips for lists, a number field for numbers. Types are respected end to end. See [edit properties with native widgets](/guides/edit-properties/).
- **Fluid, type-aware creation.** "New YAML property" opens a single-row modal: the key autocompletes from every property name in the vault, the value widget follows the key's known type automatically, a one-click "Change to Date" or "Change to Number" switch appears when a value looks mistyped, ⌘/Ctrl+Y opens the type menu, and ⌘/Ctrl+↵ adds the property. See [create new properties](/guides/create-properties/).
- **Bulk edit metadata.** Right-click a folder or a multi-selection in the file explorer, name a property and value, and choose a conflict policy: "Skip notes that already have it", "Merge into a list", or "Overwrite existing values" behind an explicit confirmation. See [bulk edit](/guides/bulk-edit/).
- **Auto Properties upgrades.** Multi-select values written as YAML lists, optional descriptions shown in the value prompt, learn-as-you-go values you can save right from the prompt, and paste-a-list splitting in settings. See [Auto Properties](/guides/auto-properties/).
- **Tag editing rebuilt.** Rename a body `#tag` occurrence in place, edit frontmatter `tags` as a real list, stray `#` prefixes stripped, and the key removed when the last tag is cleared. See [edit tags](/guides/edit-tags/).

### Improvements

- Text prompts autocomplete from your vault, with values ranked by how often you already use them; tag prompts suggest existing tags; date and datetime properties get a native picker.
- Property rows in the picker carry tooltipped "Delete property" and "Transform to YAML ⇄ Dataview" actions.
- "Hide file tags" and per-name property hiding under the "Edit Meta menu" settings section.
- Nested YAML appears as individual child rows instead of one uneditable blob.

### Breaking changes

- **Requires Obsidian 1.12.7 or newer** (raised from 1.4.1) because native widget editing builds on Obsidian's modern properties engine.
- **Body-tag delete and transform actions were removed** - they could not target the right text safely. Rename and last-segment editing remain; frontmatter `tags` editing is unaffected.
- **Tag rename replaces the whole tag.** The legacy flow appended your input as a child segment, turning `#book` plus `fantasy` into `#book/fantasy`; since 1.9.0, type the full nested name to nest. See [edit tags](/guides/edit-tags/).
- Picker row actions now use Obsidian's native icons and tooltips - same actions, new presentation.

### API additions

New on the [public API](/api/overview/): `getYamlPath` / `updateYamlPath` / `addOrUpdateYamlPath` for [nested paths](/api/yaml-paths/) with `a.b[0].c` syntax, `appendDataviewField` with insert-location options, `getPropertiesInFile`, `getAutoProperties` / `setAutoProperties` (see the [Auto Properties API](/api/auto-properties/)), and the [`onMetadataChange` subscription](/api/events/).

### Reliability roundup

Fence-aware inline-field writes (a `key:: value` inside a code block is left alone), `[[wikilink]]` preservation in multi-value edits, native YAML list editing instead of string-flattening, tolerance for malformed frontmatter, task counting that treats only `[x]` and `[X]` as complete, rejection of `__proto__`/`constructor`/`prototype` keys on every write path, serialized settings and bulk write queues, and Kanban guards that sync only a card's leading link and never write to ambiguous same-named notes. See [how MetaEdit writes to your notes](/concepts/write-safety/).

## 1.8.4 (2026-01-22)

Internal tooling fix only (test infrastructure). No functional changes - the shipped plugin is byte-identical to 1.8.3.

## 1.8.3 (2026-01-22)

Kanban Board Helper link-resolution fixes: links to notes inside folders no longer fall back to the wrong basename match, and cards without headings are handled instead of erroring.

## 1.8.2 (2023-07-30)

Community-contributed fixes: updating a linked value no longer duplicates square brackets (thanks @jaerri), links inside task headings work with Kanban boards (thanks @Bevaz), and the Kanban helper only locates files that actually match the link name (thanks @hepabolu).

## 1.8.1 (2023-07-30)

Restored frontmatter editing on Obsidian 1.4.1, which had broken it.

## 1.8.0 (2023-03-02)

MetaEdit accepts every Dataview inline field format, including `[key::value]`, and can update bold or italicized fields (both thanks @theofbonin).

## Older releases

- **1.7.x (2021-2022):** Obsidian API updates, a fix for a conflict with Excalidraw's auto-save, and error notifications on failed updates.
- **1.6.x (2021):** the original run of releases that built out MetaEdit's core feature set.

Details for every release are on the [GitHub releases page](https://github.com/chhoumann/MetaEdit/releases).

## How older Obsidian versions are served

Each release ships three assets - `main.js`, `manifest.json`, and `styles.css` - and the repository's `versions.json` maps every plugin version to the minimum Obsidian version it needs. Obsidian's community plugin updater reads that map and installs the newest release your app can run: on Obsidian 1.12.7 or newer you get 1.9.0, while older installs keep receiving 1.8.4 until you update Obsidian. Nothing breaks on update day; you just stay on the last compatible release.
