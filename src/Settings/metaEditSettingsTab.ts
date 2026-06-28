import {type App, PluginSettingTab, Setting} from "obsidian";
import type MetaEdit from "../main";
import {EditMode} from "../Types/editMode";
import ProgressPropertiesModalContent
    from "../Modals/ProgressPropertiesSettingModal/ProgressPropertiesModalContent.svelte";
import AutoPropertiesModalContent from "../Modals/AutoPropertiesSettingModal/AutoPropertiesModalContent.svelte";
import KanbanHelperSettingContent from "../Modals/KanbanHelperSetting/KanbanHelperSettingContent.svelte";
import SingleValueTableEditorContent from "../Modals/shared/SingleValueTableEditorContent.svelte";
import type {ProgressProperty} from "../Types/progressProperty";
import type {AutoProperty} from "../Types/autoProperty";
import type {KanbanProperty} from "../Types/kanbanProperty";
import {type MountedSvelteComponent, mountSvelteComponent, unmountSvelteComponent} from "../svelteMount";

function toggleHiddenEl(el: HTMLElement | undefined, hidden: boolean) {
    if (!el) return hidden;

    el.classList.toggle("metaedit-hidden", !hidden);
    return !hidden;
}

export class MetaEditSettingsTab extends PluginSettingTab {
    plugin: MetaEdit;
    private svelteElements: MountedSvelteComponent[] = [];

    constructor(app: App, plugin: MetaEdit) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        this.destroySvelteElements();
        containerEl.empty();

        new Setting(containerEl)
            .setName("MetaEdit Settings")
            .setHeading();

