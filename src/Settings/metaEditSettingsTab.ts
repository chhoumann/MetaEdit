import {App, PluginSettingTab, Setting} from "obsidian";
import type MetaEdit from "../main";
import {EditMode} from "../Types/editMode";
import ProgressPropertiesModal from "../Modals/ProgressPropertiesSettingModal/ProgressPropertiesModal";

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

        this.addProgressPropertiesSetting(containerEl);
        this.addAutoPropertiesSetting(containerEl);
        this.addIgnorePropertiesSetting(containerEl);
        this.addEditModeSettings(containerEl);
    }

    private addProgressPropertiesSetting(containerEl: HTMLElement) {
        new Setting(containerEl)
            .setName("Progress Properties")
            .setDesc("Update properties automatically.")
            .addToggle(toggle => {
                toggle
                    .setTooltip("Toggle Progress Properties")
                    .setValue(this.plugin.settings.ProgressProperties.enabled)
                    .onChange(async value => {
                        if (value === this.plugin.settings.ProgressProperties.enabled) return;
                        this.plugin.settings.ProgressProperties.enabled = value;
                        await this.plugin.saveSettings();
                    });
            })
            .addExtraButton(button => {
                button
                    .setTooltip("Configure Progress Properties")
                    .onClick(async () => {
                        const modal = new ProgressPropertiesModal(this.app, this.plugin, this.plugin.settings.ProgressProperties.properties);
                        const newProps = await modal.waitForResolve;
                        console.log(newProps)
                        if (newProps) {
                            this.plugin.settings.ProgressProperties.properties = newProps;
                            await this.plugin.saveSettings();
                        }
                    })
            })
    }

    private addAutoPropertiesSetting(containerEl: HTMLElement) {
        new Setting(containerEl)
            .setName("Auto Properties")
            .setDesc("Quick switch for values you know the value of.")
            .addToggle(toggle => {
                toggle
                    .setTooltip("Toggle Progress Properties")
                    .setValue(this.plugin.settings.AutoProperties.enabled)
                    .onChange(async value => {
                        if (value === this.plugin.settings.AutoProperties.enabled) return;
                        this.plugin.settings.AutoProperties.enabled = value;
                        await this.plugin.saveSettings();
                    });
            })
            .addExtraButton(button => {
                button
                    .setTooltip("Configure Auto Properties")
                    .onClick(async () => {

                    })
            })
    }

    private addIgnorePropertiesSetting(containerEl: HTMLElement) {
        new Setting(containerEl)
            .setName("Ignore Properties")
            .setDesc("Hide these properties from the menu.")
            .addToggle(toggle => {
                toggle
                    .setTooltip("Toggle Progress Properties")
                    .setValue(this.plugin.settings.IgnoredProperties.enabled)
                    .onChange(async value => {
                        if (value === this.plugin.settings.IgnoredProperties.enabled) return;
                        this.plugin.settings.IgnoredProperties.enabled = value;
                        await this.plugin.saveSettings();
                    });
            })
            .addExtraButton(button => {
                button
                    .setTooltip("Configure Ignored Properties")
                    .onClick(async () => {

                    })
            })
    }

    private addEditModeSettings(containerEl: HTMLElement) {
        new Setting(containerEl)
            .setName("Edit Mode")
            .setDesc("Single: property values are just one value. Multi: properties are arrays.")
            .addDropdown(dropdown => {
                dropdown
                    .setValue(this.plugin.settings.EditMode.mode)
                    .addOption(EditMode.AllSingle, EditMode.AllSingle)
                    .addOption(EditMode.AllMulti, EditMode.AllMulti)
                    .addOption(EditMode.SomeMulti, EditMode.SomeMulti)
                    .addOption(EditMode.SomeSingle, EditMode.SomeSingle)
            })
            .addExtraButton(button => {
                button
                    .setTooltip("Configure EditMode")
                    .onClick(async () => {

                    })
            })
    }
}