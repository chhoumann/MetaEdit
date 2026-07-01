---
title: Runnable examples
description: Three battle-tested MetaEdit API integrations, copy-paste ready - a Templater task template with Auto Property prompts and two Dataview done-button tables.
sidebar:
  order: 6
---

These three integrations have shipped with MetaEdit's README for years and are verified against MetaEdit 1.9.0. Paste each one as-is, then rename properties to match your vault. They all reach the API the same way; see the [API overview](/api/overview/) if `app.plugins.plugins["metaedit"].api` is new to you.

## New task template

**Requires:** [Templater](https://github.com/SilentVoid13/Templater).

Creates a task note whose `Status` and `Priority` inline fields are filled through Auto Property prompts while the template runs, plus counter fields that Progress Properties can keep current as you check tasks off.

```md
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

How it works: [`autoprop`](/api/auto-properties/) opens the Auto Property value prompt for `Status`, then for `Priority`, and returns whatever you pick; Templater interpolates the result into the inline Dataview fields. For the prompts to appear, Auto Properties named exactly `Status` and `Priority` must exist and be enabled in [MetaEdit's settings](/reference/settings/) - name matching is case-sensitive, and `autoprop` returns `null` (which renders literally) when the property is missing or the prompt is cancelled.

The `Total`, `Complete`, and `Incomplete` lines are there for [Progress Properties](/guides/progress-properties/): configure those three names in the Progress Properties panel and MetaEdit updates the counts whenever the note's tasks change. The template pre-creates the fields because the automator only updates properties that already exist.

## Complete a task from a Dataview table (Buttons version)

**Requires:** [Dataview](https://github.com/blacksmithgu/obsidian-dataview) and [Buttons](https://github.com/shabegom/buttons/).

Renders a table of open `#tasks` notes with a "Done!" button per row. Clicking a button sets that note's `Status` to `Completed`, and the row drops out of the table on the next refresh.

````md
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

How it works: [`update`](/api/properties/) does the write. Buttons' `createButton` uses `clickOverride` to call `update("Status", "Completed", t.file.path)` when clicked. Dataview's `t.file.path` is the vault-relative path string, which `update` accepts in place of a `TFile`. Because the task template above stores `Status` as an inline Dataview field, `update` rewrites every `Status::` instance in the note - it is replace-by-design. Dataview lowercases field keys, which is why the table reads the same field back as `t.status`.

## Complete a task from a Dataview table (HTML buttons version)

**Requires:** [Dataview](https://github.com/blacksmithgu/obsidian-dataview).

The same table without the Buttons plugin: `dataviewjs` builds plain HTML `button` elements itself.

````md
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

How it works: the same [`update`](/api/properties/) call carries the example, wired to a hand-built button's click handler. Here `buttonMaker` first resolves the path to a `TFile` with `app.vault.getAbstractFileByPath(fpath)` before calling `update`. That lookup is optional - `update` accepts either a `TFile` or a vault-relative path string, so passing `fpath` directly works too.

## Build on these

The cookbook grows each pattern into a full workflow:

- [Task dashboard](/cookbook/task-dashboard/) - the done-button table with grouping, priorities, and progress counts.
- [Templater metadata prompts](/cookbook/templater-metadata-prompts/) - more `autoprop`-driven templates.
- [Reading tracker](/cookbook/reading-tracker/) - status and rating workflows built on the same API calls.
