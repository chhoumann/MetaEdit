---
title: YAML path methods
description: Read and write nested YAML frontmatter values with MetaEdit's path-based API methods getYamlPath, updateYamlPath, and addOrUpdateYamlPath.
sidebar:
  order: 3
---

`getYamlPath`, `updateYamlPath`, and `addOrUpdateYamlPath` read and write values inside nested frontmatter - objects within objects, and elements of lists - addressed by a path such as `book.meta.rating` or `book.quotes[0]`.

:::note[New in 1.9.0]
All three YAML path methods are new in MetaEdit 1.9.0. On earlier versions they do not exist - use the [availability check](/api/overview/#check-availability) and verify the methods are present before calling them.
:::

The examples on this page work against this frontmatter:

```yaml
---
book:
  title: Dune
  meta:
    rating: 4
    progress:
      page: 217
  quotes:
    - Fear is the mind-killer.
    - A beginning is the time for taking the most delicate care.
---
```

All three methods follow the [shared API conventions](/api/overview/#shared-conventions): `file` accepts a `TFile` or vault path, an unresolvable file is a silent no-op, and every failure below rejects the returned promise with a thrown error (never a notice). Path errors are `YamlPathError` instances (`error.name === "YamlPathError"`).

## Path syntax

A path is either a string or an array of segments:

```ts
type MetaEditYamlPath = string | readonly (string | number)[];
```

In the string form, dots separate keys and `[N]` indexes into arrays:

| Path | Segments | Resolves to (example above) |
| --- | --- | --- |
| `"book.title"` | `["book", "title"]` | `"Dune"` |
| `"book.meta.progress.page"` | `["book", "meta", "progress", "page"]` | `217` |
| `"book.quotes[0]"` | `["book", "quotes", 0]` | `"Fear is the mind-killer."` |

A key that contains a literal dot or bracket cannot be written in the string form - pass a segment array instead:

```js
// frontmatter key "weird.key" with a nested "child"
await api.updateYamlPath(["weird.key", "child"], 1, file);
```

Invalid paths reject the promise before anything is read or written:

| Input | Error message |
| --- | --- |
| Not a string or array | `YAML path must be a string or path segment array.` |
| Empty or whitespace-only string, or empty array | `YAML path cannot be empty.` |
| Empty segment, as in `"a..b"` | `Invalid YAML path 'a..b'. Empty path segments are not supported.` |
| Path part starting with a bracket, as in `"[0].a"` | `Invalid YAML path '[0].a'. Bracket paths must follow a property name.` |
| Non-numeric index, as in `"a[x]"` | `Invalid YAML path 'a[x]'. Only numeric array indexes are supported.` |
| Empty string segment in the array form | `YAML path string segments cannot be empty.` |
| Negative or non-integer index in the array form | `YAML path array index '<segment>' must be a non-negative integer.` |

Writes additionally refuse the reserved keys `__proto__`, `constructor`, and `prototype` anywhere in the path - leaf or parent - rejecting with `Cannot write YAML path '<path>': '<segment>' is a reserved property name.` Reads are not blocked for those segments. See [write safety](/concepts/write-safety/).

## `getYamlPath()`

```ts
getYamlPath(path: MetaEditYamlPath, file: TFile | string): Promise<any>
```

Reads the frontmatter value at the path. Frontmatter is parsed from the live file content, falling back to Obsidian's metadata cache.

Resolves to `undefined` when the file cannot be resolved, the note has no parseable frontmatter, or the path does not exist - a missing key, a wrong container type, or an out-of-range index all read as `undefined` rather than throwing. Only invalid path syntax rejects. Since YAML cannot store `undefined`, in practice `undefined` means the path is missing.

```js
const api = app.plugins.plugins["metaedit"].api;
const rating = await api.getYamlPath("book.meta.rating", file);   // 4
const missing = await api.getYamlPath("book.meta.isbn", file);    // undefined
```

## `updateYamlPath()`

```ts
updateYamlPath(path: MetaEditYamlPath, propertyValue: unknown, file: TFile | string): Promise<void>
```

Strict update: the entire path, including the leaf, must already exist. It never creates parents or the leaf - use `addOrUpdateYamlPath()` for that. On success, the leaf (an object key or an existing array element) is assigned the value verbatim.

```js
await api.updateYamlPath("book.meta.progress.page", 218, file);
await api.updateYamlPath("book.quotes[1]", "Fear is the little-death.", file);
```

It rejects with a `YamlPathError` when:

| Condition | Error message |
| --- | --- |
| An intermediate parent is missing | `Cannot write YAML path: '<parentPath>' does not exist.` |
| The leaf is missing | `Cannot write YAML path '<path>': path does not exist.` |
| A key segment lands on a non-object | `Cannot write YAML path '<path>': '<location>' is not an object.` |
| An index segment lands on a non-array | `Cannot write YAML path '<path>': '<location>' is not an array.` |
| An array index is out of range | `Cannot write YAML path '<path>': array index <n> is out of range.` |
| A reserved segment appears anywhere | `Cannot write YAML path '<path>': '<segment>' is a reserved property name.` |

## `addOrUpdateYamlPath()`

```ts
addOrUpdateYamlPath(
    path: MetaEditYamlPath,
    propertyValue: unknown,
    file: TFile | string,
    options?: { createParents?: boolean }
): Promise<void>
```

Sets the value at the path, creating what is missing. The leaf may always be created; missing intermediate parents are created as empty objects when `options.createParents` is `true`, which is the default. A frontmatter block is created if the note has none.

```js
// Creates book.meta.finished even if "finished" did not exist yet
await api.addOrUpdateYamlPath("book.meta.finished", true, file);

// With createParents (the default), this builds review: {status: pending} from nothing
await api.addOrUpdateYamlPath("review.status", "pending", file);
```

Arrays are the limit of what it will create:

- It never creates an array. A missing parent whose next segment is a numeric index rejects with `Cannot create array parent at '<location>'. Array creation is not supported.`
- An array index in the path must already exist and be in range - you cannot append to a list by writing one index past the end. Out-of-range indexes reject with `Cannot write YAML path '<path>': array index <n> is out of range.`

The remaining failure cases match `updateYamlPath()`: with `createParents: false` a missing parent rejects with `Cannot write YAML path: '<parentPath>' does not exist.`, wrong container types reject with the `is not an object` / `is not an array` messages, and reserved segments reject anywhere in the path.

## Concurrency

The write methods - `updateYamlPath()`, `addOrUpdateYamlPath()`, and `update()` when it targets a nested leaf - go through Obsidian's `processFrontMatter` and MetaEdit's per-file write queue, so concurrent MetaEdit writes to the same note - from your code, another plugin using the API, or the MetaEdit UI - are serialized rather than racing. `getYamlPath()` reads outside the queue, so it can return the old value while a write to the same note is still pending. See [write safety](/concepts/write-safety/).

There is one optimistic check to know about: when [`update()`](/api/properties/#update) targets a nested leaf by its dotted name, it validates that the value is still what it read before writing. If the note changed in between, the write rejects with:

```text
Cannot write YAML path '<path>': current value changed before update.
```

Recover by re-reading and retrying:

```js
const page = await api.getYamlPath("book.meta.progress.page", file);
try {
    await api.update("book.meta.progress.page", page + 1, file);
} catch (error) {
    const current = await api.getYamlPath("book.meta.progress.page", file);
    await api.updateYamlPath("book.meta.progress.page", current + 1, file);
}
```

`updateYamlPath()` and `addOrUpdateYamlPath()` do not perform this check - they write the value you pass, last write wins within the serialized queue.

## Examples

### Bump a nested rating from a dataviewjs button

```js
// dataviewjs
const api = app.plugins.plugins["metaedit"].api;
const path = dv.current().file.path;

const button = dv.el("button", "Rating +1");
button.onclick = async () => {
    const rating = await api.getYamlPath("book.meta.rating", path);
    await api.addOrUpdateYamlPath("book.meta.rating", (rating ?? 0) + 1, path);
};
```

### Initialize a nested review object from a Templater template

```js
<%*
const {addOrUpdateYamlPath} = this.app.plugins.plugins["metaedit"].api;

tp.hooks.on_all_templates_executed(async () => {
    const file = tp.file.find_tfile(tp.file.path(true));
    await addOrUpdateYamlPath("review.status", "pending", file);
    await addOrUpdateYamlPath("review.due", tp.date.now("YYYY-MM-DD"), file);
});
%>
```

The hook matters: Templater writes the rendered template into the note after your code runs, so frontmatter written mid-render can be overwritten by its output. `tp.hooks.on_all_templates_executed` fires once that write is done - the same pattern as the [Templater metadata prompts recipe](/cookbook/templater-metadata-prompts/). This produces:

```yaml
---
review:
  status: pending
  due: 2026-07-01
---
```

## Related pages

- [Property methods](/api/properties/) - `update()` and `getPropertyValue()` also resolve nested leaves by dotted name, and cover inline Dataview fields and tags
- [API overview](/api/overview/) for shared conventions and the full method index
- [What MetaEdit can edit](/concepts/what-metaedit-can-edit/) for how nested frontmatter appears in the property picker
