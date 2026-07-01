---
title: API overview
description: Access MetaEdit's JavaScript API from plugins, Templater, or Dataview, and learn the conventions every method shares.
sidebar:
  order: 1
---

MetaEdit exposes a 14-method JavaScript API that other plugins, Templater templates, and `dataviewjs` blocks can call to read and write note metadata. This page shows how to get the API object, the conventions every method shares, and where each method is documented.

The API surface described here is MetaEdit 1.9.0, which requires Obsidian 1.12.7+ and works on desktop and mobile. See the [changelog](/help/changelog/) for what each release added.

## Get the API

The API object is created during MetaEdit's `onload` and lives on the plugin instance, so it is available at:

```js
const api = app.plugins.plugins["metaedit"].api;
```

Destructure the methods you need:

```js
const {update, autoprop} = this.app.plugins.plugins["metaedit"].api;
```

Only `api` is public. The plugin instance also exposes internals such as `controller` and `bulkEditor`, but those are not part of the contract and can change without notice.

## Check availability

If you are writing a plugin (or a template someone else will run), do not assume MetaEdit is installed and enabled. Because plugin load order is not guaranteed, resolve the API at call time rather than caching it during your plugin's startup:

```js
function getMetaEditApi(app) {
	return app.plugins.plugins["metaedit"]?.api ?? null;
}

const api = getMetaEditApi(this.app);
if (!api) {
	new Notice("This action requires the MetaEdit plugin.");
	return;
}
```

## Shared conventions

Every method follows the same rules:

- **Files: `TFile` or vault path.** Every `file` parameter accepts a `TFile` or a vault-relative path string, exactly as `app.vault.getAbstractFileByPath` expects (`"projects/task.md"`, not an absolute OS path).
- **Unresolvable files are silent no-ops.** A typo'd path produces no error, no notice, and no write: mutating methods resolve without doing anything, `getPropertyValue` and `getYamlPath` resolve to `undefined`, and `getPropertiesInFile` resolves to `[]`.
- **Almost everything is async.** Always `await` the returned promise. The exceptions are `getFilesWithProperty`, `getAutoProperties`, and `onMetadataChange`, which return synchronously - the first two return values, the last returns an unsubscribe function.
- **Writes share MetaEdit's safety net.** API writes go through the same per-file write queue and reserved-key guards as the UI, so concurrent calls to the same file cannot race each other, and the keys `__proto__`, `constructor`, and `prototype` are refused on every YAML write path. See [write safety](/concepts/write-safety/).
- **Errors reject the promise.** Genuine failures (reserved keys, invalid tag names, invalid YAML paths, stale edits) reject with a thrown `Error` instead of showing a notice, so wrap calls in `try`/`catch` when you build user-facing tools. The one exception: `createYamlProperty` shows a notice, and still resolves, when the property already exists.
- **`autoprop` can return `null`.** It returns `null` when Auto Properties are disabled, the named Auto Property does not exist, or the user cancels the prompt. See the [Auto Properties API](/api/auto-properties/).

## Method index

