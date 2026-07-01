---
title: How MetaEdit writes to your notes
description: The guarantees behind every MetaEdit write - Obsidian's own frontmatter writer, byte-precise text splicing, a per-file write queue, staleness guards, reserved keys, and type preservation.
sidebar:
  order: 3
---

MetaEdit writes directly into your notes, so it holds itself to strict rules about *how*. This page explains those rules and what each one means for you in practice. Nothing here is something you configure - these guarantees are always on.

## YAML goes through Obsidian's own writer

Every frontmatter change is applied with `processFrontMatter`, the same writer Obsidian's Properties panel uses. Two consequences:

- **Formatting is Obsidian-canonical.** Multi-line block values survive intact, and your frontmatter ends up formatted exactly as Obsidian itself would format it - no plugin-specific YAML dialect.
- **A no-op edit skips the file write entirely.** If an edit changes nothing (you re-save the same value, or an automator computes the value the note already has), Obsidian does not touch the file. No modification time churn, no sync noise. This is why re-running [Auto Properties](/guides/auto-properties/) or letting [Progress Properties](/guides/progress-properties/) fire repeatedly is cheap and idempotent.

## Inline fields and tags are spliced, not rewritten

Inline Dataview fields and body tags live in your prose, so MetaEdit edits them with precise text splicing: only the exact span being changed is replaced, and every untouched byte is preserved. That includes:

- the field's key and its `[...]` or `(...)` wrapper,
- the sentence around a bracketed field,
- indentation, list markers, and blockquote markers,
- line endings - a note with CRLF (or mixed) endings keeps them exactly.

Editing an inline field updates the value of every field with that name in the note, in place. Editing a body tag rewrites that one occurrence and nothing else.

What this means for you: MetaEdit never reformats a note as a side effect of an edit.

## One write at a time per note

All MetaEdit writes to one file are serialized through a per-file write queue. A transform's delete and its re-add, a [bulk edit](/guides/bulk-edit/) touching the note, an automator firing, and an edit you just confirmed in the picker all apply one at a time, in the order they were queued. A failed write never blocks the writes queued behind it.

What this means for you: you can trigger overlapping MetaEdit operations on the same note without losing an update. The queue matters because Obsidian does not serialize raw read-modify-write cycles against frontmatter writes on its own.

## Stale edits are refused, not guessed

The queue covers MetaEdit's own writes. Against everything else - you typing in the editor, another plugin modifying the file - three edit paths carry staleness guards: native widget edits (including the edit modal's plain-text fallback), nested dot-path edits, and tag edits. Each re-checks, right before writing, that the value it is about to replace is still the value it read. If the note changed under the open modal, the write is refused with a clear notice instead of guessing:

- A native widget edit re-checks the property's current value and refuses with "MetaEdit could not update '<key>': current value changed before update."
- A nested dot-path write validates the stored value and refuses with "Cannot write YAML path '<path>': current value changed before update."
- A tag edit re-validates the tag's exact position and refuses with "MetaEdit could not update '<key>': could not locate the tag '<tag>' to edit - the note may have changed since it was opened. Reopen and try again."

What this means for you: on those paths, the worst case is reopening the picker and redoing one edit. The tag portion of a batched automator write behaves the same way - a stale tag update is skipped and logged, never forced. The other flows are last-write-wins: inline Dataview field edits (the text prompt, the list editor, and Auto Property prompts), Auto-Property-driven top-level YAML writes, batched YAML and inline-field writes, and the [developer API](/api/properties/) apply your value over whatever the note contains when the write runs. The full list of messages is in the [notices reference](/reference/notices/).

## Reserved property names are refused

The keys `__proto__`, `constructor`, and `prototype` are refused as frontmatter keys on every YAML write path - creating, editing, transforming, bulk edits, and the [developer API](/api/yaml-paths/), including every segment of a nested path. The exact wording varies by entry point, but the message always names the key as reserved; the write boundary itself rejects with '"<key>" is a reserved property name and cannot be written to frontmatter.' Every variant is listed in the [notices reference](/reference/notices/#reserved-property-names).

The one-line rationale: these three names collide with JavaScript's object machinery, so a write could appear to succeed while actually changing nothing, or corrupt the object it was written into. Refusing them outright means a reported success always matches what landed in the note. Matching is exact - a padded key like `" __proto__ "` is an ordinary key.

What this means for you: nothing, unless you try one of these three names. Reads are never blocked.

## Types are preserved

MetaEdit never converts your data as a side effect of an edit:

- When you edit one element of a YAML list, every untouched element keeps its exact type, order, and spelling - numbers stay numbers, `null` stays `null`, values containing commas or `[[wikilinks]]` are never re-split.
- Native widget edits carry typed values end to end: a Number property is written as a number, a Checkbox as a boolean, a List as a list.
- Only text you actually type becomes a string.

One deliberate exception in the tidy direction: the frontmatter `tags` property is always written back as a clean YAML list (any `#` prefixes stripped), and removing the last tag removes the key itself rather than leaving an empty `tags:` behind.

:::caution[Bulk edits and undo]
Bulk edits follow every rule on this page, but they span many files and are not undoable with Ctrl+Z. The bulk flow makes you choose an explicit conflict policy, and overwrites require a separate confirmation - see [bulk edit](/guides/bulk-edit/).
:::

Related: [what MetaEdit can (and can't) edit](/concepts/what-metaedit-can-edit/) explains what the picker shows before any write happens, and [edit properties](/guides/edit-properties/) walks through the editing flows themselves.
