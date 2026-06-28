# MetaEdit for Obsidian

![v554FnTthq](https://user-images.githubusercontent.com/29108628/118363633-9933de80-b595-11eb-9603-31a3be0e0ccc.gif)

## Features
- Add or update Yaml properties and Dataview fields easily
- Ignore properties to hide them from the menu
- Auto Properties that have customizable, pre-defined values selectable through a prompt
  - Add an optional description shown when you pick a value
  - Choose a Single or Multi (multi-select) type per property
  - Type a value that is not in the list to use it once, or save it as a new choice
- Multi-Value Mode that allows you to detect and vectorize/create arrays from your values
- Progress Properties that automatically update properties/fields
  - Works with total task, completed task, and incomplete task counts. Mark a task as completed (from anywhere), and the file will be updated with the new count.
- Transform properties between YAML and Dataview
- Delete properties easily
- Auto update properties in files linked to from Kanban boards on lane change
- Edit metadata through a filemenu
- Edit tags wherever they live - rename a body `#tag` in place or edit a frontmatter `tags:` list (see [Editing tags](#editing-tags-guide))
- API to use in other plugins and Templater templates.

## Installation
This plugin is in the community plugin browser in Obsidian. Search for MetaEdit and you can install it from there.

### Manual Installation
1. Go to [Releases](https://github.com/chhoumann/MetaEdit/releases) and download the ZIP file from the latest release.
2. This ZIP file should be extracted in your Obsidian plugins folder. If you don't know where that is, you can go to `Community Plugins` inside Obsidian. There is a folder icon on the right of `Installed Plugins`. Click that and it opens your plugins folder.
3. Extract the contents of the ZIP file there.
4. Now you should have a folder in plugins called 'metaedit' containing a `main.js` file, `manifest.json` file, and a `styles.css` file.

https://user-images.githubusercontent.com/29108628/119513092-3223e000-bd74-11eb-9060-3e0cae4dbef3.mp4

## Guides
### Editing tags guide
Run MetaEdit on a note and it lists that note's tags from **both** homes:

- **Body `#tags`** show up as `#tag` rows. Selecting one lets you:
  - **Rename tag** - replace the whole tag for that one occurrence (e.g. `#draft` -> `#published`). The rest of the line, and any other occurrence of the same tag, are left untouched.
  - **Edit last segment** (nested tags only) - change just the leaf, e.g. `#area/old` -> `#area/new`.
  - **Tracker value** - when the [Obsidian Tracker](https://github.com/pyrochlore/obsidian-tracker) plugin is installed, write its `#tag:value` data syntax. This choice is made per edit and never leaks into later edits.
- **Frontmatter `tags:`** show up as the `tags` property. Editing it strips a leading `#` you type, accepts a list / single value / comma- or space-separated string, stores the canonical `#`-free YAML list, and removes the key entirely when you clear the last tag.

What MetaEdit deliberately leaves to Obsidian (verified against Obsidian 1.12.7):

- **Vault-wide rename** (rename a tag across every note) - use Obsidian's **Tag pane**: right-click a tag and choose *Rename*.
- **The rich frontmatter tag widget** (pills, type-ahead) - Obsidian's native **Properties** editor.
- **Deleting a body tag** - edit the note directly; MetaEdit no longer offers a delete/transform action on body `#tags` (it could not target them safely).

### Kanban Helper Guide
https://user-images.githubusercontent.com/29108628/121333246-ebf48200-c918-11eb-889b-23b9a80299b2.mp4

## API
You can access the API by using `app.plugins.plugins["metaedit"].api`.

I recommend destructuring the API, like so:
```js
const {autoprop} = this.app.plugins.plugins["metaedit"].api;
```

### `autoprop(propertyName: string)`
Takes a string containing a property name. Looks for the property in user settings and will open a prompt with the possible values for that property (and its description, if set).

Returns the selected value: a `string` for a Single property, or a `string[]` for a Multi property. If nothing was selected, or the property was not found / Auto Properties are disabled, it returns `null`.

For a Multi property used in a template, join the array yourself, e.g.
`<% (await autoprop("Tags"))?.join(", ") %>`.

This is an asynchronous function, so you should `await` it.

### `update(propertyName: string, propertyValue: unknown, file: TFile | string)`
Updates a property with the given name to the given value in the given file.

If the file is a string, it should be the file path. Otherwise, a `TFile` is fine.

This is an asynchronous function, so you should `await` it.

`update` changes an existing property. If you want to create the property when it is missing, use `addOrUpdateProperty`.

When updating inline Dataview fields, non-string values are stringified. YAML frontmatter properties can preserve richer YAML values such as numbers, booleans, arrays, and objects.

`update` is replace-by-design: when a note has several inline `name:: value` lines with the same name, it rewrites all of them to the new value. To add a new instance instead and leave the existing ones untouched, use [`appendDataviewField`](#appenddataviewfieldpropertyname-string-propertyvalue-unknown-file-tfile--string-options-location-afterlastmatch--end).

### `createYamlProperty(propertyName: string, propertyValue: unknown, file: TFile | string)`
Creates a YAML frontmatter property in the given file.

If the file already has a property with the same name, MetaEdit leaves it unchanged.

This is an asynchronous function, so you should `await` it.

### `addOrUpdateProperty(propertyName: string, propertyValue: unknown, file: TFile | string)`
Updates an existing property with the given name, or creates a YAML frontmatter property when the property does not exist.

This is an asynchronous function, so you should `await` it.

### `appendDataviewField(propertyName: string, propertyValue: unknown, file: TFile | string, options?: { location?: "afterLastMatch" | "end" })`
Adds a new inline `name:: value` Dataview field instance to the body of the note, leaving any existing fields with the same name unchanged. This is the add-an-instance counterpart to `update`, which replaces every existing instance.

The field is never inserted into YAML frontmatter or a fenced code block. Non-string values are stringified (arrays are joined with `, `).

`options.location` controls placement:
- `"afterLastMatch"` (default): right after the last existing `name::` line; if there is none, at the end of the note body.
- `"end"`: always at the end of the note body.

If the file is a string, it should be the file path. Otherwise, a `TFile` is fine.

This is an asynchronous function, so you should `await` it.

For example, a Dataview/Templater wishlist that appends a new pick without disturbing earlier ones:
```js
const {appendDataviewField} = this.app.plugins.plugins["metaedit"].api;
await appendDataviewField("watch", "[[Dune: Part Two]]", tp.file.path);
```

### `getPropertyValue(propertyName: string, file: TFile | string)`
Gets the value of the given property in the given file.

If the file is a string, it should be the file path. Otherwise, a `TFile` is fine.

This is an asynchronous function, so you should `await` it.

### `getPropertiesInFile(file: TFile | string)`
Gets all metadata properties MetaEdit can read from the given file, including tags, YAML frontmatter properties, and inline Dataview fields.

This is an asynchronous function, so you should `await` it.

### `getFilesWithProperty(propertyName: string)`
Gets all markdown files with a YAML frontmatter property matching the given name.

### `getAutoProperties()`
Gets a copy of MetaEdit's configured Auto Properties.

The returned array is a copy, so mutating it will not change MetaEdit settings. Use `setAutoProperties` to save changes.

### `setAutoProperties(autoProperties: AutoProperty[])`
Replaces MetaEdit's configured Auto Properties and saves settings.

Each Auto Property must have a string `name` and a `choices` array of strings.

This is an asynchronous function, so you should `await` it.

### `onMetadataChange(callback)`
Registers a metadata-change listener and returns an unsubscribe function.

The callback receives `{ file, data, cache, properties, previousProperties }`. `properties` contains the current properties parsed by MetaEdit for the file. `previousProperties` contains the last property snapshot emitted by this subscription for that file, or `null` when no previous snapshot is available.

MetaEdit does not classify changes as add, rename, value change, or remove, because Obsidian's metadata event does not provide a stable semantic diff. Compare `previousProperties` and `properties` in your callback when you need that detail.

Call the returned function when your plugin unloads, or register it with Obsidian's cleanup system:

```js
const unsubscribe = app.plugins.plugins["metaedit"].api.onMetadataChange((change) => {
    console.log(change.file.path, change.properties);
});

this.register(unsubscribe);
```

### API Examples
#### New Task template (requires [Templater](https://github.com/SilentVoid13/Templater))
```
<%*
const {autoprop} = this.app.plugins.plugins["metaedit"].api;
_%>
#tasks 
Complete:: 0
Project::
Status:: <% await autoprop("Status") %>
Priority:: <% await autoprop("Priority") %>
Due Date::

Complete:: 0
Energy::
Estimated Time::

Total:: 1
Complete:: 0
Incomplete:: 1

---

- [ ] <% tp.file.cursor() %>
```
![3EfcPLYkj6](https://user-images.githubusercontent.com/29108628/119262986-85175f00-bbdd-11eb-8073-424fe9ec93c2.gif)
#### Complete Task in Dataview Table (Buttons version)
Requires [Dataview](https://github.com/blacksmithgu/obsidian-dataview) and [Buttons](https://github.com/shabegom/buttons/).
````
```dataviewjs
const {update} = this.app.plugins.plugins["metaedit"].api
const {createButton} = app.plugins.plugins["buttons"]

dv.table(["Name", "Status", "Project", "Due Date", ""], dv.pages("#tasks")
    .sort(t => t["due-date"], 'desc')
    .where(t => t.status != "Completed")
    .map(t => [t.file.link, t.status, t.project, t["due-date"], 
    createButton({app, el: this.container, args: {name: "Done!"}, clickOverride: {click: update, params: ['Status', 'Completed', t.file.path]}})])
    )
```
````
![CBrFA0qHr4](https://user-images.githubusercontent.com/29108628/119342641-ab003a80-bc95-11eb-8f0a-15a6ced6b36d.gif)


#### Complete Task in Dataview Table (HTML buttons version)
Requires [Dataview](https://github.com/blacksmithgu/obsidian-dataview).
````
```dataviewjs
const {update} = this.app.plugins.plugins["metaedit"].api;
const buttonMaker = (pn, pv, fpath) => {
    const btn = this.container.createEl('button', {"text": "Done!"});
    const file = this.app.vault.getAbstractFileByPath(fpath)
    btn.addEventListener('click', async (evt) => {
        evt.preventDefault();
        await update(pn, pv, file);
    });
    return btn;
}
dv.table(["Name", "Status", "Project", "Due Date", ""], dv.pages("#tasks")
    .sort(t => t["due-date"], 'desc')
    .where(t => t.status != "Completed")
    .map(t => [t.file.link, t.status, t.project, t["due-date"], 
    buttonMaker('Status', 'Completed', t.file.path)])
    )
```
````
![BnAVIV4XCM](https://user-images.githubusercontent.com/29108628/119342519-7d1af600-bc95-11eb-8ff8-09f19027131e.gif)

---
### Dev Info
Made by Christian B. B. Houmann
Discord: Chhrriissyy#6548
Twitter: [https://twitter.com/chrisbbh](https://twitter.com/chrisbbh)
Feel free to @ me if you have any questions.


Also from dev: [NoteTweet: Post tweets directly from Obsidian.](https://github.com/chhoumann/notetweet_obsidian)
