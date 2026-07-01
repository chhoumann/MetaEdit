---
title: Installation
description: Install MetaEdit from Obsidian's Community plugins browser or manually from a GitHub release, and verify it works.
sidebar:
  order: 1
---

MetaEdit installs like any other Obsidian community plugin and needs no configuration to start. This page covers both install paths, the version requirements, and how to check that everything works.

## Requirements

| | |
| --- | --- |
| MetaEdit version | 1.9.0 (current) |
| Obsidian version | 1.12.7 or newer |
| Platforms | Desktop and mobile, with no feature differences |

:::note[On an older Obsidian?]
If your vault runs an Obsidian version older than 1.12.7, the community plugin updater automatically serves you MetaEdit 1.8.4, the newest release compatible with your app. You do not need to pick a version yourself. Update Obsidian to get 1.9.0 and its [native property editing](/guides/edit-properties/).
:::

## Install from the Community plugins browser

1. Open **Settings** and go to **Community plugins**. If this is your first community plugin, turn off Restricted Mode when prompted.
2. Select **Browse** and search for **MetaEdit**.
3. Select **Install**, then **Enable**.

That's it - no setup step follows. Head to the [quick start](/getting-started/quick-start/) to make your first edit.

## Install manually

If you prefer installing from a release, or your device can't reach the plugin browser:

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest GitHub release](https://github.com/chhoumann/MetaEdit/releases/latest).
2. Create the folder `.obsidian/plugins/metaedit/` inside your vault and place all three files in it.
3. Reload Obsidian, then enable **MetaEdit** under **Settings** -> **Community plugins**.

## Verify the install

MetaEdit deliberately adds no ribbon icon, so don't look for one. Instead:

- Open the command palette (`⌘/Ctrl+P`) in any note and search for **MetaEdit: Run**. If the command is there, the plugin is loaded.
- Right-click any `.md` file in the file explorer. You should see an **Edit Meta** item with a pencil icon.

If the **Edit Meta** item is missing, check that the "UI Elements" toggle is on in MetaEdit's settings - it is on by default. See the [settings reference](/reference/settings/) for details.

## Optional companion plugins

MetaEdit works entirely on its own. These plugins pair well with it:

| Plugin | What it adds |
| --- | --- |
| [Dataview](https://obsidian.md/plugins?id=dataview) | Query the inline `key:: value` fields MetaEdit edits. Not required - MetaEdit reads and writes inline Dataview fields without it. |
| [Kanban](https://obsidian.md/plugins?id=obsidian-kanban) | Required for the [Kanban Board Helper](/guides/kanban-helper/), which discovers your boards and syncs lane changes to note properties. |
| [Tracker](https://obsidian.md/plugins?id=obsidian-tracker) | Unlocks the "Tracker value (#tag:value)" action when [editing body tags](/guides/edit-tags/). |
| [Templater](https://obsidian.md/plugins?id=templater-obsidian) / [Buttons](https://obsidian.md/plugins?id=buttons) | Call MetaEdit's [developer API](/api/overview/) from templates and buttons - see the [cookbook](/cookbook/templater-metadata-prompts/) for recipes. |

## Next steps

- [Quick start: your first edits](/getting-started/quick-start/)
- [What's new in 1.9.0](/getting-started/whats-new/) if you're upgrading from 1.8.x
- [How metadata works in Obsidian](/concepts/metadata-in-obsidian/) for background
