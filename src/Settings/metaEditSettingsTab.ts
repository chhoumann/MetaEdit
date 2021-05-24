import {App, PluginSettingTab, Setting} from "obsidian";
import type MetaEdit from "../main";
import {EditMode} from "../Types/editMode";
import ProgressPropertiesModalContent from "../Modals/ProgressPropertiesSettingModal/ProgressPropertiesModalContent.svelte";
import AutoPropertiesModalContent from "../Modals/AutoPropertiesSettingModal/AutoPropertiesModalContent.svelte";
import KanbanHelperSettingContent from "../Modals/KanbanHelperSetting/KanbanHelperSettingContent.svelte";
import SingleValueTableEditorContent
    from "../Modals/shared/SingleValueTableEditorContent.svelte";
import type {ProgressProperty} from "../Types/progressProperty";
import type {AutoProperty} from "../Types/autoProperty";
import type {KanbanProperty} from "../Types/kanbanProperty";

function toggleHidden(div: HTMLDivElement, hidden: boolean) {
    if (div && !hidden) {
        div.style.display = "none";
        return true;
    } else if (div && hidden) {
        div.style.display = "block";
        return false;
    }
    return hidden;
}

export class MetaEditSettingsTab extends PluginSettingTab {
    plugin: MetaEdit;
    private svelteElements: (SingleValueTableEditorContent | AutoPropertiesModalContent | ProgressPropertiesModalContent)[] = [];

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
        this.addEditModeSetting(containerEl);
        this.addKanbanHelperSetting(containerEl);
        this.addUIElementsSetting(containerEl);
    }

    private addProgressPropertiesSetting(containerEl: HTMLElement) {
        let modal: ProgressPropertiesModalContent, div: HTMLDivElement, hidden: boolean = true;
        const setting = new Setting(containerEl)
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
            .addExtraButton(button => button.onClick(() => hidden = toggleHidden(div, hidden)))

        div = setting.settingEl.createDiv();
        setting.settingEl.style.display = "block";
        div.style.display = "none";

        modal = new ProgressPropertiesModalContent({
            target: div,
            props: {
                properties: this.plugin.settings.ProgressProperties.properties,
                save: async (progressProperties: ProgressProperty[]) => {
                    this.plugin.settings.ProgressProperties.properties = progressProperties;
                    await this.plugin.saveSettings();
                }
            },
        });

        this.svelteElements.push(modal);
    }

    private addAutoPropertiesSetting(containerEl: HTMLElement) {
        let modal: AutoPropertiesModalContent, div: HTMLDivElement, hidden: boolean = true;
        const setting = new Setting(containerEl)
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
            .addExtraButton(b => b.onClick(() => hidden = toggleHidden(div, hidden)));

        div = setting.settingEl.createDiv();
        setting.settingEl.style.display = "block";
        div.style.display = "none";

        modal = new AutoPropertiesModalContent({
            target: div,
            props: {
                autoProperties: this.plugin.settings.AutoProperties.properties,
                save: async (autoProperties: AutoProperty[]) => {
                    this.plugin.settings.AutoProperties.properties = autoProperties;
                    await this.plugin.saveSettings();
                }
            },
        });

        this.svelteElements.push(modal);
    }

    private addIgnorePropertiesSetting(containerEl: HTMLElement) {
        let modal: SingleValueTableEditorContent, div: HTMLDivElement, hidden = true;
        const setting = new Setting(containerEl)
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
                        this.display();
                    });
            }).addExtraButton(b => b.onClick(() => hidden = toggleHidden(div, hidden)))

        if (this.plugin.settings.IgnoredProperties.enabled) {
            div = setting.settingEl.createDiv();
            setting.settingEl.style.display = "block";
            div.style.display = "none";

            modal = new SingleValueTableEditorContent({
                target: div,
                props: {
                    properties: this.plugin.settings.IgnoredProperties.properties,
                    save: async (ignoredProperties: string[]) => {
                        this.plugin.settings.IgnoredProperties.properties = ignoredProperties;
                        await this.plugin.saveSettings();
                    }
                },
            });

            this.svelteElements.push(modal);
        }
    }

    private addEditModeSetting(containerEl: HTMLElement) {
        let modal: any, div: HTMLDivElement, hidden: boolean = true;
        const setting = new Setting(containerEl)
            .setName("Edit Mode")
            .setDesc("Single: property values are just one value. Multi: properties are arrays.")
            .addDropdown(dropdown => {
                dropdown
                    .addOption(EditMode.AllSingle, EditMode.AllSingle)
                    .addOption(EditMode.AllMulti, EditMode.AllMulti)
                    .addOption(EditMode.SomeMulti, EditMode.SomeMulti)
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
                        }

                        await this.plugin.saveSettings();
                    })
            })
            .addExtraButton(b => b.onClick(() => hidden = toggleHidden(div, hidden)));

        div = setting.settingEl.createDiv();
        setting.settingEl.style.display = "block";
        div.style.display = "none";

        modal = new SingleValueTableEditorContent({
            target: div,
            props: {
                properties: this.plugin.settings.EditMode.properties,
                save: async (properties: string[]) => {
                    this.plugin.settings.EditMode.properties = properties;
                    await this.plugin.saveSettings();
                }
            },
        });

        this.svelteElements.push(modal);
    }

    hide(): any {
        this.svelteElements.forEach(el => el.$destroy());
        return super.hide();
    }

    private addKanbanHelperSetting(containerEl: HTMLElement) {
        let modal: ProgressPropertiesModalContent, div: HTMLDivElement, hidden: boolean = true;
        const setting = new Setting(containerEl)
            .setName("Kanban Board Helper")
            .setDesc("Update properties in links in kanban boards automatically when a card is moved to a new lane.")
            .addToggle(toggle => {
                toggle
                    .setTooltip("Toggle Kanban Helper")
                    .setValue(this.plugin.settings.KanbanHelper.enabled)
                    .onChange(async value => {
                        if (value === this.plugin.settings.KanbanHelper.enabled) return;

                        this.plugin.settings.KanbanHelper.enabled = value;

                        await this.plugin.saveSettings();
                    });
            })
            .addExtraButton(button => button.onClick(() => hidden = toggleHidden(div, hidden)))

        div = setting.settingEl.createDiv();
        setting.settingEl.style.display = "block";
        div.style.display = "none";

        modal = new KanbanHelperSettingContent({
            target: div,
            props: {
                kanbanProperties: this.plugin.settings.KanbanHelper.boards,
                boards: this.plugin.getFilesWithProperty("kanban-plugin"),
                app: this.app,
                save: async (kanbanProperties: KanbanProperty[]) => {
                    this.plugin.settings.KanbanHelper.boards = kanbanProperties;
                    await this.plugin.saveSettings();
                }
            },
        });

        this.svelteElements.push(modal);
    }

    private addUIElementsSetting(containerEl: HTMLElement) {
        new Setting(containerEl)
            .setName("UI Elements")
            .setDesc("Toggle UI elements: the 'Edit Meta' right-click menu option.")
            .addToggle(toggle => {
                toggle
                    .setTooltip("Toggle UI elements")
                    .setValue(this.plugin.settings.UIElements.enabled)
                    .onChange(async value => {
                        if (value === this.plugin.settings.UIElements.enabled) return;

                        this.plugin.settings.UIElements.enabled = value;
                        value ? this.plugin.linkMenu.registerEvent() : this.plugin.linkMenu.unregisterEvent();

                        await this.plugin.saveSettings();
                    });
            })
    }
}