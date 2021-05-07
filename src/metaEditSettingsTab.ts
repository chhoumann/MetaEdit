import {App, PluginSettingTab} from "obsidian";
import MetaEdit from "./main";

export class MetaEditSettingsTab extends PluginSettingTab {
    plugin: MetaEdit;

    constructor(app: App, plugin: MetaEdit) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        let {containerEl} = this;

        containerEl.empty();

        containerEl.createEl('h2', {text: 'MetaEdit Settings'});
    }
}