| Method | Returns | What it does |
| --- | --- | --- |
| [`getPropertyValue`](/api/properties/#getpropertyvalue) | `Promise<any>` | Read the value of one property (YAML, inline Dataview field, or body tag). |
| [`getPropertiesInFile`](/api/properties/#getpropertiesinfile) | `Promise<Property[]>` | List every property MetaEdit can read in a note. |
| [`getFilesWithProperty`](/api/properties/#getfileswithproperty) | `TFile[]` (sync) | Find every note whose frontmatter has a given key. |
| [`update`](/api/properties/#update) | `Promise<void>` | Change the value of an existing property. |
| [`createYamlProperty`](/api/properties/#createyamlproperty) | `Promise<void>` | Add a new top-level frontmatter property; never overwrites. |
| [`addOrUpdateProperty`](/api/properties/#addorupdateproperty) | `Promise<void>` | Update a property if it exists anywhere, otherwise create it in frontmatter. |
| [`appendDataviewField`](/api/properties/#appenddataviewfield) | `Promise<void>` | Add a new inline Dataview field instance to the note body. |
| [`getYamlPath`](/api/yaml-paths/#getyamlpath) | `Promise<any>` | Read a nested frontmatter value by path, such as `book.meta.rating`. |
| [`updateYamlPath`](/api/yaml-paths/#updateyamlpath) | `Promise<void>` | Update an existing nested frontmatter value; never creates anything. |
| [`addOrUpdateYamlPath`](/api/yaml-paths/#addorupdateyamlpath) | `Promise<void>` | Set a nested frontmatter value, creating missing object parents. |
| [`autoprop`](/api/auto-properties/) | `Promise<string \| string[] \| null>` | Open an Auto Property's value prompt and return the user's choice. |
| [`getAutoProperties`](/api/auto-properties/) | `AutoProperty[]` (sync) | Read a defensive copy of the configured Auto Properties. |
| [`setAutoProperties`](/api/auto-properties/) | `Promise<void>` | Replace the whole Auto Properties configuration and save it. |
| [`onMetadataChange`](/api/events/) | unsubscribe function | Subscribe to per-file metadata change snapshots. |

For copy-paste integrations built on these methods, see the [API examples](/api/examples/).

## Type signatures

The TypeScript contract is `IMetaEditApi` in `src/IMetaEditApi.ts`:

```ts
export type MetaEditPropertyValue = unknown;
export type MetaEditUnsubscribe = () => void;
export type MetaEditYamlPath = string | readonly YamlPathSegment[]; // YamlPathSegment = string | number
export type MetaEditYamlPathOptions = {
    createParents?: boolean;
};
export type MetaEditAppendDataviewFieldOptions = {
    // Where to add the new inline field instance. Defaults to "afterLastMatch".
    location?: "afterLastMatch" | "end";
};

export interface MetaEditMetadataChange {
    file: TFile;
    data: string;
    cache: CachedMetadata;
    properties: Property[];
    previousProperties: Property[] | null;
}

export type MetaEditMetadataChangeCallback = (change: MetaEditMetadataChange) => void | Promise<void>;

export interface IMetaEditApi {
    autoprop: (propertyName: string) => Promise<string | string[] | null>;
    update: (propertyName: string, propertyValue: MetaEditPropertyValue, file: TFile | string) => Promise<void>;
    getPropertyValue: (propertyName: string, file: (TFile | string)) => Promise<any>;
    getFilesWithProperty: (propertyName: string) => TFile[];
    createYamlProperty: (propertyName: string, propertyValue: MetaEditPropertyValue, file: TFile | string) => Promise<void>;
    addOrUpdateProperty: (propertyName: string, propertyValue: MetaEditPropertyValue, file: TFile | string) => Promise<void>;
    appendDataviewField: (propertyName: string, propertyValue: MetaEditPropertyValue, file: TFile | string, options?: MetaEditAppendDataviewFieldOptions) => Promise<void>;
    getYamlPath: (path: MetaEditYamlPath, file: TFile | string) => Promise<any>;
    updateYamlPath: (path: MetaEditYamlPath, propertyValue: MetaEditPropertyValue, file: TFile | string) => Promise<void>;
    addOrUpdateYamlPath: (path: MetaEditYamlPath, propertyValue: MetaEditPropertyValue, file: TFile | string, options?: MetaEditYamlPathOptions) => Promise<void>;
    getPropertiesInFile: (file: TFile | string) => Promise<Property[]>;
    getAutoProperties: () => AutoProperty[];
    setAutoProperties: (autoProperties: AutoProperty[]) => Promise<void>;
    onMetadataChange: (callback: MetaEditMetadataChangeCallback) => MetaEditUnsubscribe;
}
```

The `Property` shape returned by `getPropertiesInFile` and the metadata change payload is described in [property methods](/api/properties/#getpropertiesinfile); `AutoProperty` is described in the [Auto Properties API](/api/auto-properties/).

## Stability

This is the API shape as of MetaEdit 1.9.0. The YAML path methods (`getYamlPath`, `updateYamlPath`, `addOrUpdateYamlPath`), `getPropertiesInFile`, `getAutoProperties`, `setAutoProperties`, `onMetadataChange`, and `appendDataviewField`'s `options` parameter are all new in 1.9.0; the rest of the surface predates it. Additions are listed in the [changelog](/help/changelog/).
