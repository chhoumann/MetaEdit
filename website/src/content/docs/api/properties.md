---
title: Property methods
description: Read, create, update, and append note properties with MetaEdit's JavaScript API, covering YAML frontmatter, inline Dataview fields, and body tags.
sidebar:
  order: 2
---

These seven methods read and write properties by name: YAML frontmatter, inline Dataview fields, and body tags. They all follow the [shared API conventions](/api/overview/#shared-conventions): `file` accepts a `TFile` or vault path, unresolvable files are silent no-ops, and failures reject the promise.

The snippets below run as-is in Templater templates or `dataviewjs` blocks. The Templater ones pass `tp.file.path(true)` - the `true` matters, because MetaEdit resolves path strings vault-relative via `app.vault.getAbstractFileByPath`. For complete integrations, see the [API examples](/api/examples/) and the [cookbook](/cookbook/task-dashboard/).

## Reading properties

### `getPropertyValue()`

```ts
getPropertyValue(propertyName: string, file: TFile | string): Promise<any>
```

Returns the value of the first property matching `propertyName`, using the same lookup as `update`: a direct match first, then a nested YAML leaf matched by its dotted path (so `getPropertyValue("book.progress.page", file)` reads a nested value).

What you get back depends on the property type:

| Property type | Return value |
| --- | --- |
| YAML frontmatter | The parsed YAML value: string, number, boolean, array, or object |
| Inline Dataview field | The field's string value |
| Body tag | The tag text itself, including `#` (for example `"#topic"`) |

Resolves to `undefined` when the file cannot be resolved or the property does not exist; it never throws for a missing property. `undefined` cannot tell you whether the property is missing or present with no value - use `getPropertiesInFile()` for presence checks.

```js
// dataviewjs: show the current note's rating
const {getPropertyValue} = app.plugins.plugins["metaedit"].api;
const rating = await getPropertyValue("rating", dv.current().file.path);
dv.paragraph(rating !== undefined ? `Rated ${rating}` : "Not rated yet");
```

### `getPropertiesInFile()`

:::note
New in 1.9.0.
:::

```ts
getPropertiesInFile(file: TFile | string): Promise<Property[]>
```

Returns every property MetaEdit can read from the note, in this order: body tags, then YAML frontmatter (root keys first, then nested leaves), then inline Dataview fields. Resolves to `[]` (never `undefined`) for an unresolvable file, so you can always iterate the result.

Each entry has this shape:

| Field | Type | Meaning |
| --- | --- | --- |
| `key` | `string` | Property name; for tags, the tag text with `#`; for nested YAML leaves, the dotted path (for example `"book.meta.rating"`) |
| `content` | `any` | The value; for tags, the same tag text as `key` |
| `type` | `MetaType` | Numeric enum: `0` YAML, `1` Dataview, `2` Tag, `3` Option |
| `path` | `(string \| number)[]?` | Nested YAML only: the path as segments, for example `["book", "meta", "rating"]` |
| `rootKey` | `string?` | Nested YAML only: the top-level key the leaf belongs to |
| `isNested`, `isVirtual` | `boolean?` | Set on nested YAML leaf entries |
| `position` | object? | Tags only: the exact document span of that occurrence |

Details worth knowing:

- `MetaType` is numeric and is not exported on the API object - compare against the literal values `0`/`1`/`2`/`3`.
- Body tags appear once per occurrence, duplicates included, each with its own `position`.
- Nested YAML scalar leaves get an extra virtual entry keyed by their dotted path (`"a.b[0].c"`); scalar array elements such as `a[0]` do not.
- Inline Dataview fields inside frontmatter or fenced code blocks are excluded. Bracketed `[key:: value]` and `(key:: value)` fields are recognized.
- Frontmatter is parsed from the live file content, falling back to Obsidian's metadata cache; malformed YAML falls back rather than aborting, so tags and inline fields still return.

```js
// dataviewjs: list everything MetaEdit sees in this note
const {getPropertiesInFile} = app.plugins.plugins["metaedit"].api;
const props = await getPropertiesInFile(dv.current().file.path);
dv.table(["Key", "Type", "Value"], props.map(p => [p.key, p.type, p.content]));
```

### `getFilesWithProperty()`

```ts
getFilesWithProperty(propertyName: string): TFile[]
```

Synchronous - no `await` needed. Scans the metadata cache of every markdown file and returns the files whose top-level YAML frontmatter has a key exactly equal to `propertyName`. Matching is by key presence, not truthiness, so notes with `published: false` or `count: 0` are included.

Limits: top-level YAML keys only - inline Dataview fields, body tags, and nested keys are not matched. Files whose metadata cache has not populated yet are skipped.

```js
// dataviewjs: link every note that declares a "rating" property
const {getFilesWithProperty} = app.plugins.plugins["metaedit"].api;
const files = getFilesWithProperty("rating");
dv.list(files.map(f => dv.fileLink(f.path)));
```

## Writing properties

Four methods write, and they differ in whether they create, replace, or append:

| Method | Property exists | Property missing |
| --- | --- | --- |
| `update` | Updates it (all inline instances) | Does nothing |
| `createYamlProperty` | Leaves it unchanged, shows a notice | Creates it in frontmatter |
| `addOrUpdateProperty` | Updates it, wherever it lives | Creates it in frontmatter |
| `appendDataviewField` | Adds another inline instance | Adds the first inline instance |

All frontmatter writes refuse the reserved keys `__proto__`, `constructor`, and `prototype`, rejecting with `"<key>" is a reserved property name and cannot be written to frontmatter.` See [write safety](/concepts/write-safety/).

### `update()`

```ts
update(propertyName: string, propertyValue: unknown, file: TFile | string): Promise<void>
```

Updates an existing property only. When the file cannot be resolved or no property with that exact name exists, it resolves silently - no write, no error. Use `addOrUpdateProperty()` to create the property when it is missing.

Behavior by property type:

- **Top-level YAML**: the value is written verbatim, preserving rich YAML types - numbers, booleans, arrays, objects.
- **Nested YAML leaf**: a dotted name such as `book.progress.page` updates the nested value. The write validates that the value has not changed since it was read and can reject on a race - see the [concurrency note](/api/yaml-paths/#concurrency).
- **Frontmatter `tags`/`tag` key**: the value is canonicalized - leading `#` stripped, split on commas and whitespace, blanks dropped - and stored as a YAML list. When the resulting list is empty, the key is removed entirely.
- **Inline Dataview field**: the value is stringified and every same-named instance in the note is rewritten. This is replace-by-design: to add a new instance and leave existing ones untouched, use `appendDataviewField()` instead. Wrappers (`[key:: value]`, `(key:: value)`) are preserved, and frontmatter and fenced code blocks are never touched.
- **Body tag**: a name starting with `#` renames a tag occurrence - see below.

```js
// Templater or dataviewjs: mark a task note completed
const {update} = this.app.plugins.plugins["metaedit"].api;
await update("Status", "Completed", "tasks/Write docs.md");
```

#### Renaming body tags

When `propertyName` is a body tag (include the leading `#`), `update` renames the first occurrence of that tag in document order, in place, leaving the rest of the line untouched. API callers cannot target a later duplicate occurrence.

```js
// Rewrites the first #topic in the note to #science
await update("#topic", "science", file);
```

The new value is normalized to a single tag token: `"science"` becomes `#science` - a rename, never nesting like `#topic/science`. Validation rejects the promise with `'<value>' is not a valid tag name.` when the value contains spaces, commas, or punctuation Obsidian would not index as a single tag, or is purely numeric. If the note changed since it was parsed and the tag is no longer where it was, the write refuses with `could not locate the tag '<tag>' to edit - the note may have changed since it was opened. Reopen and try again.`

Renaming a tag across the whole vault is out of scope for MetaEdit - use Obsidian's Tag pane. See [edit tags](/guides/edit-tags/).

### `createYamlProperty()`

```ts
createYamlProperty(propertyName: string, propertyValue: unknown, file: TFile | string): Promise<void>
```

Adds a new top-level YAML frontmatter property. A frontmatter block is created if the note has none. If the key already exists, the note is left unchanged and this notice is shown: `Frontmatter in file '<name>' already has property '<property>'. Will not add.` The promise still resolves - this is the only API method that surfaces a notice instead of rejecting.

The value is shaped before writing:

- A `tags`/`tag` key is canonicalized into a `#`-free string list.
- [Edit Mode](/reference/settings/) wrapping applies, as on all legacy add paths: when Edit Mode is "All Multi", or "Some Multi" with this property listed, a non-array value is wrapped into a one-element list - unless an enabled Auto Property of the same name resolves to Single, which keeps it scalar.

```js
// Templater: stamp a fresh note as not yet reviewed
const {createYamlProperty} = this.app.plugins.plugins["metaedit"].api;
await createYamlProperty("reviewed", false, tp.file.path(true));
```

### `addOrUpdateProperty()`

```ts
addOrUpdateProperty(propertyName: string, propertyValue: unknown, file: TFile | string): Promise<void>
```

The upsert. If any existing property matches - top-level YAML, a nested YAML leaf by dotted name, an inline Dataview field, or a body `#tag` - it takes the same write path as `update()`, with all the same semantics (inline replace-all, tag validation). Only when nothing matches does it create a new top-level YAML frontmatter key, creating the frontmatter block if needed.

Two things to keep in mind:

- The destination depends on what already exists: if the note has an inline `rating:: 3` field, `addOrUpdateProperty("rating", 5, file)` rewrites that inline field rather than creating YAML.
- Unlike `createYamlProperty()`, the create path does not apply Edit Mode list-wrapping - the value is written as-is, except that a `tags`/`tag` key is still canonicalized into a `#`-free YAML list, exactly as on the update path.

```js
// Templater: record when the note was last processed, creating the key on first run
const {addOrUpdateProperty} = this.app.plugins.plugins["metaedit"].api;
await addOrUpdateProperty("last-processed", tp.date.now("YYYY-MM-DD"), tp.file.path(true));
```

### `appendDataviewField()`

```ts
appendDataviewField(
    propertyName: string,
    propertyValue: unknown,
    file: TFile | string,
    options?: { location?: "afterLastMatch" | "end" }
): Promise<void>
```

Inserts a new line `name:: value` into the note body, leaving all existing same-named fields untouched - the add-an-instance counterpart to `update()`'s replace-all. Arrays are joined with `", "`; any other non-string value is stringified.

`options.location` controls placement (the `options` parameter is new in 1.9.0):

| Value | Placement |
| --- | --- |
| `"afterLastMatch"` (default) | Just after the last body line declaring that field (full-line or bracketed); at the end of the body when none exists |
| `"end"` | Always after the last body content line |

The insertion point is never inside YAML frontmatter or a fenced code block, and the file's existing line-ending style is preserved.

```js
// Templater: append a new pick to a watchlist without disturbing earlier ones
const {appendDataviewField} = this.app.plugins.plugins["metaedit"].api;
await appendDataviewField("watch", "[[Dune: Part Two]]", tp.file.path(true));
```

## Related pages

- [YAML path methods](/api/yaml-paths/) for nested frontmatter beyond what dotted names in `update()` cover
- [Auto Properties API](/api/auto-properties/) to prompt users for values before writing them
- [Events API](/api/events/) to react when metadata changes
- [API examples](/api/examples/) and the [Templater metadata prompts recipe](/cookbook/templater-metadata-prompts/) for full workflows
