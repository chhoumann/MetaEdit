---
title: Notices and error messages
description: Every notice MetaEdit can show, verbatim, with when it appears and what to do about it.
sidebar:
  order: 3
---

This page lists every user-visible notice MetaEdit can show, with the exact text (placeholders in `{braces}`), the situation that triggers it, and what to do. Use your browser's find-in-page to jump to the message you saw. For symptoms without a notice, start at [troubleshooting](/help/troubleshooting/).

:::note[The "MetaEdit: (ERROR)" prefix on warnings]
Messages routed through MetaEdit's warning channel are displayed with the prefix `MetaEdit: (ERROR)` - in the notice popup and in the developer console. That is a logging quirk (warnings fan out to the error channel), not a crash. The Kanban Board Helper's "not found" message below is the most common example.
:::

## Editing properties

See the [edit properties guide](/guides/edit-properties/) for how each editor is chosen.

| Notice | When it appears | What to do |
| --- | --- | --- |
| `MetaEdit could not update '{key}': current value changed before update.` | The property's stored value changed between opening the edit modal and saving (sync, another plugin, or your own edit). MetaEdit refuses stale writes rather than overwrite the newer value. | Reopen the picker and edit the property again. |
| `MetaEdit could not update '{key}': Obsidian's native {type} editor returned an unsupported value shape; expected {shape}.` | The native widget handed back a value that failed MetaEdit's per-type validation. Nothing was written. | Re-enter the value. If it happens repeatedly for one property type, report it with the type and value. |
| `MetaEdit did not receive a value from Obsidian's native editor for '{key}'. Nothing was written.` | You typed into the native widget but it never reported a value back. This fail-closed guard exists in both the edit and create modals; the modal stays open. | Click into the field, re-enter the value, and save again. |
| `MetaEdit could not render Obsidian's native editor for '{key}': {reason}` | The native widget's renderer threw. The modal shows the inline error `MetaEdit could not render Obsidian's native editor for '{key}'.` and disables Save, so nothing is written. | Close the modal and retry. If it persists, check for plugins that patch the Properties UI. |
| `Nested YAML parent '{key}' cannot be edited as a text value.` | An edit targeted a YAML object (or a list containing objects or lists), which has no single text value. The picker already hides such rows, so this is kept as an internal safety net you should not normally see. | Edit the nested leaf values individually, or use the API's [YAML paths](/api/yaml-paths/). |
| `Nested YAML property '{key}' cannot be deleted by MetaEdit yet.` | A delete targeted a nested dot-path YAML row. The picker offers no delete button on those rows, so this too is kept as an internal safety net you should not normally see. | Remove the key in Obsidian's Properties panel or in source mode. |
| `Frontmatter in file '{file}' already has property '{key}'. Will not add.` | A create resolved to a key the note already has - typically the key was added to the note between opening the "New property" modal and submitting. MetaEdit never overwrites on create. | Edit the existing property instead. |

## Creating properties

See [create properties](/guides/create-properties/).

| Notice | When it appears | What to do |
| --- | --- | --- |
| `MetaEdit could not add '{key}': {reason}` | Writing the new property failed - for example, a [reserved property name](#reserved-property-names). Nothing was added. | Fix the cause named in `{reason}` and retry. |
| `MetaEdit could not create '{key}': {reason}` | The value failed per-type validation when committing the "New property" modal. | Correct the value and press "Add" again. |
| `MetaEdit could not render an editor for '{key}'. Nothing was written.` | The "New property" modal was committed before any value editor had rendered (the widget failed to mount). | Reopen the modal and retry. |

The "New property" modal also shows two inline warnings under the key field (not popups); the "Add" button is disabled while either shows:

- `"{key}" is a reserved property name and can't be used.`
- `This note already has a property named "{key}".` - includes keys hidden by the ["Edit Meta menu" filter](/reference/settings/#edit-meta-menu).

## Delete and transform

See [delete and transform](/guides/delete-and-transform/).

| Notice | When it appears | What to do |
| --- | --- | --- |
| `MetaEdit: "{key}" is a reserved property name and can't be a YAML property.` | You clicked "Transform to YAML ⇄ Dataview" on an inline field named `__proto__`, `constructor`, or `prototype`. The transform is refused before anything is deleted; the reverse direction (YAML to inline) is always allowed. | Rename the field first, then transform. |
| `MetaEdit could not transform '{key}': {reason}. It may have been removed - reopen the note to check.` | A transform is delete-then-re-add, and the re-add failed after the delete, so the property may now be missing from the note. | Reopen the note and check; re-add the property with the picker if it is gone. |

## Tags

See [edit tags](/guides/edit-tags/).

| Notice | When it appears | What to do |
| --- | --- | --- |
| `'{input}' is not a valid tag name. Tags cannot contain spaces or commas.` | The value you entered for a tag rename or last-segment edit is not a valid Obsidian tag. Valid: one `#`, then Unicode letters, digits, `_`, `-`, `/`, with at least one character that is not a digit or `/` (so purely numeric tags like `#2024` or `#2024/2025` are rejected). | Enter a valid tag name. |
| `MetaEdit could not update '{tag}': could not locate the tag '{tag}' to edit - the note may have changed since it was opened. Reopen and try again.` | The tag occurrence moved or disappeared while the picker was open, so the write failed safe instead of splicing the wrong text. | Reopen the picker and edit the tag again. |

## Bulk edit

See [bulk edit](/guides/bulk-edit/).

| Notice | When it appears | What to do |
| --- | --- | --- |
| `MetaEdit: no markdown notes to edit here.` | The bulk scope resolved to zero markdown files. | Check you right-clicked a folder or selection that actually contains `.md` notes. |
| `MetaEdit: "{key}" is a reserved property name and can't be used.` | You entered `__proto__`, `constructor`, or `prototype` at the property-name prompt. The flow aborts before asking for a value. | Choose a different property name. |
| `MetaEdit bulk "{key}": {detail} across {N} notes.` | The completion summary, shown for 10 seconds after every bulk run. `{detail}` lists the non-zero outcome buckets in fixed order - added, merged, overwritten, skipped, unchanged, failed - or reads `no changes`. With failures it appends ` (see console for failed notes)`. | Nothing, unless notes failed - then open the developer console (Ctrl+Shift+I, or ⌘+Option+I on macOS) for the per-note errors. |

Bucket vocabulary: **added** = the key was missing and written; **merged** = appended into a list; **overwritten** = replaced; **skipped** = left alone by policy; **unchanged** = already had the value, no write; **failed** = write error.

## Auto Properties

See [Auto Properties](/guides/auto-properties/).

| Notice | When it appears | What to do |
| --- | --- | --- |
| `MetaEdit could not save the Auto Property choice: {reason}` | Saving a newly typed value into the Auto Property's choice list failed. The value was still written to your note - only remembering it as a choice failed. | Add the value manually under [Settings, "Auto Properties"](/reference/settings/#auto-properties). |
| `MetaEdit could not save the Auto Properties setting: {reason}` | An edit in the Auto Properties settings panel failed to persist and was rolled back. | Retry the edit; check for disk or sync problems if it keeps failing. |

## Progress Properties and Kanban Board Helper

See [Progress Properties](/guides/progress-properties/) and the [Kanban Board Helper](/guides/kanban-helper/). These carry the `MetaEdit: (ERROR)` prefix described above.

| Notice | When it appears | What to do |
| --- | --- | --- |
| `MetaEdit: (ERROR) '{property}' not found in "{note}" (Kanban board '{board}').` | A card changed lanes, but the linked note does not contain the configured property. The helper only updates existing properties - it never creates them. | Add the property to the note (any value), then move the card again. |
| `MetaEdit: (ERROR) file {board} not found.` | A configured board file no longer exists - the settings panel also shows `FILE NOT FOUND` in its "Possible values" column. Boards are matched by file basename, so renaming the board file breaks the row. | Remove the row and re-add the board under its new name. |
| `MetaEdit: (ERROR) {message}` | A Progress Properties update failed while writing task counts. | Check the note's frontmatter parses (Obsidian shows invalid frontmatter in the editor), then modify the note again to re-trigger the count. |

## Reserved property names

The keys `__proto__`, `constructor`, and `prototype` can never be written as frontmatter keys, on any MetaEdit write path. The write boundary rejects them with:

```text
"{key}" is a reserved property name and cannot be written to frontmatter.
```

In the UI this text appears inside a `MetaEdit could not update '{key}': ...` or `MetaEdit could not add '{key}': ...` notice; [API](/api/properties/) callers get it as a thrown error. Matching is exact and case-sensitive - `Constructor` or `__proto__x` are ordinary keys.

## Console-only messages

These never show a popup; find them in the developer console (Ctrl+Shift+I, or ⌘+Option+I on macOS). Messages routed through MetaEdit's logger carry a `MetaEdit: (LOG)` prefix.

| Message | Meaning |
| --- | --- |
| `MetaEdit: no active markdown file.` | "MetaEdit: Run" was invoked without an active markdown note; the command did nothing. |
| `MetaEdit bulk: failed to update {n} note(s) for "{key}":` | Follows a bulk summary that mentioned failures; logged once with the failing paths and error messages. |
| `{link} is not updatable for the KanbanHelper.` | A board card's link did not resolve to a markdown note and was skipped. |
| `KanbanHelper could not update '{link}': {reason}` | One card's update failed; the rest of the board was still processed. |
| `MetaEdit skipped tag '{key}': '{value}' is not a valid tag.` | A batch update (Progress Properties) skipped an invalid tag token instead of writing it. |
| `MetaEdit skipped tag '{key}': its position no longer matches the note.` | A batch update skipped a tag whose position went stale instead of corrupting the note. |
| `MetaEdit: failed to save new auto property choice` | Console companion of the "could not save the Auto Property choice" notice. |
| `MetaEdit could not save Auto Properties settings.` | Console companion of the "could not save the Auto Properties setting" notice. |

## Related pages

- [Troubleshooting](/help/troubleshooting/) - symptom-first debugging
- [Write safety](/concepts/write-safety/) - why MetaEdit fails closed instead of guessing
- [Commands and menus](/reference/commands-and-menus/) - the entry points these notices come from
