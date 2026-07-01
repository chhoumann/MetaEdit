---
title: Metadata change events
description: Subscribe to metadata changes across the vault with onMetadataChange and diff MetaEdit's property snapshots to detect what changed.
sidebar:
  order: 5
---

`onMetadataChange` calls your code whenever a note's metadata changes anywhere in the vault, handing you MetaEdit's parsed property snapshot alongside the previous one so you can work out what changed. It is new in MetaEdit 1.9.0.

## Subscribe and unsubscribe

```ts
onMetadataChange(callback: (change) => void | Promise<void>): () => void
```

The call returns an unsubscribe function. Call it when your plugin unloads, or hand it to Obsidian's cleanup system:

```js
const unsubscribe = app.plugins.plugins["metaedit"].api.onMetadataChange((change) => {
    console.log(change.file.path, change.properties);
});

this.register(unsubscribe);
```

The unsubscribe function is idempotent - calling it twice is safe. It detaches all underlying event listeners and clears the subscription's state. MetaEdit also registers it with its own plugin lifecycle, so if MetaEdit is disabled or unloaded the subscription is cleaned up automatically. That safety net does not replace your own cleanup: use `this.register(unsubscribe)` (or call it from your `onunload`) so your callback stops firing when *your* plugin unloads.

## The change payload

The callback receives one object per event:

| Field | Type | Contents |
| ----- | ---- | -------- |
| `file` | `TFile` | The note that changed. |
| `data` | `string` | The note's full text at event time. |
| `cache` | `CachedMetadata` | Obsidian's metadata cache for the note. |
| `properties` | `Property[]` | MetaEdit's parsed snapshot: body tags first, then YAML frontmatter (root keys, then nested virtual leaves), then inline Dataview fields. |
| `previousProperties` | `Property[] \| null` | The last snapshot this subscription emitted for that file, or `null` the first time this subscription sees the file. |

`properties` uses the same `Property` shape as [`getPropertiesInFile`](/api/properties/), with one difference: tag entries in the event payload carry no `position` field. Compare `type` against the numeric `MetaType` values (`0` YAML, `1` Dataview, `2` Tag, `3` Option); the enum is not exported on the API object.

Both snapshots are deep clones. Mutating them in your callback cannot corrupt the subscription's internal state or later events.

:::note[No semantic diff, by design]
MetaEdit does not classify changes as add, rename, value change, or remove, because Obsidian's metadata event does not provide a stable semantic diff. Compare `previousProperties` and `properties` in your callback when you need that detail.
:::

## Delivery guarantees

- **No-op filtering.** Events whose parsed properties are identical to the previous snapshot (compared over key, type, content, path, and nesting flags) are skipped entirely, so body-only edits do not reach your callback. One consequence: because the comparison needs a previous snapshot, the first event per file after subscribing always fires, even if nothing meaningful changed.
- **Per-file serialization.** Async callbacks are awaited, and events for the same file queue behind the previous invocation. A slow callback never sees interleaved events for one file. Events for different files run independently.
- **Error isolation.** A callback that throws or rejects is caught and logged with `console.error("MetaEdit metadata change callback failed.", error)`. The subscription stays alive.
- **Renames and deletes.** Renaming a file migrates its previous snapshot to the new path, so the next event diffs against the right history. Deleting a file clears its snapshot.

## Example: react to status changes

This subscription logs whenever a note under `projects/` changes its `status` property, by diffing the two snapshots:

```js
const api = app.plugins.plugins["metaedit"].api;

const statusOf = (properties) =>
    properties?.find((p) => p.key === "status" && !p.isVirtual)?.content ?? null;

const unsubscribe = api.onMetadataChange((change) => {
    // Filter by file first: this fires for metadata changes across the vault.
    if (!change.file.path.startsWith("projects/")) return;

    const before = statusOf(change.previousProperties);
    const after = statusOf(change.properties);
    if (before === after) return;

    console.log(`${change.file.path}: status ${before ?? "(not set)"} -> ${after ?? "(not set)"}`);
});

this.register(unsubscribe);
```

On the first event for a file, `previousProperties` is `null`, so `before` reads as `(not set)` even when the note had a status all along. Treat the first event per file as "initial state observed" rather than a real transition if that distinction matters to you.

:::caution[Keep the callback cheap]
The callback runs for every metadata change in the vault, and events for one file queue behind your callback while it is awaited. Return early for files and properties you do not care about, and avoid slow work (network calls, large file writes) inside the callback.
:::

## Related pages

- [Property read and write methods](/api/properties/) - the `Property` shape and the write methods you might call in response to an event.
- [Write safety](/concepts/write-safety/) - how MetaEdit serializes its own writes per file.
- [Runnable examples](/api/examples/) - complete Templater and Dataview integrations.
