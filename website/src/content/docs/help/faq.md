---
title: FAQ
description: Short answers to common MetaEdit questions - mobile support, tag renames, Dataview, bulk edit limits, version requirements, and where settings live.
sidebar:
  order: 2
---

Quick answers, with links to the full story. For symptom-driven help, see [troubleshooting](/help/troubleshooting/).

## Does MetaEdit work on mobile?

Yes, fully. There are no desktop-only features - the property picker, native widgets, Auto Properties, bulk edit, and both automators all work on phones and tablets. The plugin requires Obsidian 1.12.7 or newer on every platform.

## Why is there no ribbon icon?

By design. MetaEdit is built around one command and the right-click menu: run "MetaEdit: Run" from the command palette (or bind it to a hotkey under Settings, "Hotkeys"), or right-click a note and choose "Edit Meta". See [commands and menus](/reference/commands-and-menus/).

## Can MetaEdit rename a tag across my whole vault?

No, deliberately. MetaEdit renames one `#tag` occurrence in one note, precisely. Vault-wide renames are Obsidian's job - use the Tag pane, exactly as the picker's footer says: "#tag - rename in this note · vault-wide: Tag pane". See [edit tags](/guides/edit-tags/).

## Do I need Dataview installed?

No. Inline `key:: value` fields are plain text in your notes, and MetaEdit reads and writes them directly. The Dataview plugin is what queries and renders those fields - useful alongside MetaEdit, but never required. See [how metadata works in Obsidian](/concepts/metadata-in-obsidian/).

## Can bulk edit change inline fields or delete properties?

No. Bulk edit adds or updates one YAML frontmatter property across many notes - nothing else. It never touches inline Dataview fields and cannot delete a property. For deletes, transforms, and inline fields, use the per-note actions in the picker. See [bulk edit](/guides/bulk-edit/) and [delete and transform](/guides/delete-and-transform/).

## Can I undo a bulk edit?

Not with `Ctrl+Z` - bulk edits are real file writes across many notes, and the "Overwrite existing values" confirmation modal warns you about exactly this. Back up first, or lean on Obsidian's File Recovery core plugin to restore individual notes. Choosing "Skip notes that already have it" or "Merge into a list" limits the blast radius. See [bulk edit](/guides/bulk-edit/).

## Which Obsidian version do I need?

MetaEdit 1.9.0 requires Obsidian 1.12.7 or newer. On older Obsidian versions the community plugin browser automatically serves you MetaEdit 1.8.4, the newest compatible release. See the [changelog](/help/changelog/#how-older-obsidian-versions-are-served).

## What's the difference between "New YAML property" and "New Dataview field"?

"New YAML property" creates a property in the note's frontmatter block through the type-aware creation modal, so the value gets a real type (number, date, list, checkbox) and shows up in Obsidian's Properties view. "New Dataview field" appends a plain-text `key:: value` line to the note body - untyped, but visible in the note itself and queryable by Dataview. Frontmatter is the better default for structured data; inline fields shine for values you want to read in context. See [how metadata works in Obsidian](/concepts/metadata-in-obsidian/) and [create new properties](/guides/create-properties/).

## Why can't I create a property called `__proto__`?

`__proto__`, `constructor`, and `prototype` are reserved. They collide with JavaScript's object machinery, so writing them as frontmatter keys could be silently dropped or corrupt data while appearing to succeed. MetaEdit refuses them on every YAML write path. See [how MetaEdit writes to your notes](/concepts/write-safety/).

## Are property and Auto Property name matches case-sensitive?

Yes. Everywhere MetaEdit matches names - Auto Properties, "Edit Meta menu" hidden properties, "Some Multi" lists, Progress Properties, Kanban properties - the match is exact and case-sensitive. `Status` and `status` are different keys.

## Where are MetaEdit's settings stored?

In your vault at `.obsidian/plugins/metaedit/data.json`. Settings sync with the vault if you sync that folder. The [settings reference](/reference/settings/) documents every field.

## Why does a warning say "(ERROR)"?

A known logging quirk: MetaEdit's warnings are routed through the error channel, so warning notices read `MetaEdit: (ERROR) ...`. Judge the message by its text, not the label - a warning like the Kanban helper's "property not found" notice does not mean data was lost. See the [notices reference](/reference/notices/).

## Where did the body-tag delete and transform actions go?

Removed in 1.9.0. Body tags have no `key:` line, so those two actions could not target the right text safely. Renaming a tag and editing the last segment of a nested tag remain, and frontmatter `tags` editing is unaffected. See [what's new in 1.9.0](/getting-started/whats-new/) and [edit tags](/guides/edit-tags/).
