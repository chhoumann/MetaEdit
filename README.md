# MetaEdit for Obsidian

![v554FnTthq](https://user-images.githubusercontent.com/29108628/118363633-9933de80-b595-11eb-9603-31a3be0e0ccc.gif)

## Features
- Add or update Yaml properties and Dataview fields easily
- Ignore properties to hide them from the menu
- Auto Properties that have customizable, pre-defined values selectable through a suggester
- Multi-Value Mode that allows you to detect and vectorize/create arrays from your values
- Progress Properties that automatically update properties/fields
  - Works with total task, completed task, and incomplete task counts. Mark a task as completed (from anywhere), and the file will be updated with the new count.
- Transform properties between YAML and Dataview
- Delete properties easily
- Auto update properties in files linked to from Kanban boards on lane change
- Edit metadata through a filemenu
- Edit last value in tags - works with [Obsidian Tracker](https://github.com/pyrochlore/obsidian-tracker), too.
- API to use in other plugins and Templater templates.

## Installation
This plugin has not yet been added to the community plugin browser in Obsidian.

### Manual Installation
1. Go to [Releases](https://github.com/chhoumann/MetaEdit/releases) and download the ZIP file from the latest release.
2. This ZIP file should be extracted in your Obsidian plugins folder. If you don't know where that is, you can go to `Community Plugins` inside Obsidian. There is a folder icon on the right of `Installed Plugins`. Click that and it opens your plugins folder.
3. Extract the contents of the ZIP file there.

## API
You can access the API by using `app.plugins.plugins["metaedit"].api`.

I recommend destructuring the API, like so:
```js
const {autoprop} = this.app.plugins.plugins["metaedit"].api;
```

### `autoprop(propertyName: string)`
Takes a string containing a property name. Looks for the property in user settings and will open a suggester with possible values for that property.

Returns the selected value. If no value was selected, or if the property was not found in settings, it returns `null`.

This is an asynchronous function, so you should `await` it.

### `update(propertyName: string, propertyValue: string, file: TFile | string)`
Updates a property with the given name to the given value in the given file.

If the file is a string, it should be the file path. Otherwise, a `TFile` is fine.

This is an asynchronous function, so you should `await` it.


### API Examples
#### New Task template (requires [Templater](https://github.com/SilentVoid13/Templater))
```
<%*
const {autoprop} = this.app.plugins.plugins["metaedit"].api;
tR = `#tasks 
Complete:: 0
Project::
Status:: ${await autoprop("Status")}
Priority:: ${await autoprop("Priority")}
Due Date::

Complete:: 0
Energy::
Estimated Time::

Total:: 1
Complete:: 0
Incomplete:: 1

---

- [ ] <% tp.file.cursor() %>`
 %>
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
const {update} = this.app.plugins.plugins["MetaEdit"].api;
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
