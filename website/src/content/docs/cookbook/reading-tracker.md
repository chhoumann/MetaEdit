---
title: Build a reading tracker
description: Set up a typed book-note schema, two Auto Properties for status and genres, and a Dataview bookshelf table that keeps itself current.
sidebar:
  order: 1
---

Track your reading with a small set of typed frontmatter properties, two [Auto Properties](/guides/auto-properties/) for the values you set constantly, and a Dataview table that turns a folder into a bookshelf. You set this up once; after that, logging a book takes a few keystrokes.

## Prerequisites

- MetaEdit 1.9.0 or later. The plugin requires Obsidian 1.12.7+ and everything here works on desktop and mobile.
- The [Dataview](https://github.com/blacksmithgu/obsidian-dataview) community plugin, for the bookshelf query in the last step. Every other step works without it.
- A folder for book notes. This recipe uses `Library/`.

## Step 1: decide the schema

Each book note carries six properties:

| Property  | Type   | Example                | Edited with                          |
| --------- | ------ | ---------------------- | ------------------------------------ |
| `author`  | Text   | `Frank Herbert`        | Native text widget                   |
| `status`  | Text   | `Reading`              | `status` Auto Property (Single)      |
| `started` | Date   | `2026-06-14`           | Native date picker                   |
| `genres`  | List   | `Sci-fi, Classics`     | `genres` Auto Property (Multi)       |
| `rating`  | Number | `8`                    | Native number widget                 |
| `tags`    | List   | `book`                 | Native tags widget                   |

Property types live in Obsidian's vault-wide type registry, not in MetaEdit. Once `rating` is a Number anywhere in your vault, MetaEdit's create modal adopts Number for every future `rating` you add. See [Create properties](/guides/create-properties/) for how type adoption works.

## Step 2: define the two Auto Properties

`status` and `genres` are the values you will set over and over, so give each a fixed list of choices:

1. Open Settings, then MetaEdit.
2. Turn on the "Auto Properties" toggle (its settings description reads "Quick switch for values you know the value of." - in practice: named choice lists for properties).
3. Click the row's extra button to expand the inline management UI.
4. Click "Add auto property". Name it `status`, keep the type dropdown on "Single", set the description to `Where this book is in your reading flow.`, then use "Add value" to add `To Read`, `Reading`, `Finished`, and `Abandoned`.
5. Click "Add auto property" again. Name it `genres`, switch the type dropdown to "Multi", and add your genres as values.

![Auto Properties settings with a Single "status" property (values To Read, Reading, Finished, Abandoned and a description) and a Multi "genres" property](../../../assets/media/autoprop-settings.png)

Every change saves immediately; there is no save button.

:::tip[Paste a whole list at once]
Copy a comma- or newline-separated list of genres and paste it into any single value box. MetaEdit splits it into one value row per entry and drops duplicates.
:::

:::caution[Names match exactly]
Auto Property matching is exact and case-sensitive. An Auto Property named `Status` never fires for a property named `status`. Use the same casing everywhere.
:::

The full feature, including descriptions and the Single/Multi behavior, is covered in the [Auto Properties guide](/guides/auto-properties/).

## Step 3: create a book note and add its properties

1. Create `Library/Dune.md` and open it.
2. Run the "MetaEdit: Run" command from the command palette. MetaEdit has no ribbon icon, so assign a hotkey if you do this often.
3. In the property picker, choose "New YAML property".
4. Type `rating` as the key and `8` as the value. If your vault already knows `rating` as a Number, the value widget switches to a number input on its own; for a brand-new key the type starts as Text and MetaEdit offers a one-click hint when your value looks like a number or date. You can always switch types manually with ⌘/Ctrl+Y.

![Creating a "rating" property in the New property modal: the key autocompletes and the value widget switches to Number automatically](../../../assets/media/fluid-property-create.gif)

5. Repeat for `author` (Text) and, if you know it, `started` (pick the Date type).
6. Now add `status`: type the key and press Enter (or Tab) - the modal replaces the value field with the note '"status" uses an Auto Property – press ⌘/Ctrl+↵ to choose its value.' Commit, and the `status` value prompt opens with your four choices. Do the same for `genres`.

The note's frontmatter ends up looking like this:

```yaml
---
rating: 8
author: Frank Herbert
started: 2026-06-14
status: Reading
genres:
  - Sci-fi
  - Classics
tags:
  - book
---
```

:::note
A key that matches an enabled Auto Property always opens the Auto Property prompt - it takes precedence over the native widget, both when creating and when editing. Everything else follows the usual routing described in [Edit properties](/guides/edit-properties/).
:::

## Step 4: set the start date with the native date picker

When you pick up a book, set `started` without touching the YAML:

1. Run "MetaEdit: Run" in the book note.
2. Pick `started` in the property picker.
3. The "Edit started" modal opens with Obsidian's own date picker. Choose the date and click "Save".

![The Edit started modal showing Obsidian's native date picker widget](../../../assets/media/native-date-widget.png)

Because this is a natively edited YAML property, the value stays a real date - no quoting, no string coercion.

## Step 5: update status and genres as you read

Moving a book through your pipeline is the same two keystrokes every time: "MetaEdit: Run", then pick `status`. The Single prompt lists your choices, filtered as you type.

The prompt also learns as you go. Type a value that is not in the list, say `On Hold`, and two extra rows appear: 'Use "On Hold"' applies it once, and 'Save "On Hold" as a choice' adds it to the `status` choice list permanently.

![The status Auto Property prompt with "On Hold" typed, showing the Use and Save-as-a-choice rows](../../../assets/media/autoprop-single-select.png)

`genres` works the same way, but as a multi-select: current values come pre-checked, values not yet in your choice list carry a "new" badge, and typing a value and pressing Enter adds it checked. Tick "Also add new values to this property's choice list" to keep new genres for next time, then click "Confirm".

![The genres Multi Auto Property prompt with checkboxes, a "new" badge on an unlisted value, and the Also-add-new-values checkbox](../../../assets/media/autoprop-multi-select.png)

## Step 6: the bookshelf query

With consistent, typed properties, the Dataview side is short. Put this in a `Bookshelf.md` note:

```dataview
TABLE author, status, rating, started, genres
FROM "Library"
SORT status ASC, rating DESC
```

Or group the shelf by status:

```dataview
TABLE rows.file.link AS Book, rows.author AS Author, rows.rating AS Rating
FROM "Library"
GROUP BY status
```

Because `rating` is a real Number and `started` a real Date, sorting and comparisons behave correctly - no string-sorted "10 before 9" surprises.

## Going further

- Prompt for `status` and `genres` at note creation with a Templater template: [Prompt for metadata in Templater templates](/cookbook/templater-metadata-prompts/).
- Stamp `type: book` on the whole `Library/` folder in one pass: [Bulk metadata migrations and cleanups](/cookbook/bulk-cleanups/).
- More on list-shaped values and Edit Mode: [Lists and multi-values](/guides/lists-and-multi-values/).