        this.addProgressPropertiesSetting(containerEl);
        this.addAutoPropertiesSetting(containerEl);
        this.addEditMetaMenuSetting(containerEl);
        this.addEditModeSetting(containerEl);
        this.addKanbanHelperSetting(containerEl);
        this.addUIElementsSetting(containerEl);
    }

    private addProgressPropertiesSetting(containerEl: HTMLElement) {
        let hidden: boolean = true;
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
                        this.plugin.toggleAutomators();

                        await this.plugin.saveSettings();
                    });
            });

        const div = setting.settingEl.createDiv({cls: "metaedit-hidden"});
        setting.addExtraButton(button => button.onClick(() => hidden = toggleHiddenEl(div, hidden)));

        const modal = mountSvelteComponent(
            ProgressPropertiesModalContent,
            div,
            {
                properties: this.plugin.settings.ProgressProperties.properties,
                save: async (progressProperties: ProgressProperty[]) => {
                    this.plugin.settings.ProgressProperties.properties = progressProperties;
                    await this.plugin.saveSettings();
                }
            },
        );

        this.svelteElements.push(modal);
    }

    private addAutoPropertiesSetting(containerEl: HTMLElement) {
        let hidden: boolean = true;
        const setting = new Setting(containerEl)
            .setName("Auto Properties")
            .setDesc("Quick switch for values you know the value of.")
            .addToggle(toggle => {
                toggle
                    .setTooltip("Toggle Auto Properties")
                    .setValue(this.plugin.settings.AutoProperties.enabled)
                    .onChange(async value => {
                        if (value === this.plugin.settings.AutoProperties.enabled) return;

                        this.plugin.settings.AutoProperties.enabled = value;

                        await this.plugin.saveSettings();
                    });
            });

        const div = setting.settingEl.createDiv({cls: "metaedit-hidden"});
        setting.addExtraButton(b => b.onClick(() => hidden = toggleHiddenEl(div, hidden)));

        const modal = mountSvelteComponent(
            AutoPropertiesModalContent,
            div,
            {
                autoProperties: this.plugin.settings.AutoProperties.properties,
                save: async (autoProperties: AutoProperty[]) => {
                    this.plugin.settings.AutoProperties.properties = autoProperties;
                    await this.plugin.saveSettings();
                }
            },
        );

        this.svelteElements.push(modal);
    }

    private addEditMetaMenuSetting(containerEl: HTMLElement) {
        let hidden = true;
        const setting = new Setting(containerEl)
            .setName("Edit Meta menu")
            .setDesc("Control what the 'Edit Meta' menu lists. Enable it, then use the gear to hide specific properties by name or all of a note's file tags.")
            .addToggle(toggle => {
                toggle
                    .setTooltip("Toggle menu filtering")
                    .setValue(this.plugin.settings.IgnoredProperties.enabled)
                    .onChange(async value => {
                        if (value === this.plugin.settings.IgnoredProperties.enabled) return;

                        this.plugin.settings.IgnoredProperties.enabled = value;

                        await this.plugin.saveSettings();
                        this.display();
                    });
            });

        const div = this.plugin.settings.IgnoredProperties.enabled
            ? setting.settingEl.createDiv({cls: "metaedit-hidden"})
            : undefined;
        setting.addExtraButton(b => b.onClick(() => hidden = toggleHiddenEl(div, hidden)));

        if (div) {
            new Setting(div)
                .setName("Hide file tags")
                .setDesc("Hide the note's #tags from the menu, leaving only frontmatter and inline fields. A frontmatter 'tags' property stays editable.")
                .addToggle(toggle => {
                    toggle
                        .setTooltip("Toggle hiding file tags")
                        .setValue(this.plugin.settings.IgnoredProperties.hideFileTags)
                        .onChange(async value => {
                            if (value === this.plugin.settings.IgnoredProperties.hideFileTags) return;

                            this.plugin.settings.IgnoredProperties.hideFileTags = value;
                            await this.plugin.saveSettings();
                    });
                });

            div.createEl("p", {text: "Hide specific properties by name:", cls: "metaedit-table-label"});

            const modal = mountSvelteComponent(
                SingleValueTableEditorContent,
                div,
                {
                    properties: this.plugin.settings.IgnoredProperties.properties,
                    save: async (ignoredProperties: string[]) => {
                        this.plugin.settings.IgnoredProperties.properties = ignoredProperties;
                        await this.plugin.saveSettings();
                    }
                },
            );

            this.svelteElements.push(modal);
        }
    }

    private addEditModeSetting(containerEl: HTMLElement) {
        let bDivToggle: boolean = true;
        let extraButtonEl: HTMLElement | undefined;

        // For linebreaks
        const df = new DocumentFragment();
        df.createEl('p', {text: "Single: property values are just one value. "});
        df.createEl('p', {text: "Multi: properties are arrays. "})
        df.createEl('p', {text: "Some Multi: all options are single, except those specified in the settings (click button)."});

        const setting = new Setting(containerEl)
            .setName("Edit Mode")
            .setDesc(df);
        const div = setting.settingEl.createDiv({cls: "metaedit-hidden"});

        setting
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
                                toggleHiddenEl(extraButtonEl, false);
                                bDivToggle = toggleHiddenEl(div, false);
                                break;
                            case EditMode.AllSingle:
                                this.plugin.settings.EditMode.mode = EditMode.AllSingle;
                                toggleHiddenEl(extraButtonEl, false);
                                bDivToggle = toggleHiddenEl(div, false);
                                break;
                            case EditMode.SomeMulti:
                                this.plugin.settings.EditMode.mode = EditMode.SomeMulti;
                                toggleHiddenEl(extraButtonEl, true);
                                break;
                        }

                        await this.plugin.saveSettings();
                    })
            })
            .addExtraButton(b => {
                extraButtonEl = b.extraSettingsEl;
                b.setTooltip("Configure which properties are Multi.")
                return b.onClick(() => bDivToggle = toggleHiddenEl(div, bDivToggle));
            });

        if (this.plugin.settings.EditMode.mode != EditMode.SomeMulti) {
            toggleHiddenEl(extraButtonEl, false);
        }

        const modal = mountSvelteComponent(
            SingleValueTableEditorContent,
            div,
            {
                properties: this.plugin.settings.EditMode.properties,
                save: async (properties: string[]) => {
                    this.plugin.settings.EditMode.properties = properties;
                    await this.plugin.saveSettings();
                }
            },
        );

        this.svelteElements.push(modal);
    }

    hide(): any {
        this.destroySvelteElements();
        return super.hide();
    }

    private destroySvelteElements() {
        this.svelteElements.forEach(unmountSvelteComponent);
        this.svelteElements = [];
    }

    private addKanbanHelperSetting(containerEl: HTMLElement) {
        let hidden: boolean = true;
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
                        this.plugin.toggleAutomators();

                        await this.plugin.saveSettings();
                    });
            });

        const div = setting.settingEl.createDiv({cls: "metaedit-hidden"});
        setting.addExtraButton(button => button.onClick(() => hidden = toggleHiddenEl(div, hidden)));

        const modal = mountSvelteComponent(
            KanbanHelperSettingContent,
            div,
            {
                kanbanProperties: this.plugin.settings.KanbanHelper.boards,
                boards: this.plugin.getFilesWithProperty("kanban-plugin"),
                app: this.app,
                save: async (kanbanProperties: KanbanProperty[]) => {
                    this.plugin.settings.KanbanHelper.boards = kanbanProperties;
                    await this.plugin.saveSettings();
                }
            },
        );

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
                        if (value) {
                            this.plugin.linkMenu.registerEvent();
                        } else {
                            this.plugin.linkMenu.unregisterEvent();
                        }

                        await this.plugin.saveSettings();
                    });
            })
    }
}
