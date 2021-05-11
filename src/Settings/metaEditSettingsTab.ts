import {App, PluginSettingTab, Setting} from "obsidian";
import type MetaEdit from "../main";
import {EditMode} from "../Types/editMode";
import ProgressPropertiesModal from "../Modals/ProgressPropertiesSettingModal/ProgressPropertiesModal";
import AutoPropertiesModal from "../Modals/AutoPropertiesSettingModal/AutoPropertiesModal";
import IgnoredPropertiesModal from "../Modals/IgnoredPropertiesSettingModal/IgnoredPropertiesModal";

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
                        const modal = new AutoPropertiesModal(this.app, this.plugin, this.plugin.settings.AutoProperties.properties);
                        const newProps = await modal.waitForResolve;

                        if (newProps) {
                            this.plugin.settings.AutoProperties.properties = newProps;
                            await this.plugin.saveSettings();
                        }
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
                        const modal = new IgnoredPropertiesModal(this.app, this.plugin, this.plugin.settings.IgnoredProperties.properties);
                        const newProps = await modal.waitForResolve;

                        if (newProps) {
                            this.plugin.settings.IgnoredProperties.properties = newProps;
                            await this.plugin.saveSettings();
                        }
                    })
            })
    }

    private addEditModeSettings(containerEl: HTMLElement) {
        new Setting(containerEl)
            .setName("Edit Mode")
            .setDesc("Single: property values are just one value. Multi: properties are arrays.")
            .addDropdown(dropdown => {
                dropdown
                    .addOption(EditMode.AllSingle, EditMode.AllSingle)
                    .addOption(EditMode.AllMulti, EditMode.AllMulti)
                    .addOption(EditMode.SomeMulti, EditMode.SomeMulti)
                    .addOption(EditMode.SomeSingle, EditMode.SomeSingle)
                    .setValue(this.plugin.settings.EditMode.mode)
                    .onChange(async value => {
                        switch (value) {
                            case EditMode.AllMulti:
                                this.plugin.settings.EditMode.mode = EditMode.AllMulti;
                                break;
                            case EditMode.AllSingle:
                                this.plugin.settings.EditMode.mode = EditMode.AllSingle;
                                break;
                            case EditMode.SomeMulti:
                                this.plugin.settings.EditMode.mode = EditMode.SomeMulti;
                                break;
                            case EditMode.SomeSingle:
                                this.plugin.settings.EditMode.mode = EditMode.SomeSingle;
                                break;
                        }

                        await this.plugin.saveSettings();
                    })
            })
            .addExtraButton(button => {
                button
                    .setTooltip("Configure EditMode")
                    .onClick(async () => {

                    })
            })
    }
}