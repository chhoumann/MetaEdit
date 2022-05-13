import { ExtraButtonComponent, PluginSettingTab, Setting } from 'obsidian';
import type MetaEdit from '../main';
import { EditMode } from '../types/editMode';
import ProgressPropertiesModalContent from '../Modals/ProgressPropertiesSettingModal/ProgressPropertiesModalContent.svelte';
import AutoPropertiesModalContent from '../Modals/AutoPropertiesSettingModal/AutoPropertiesModalContent.svelte';
import KanbanHelperSettingContent from '../Modals/KanbanHelperSetting/KanbanHelperSettingContent.svelte';
import SingleValueTableEditorContent from '../Modals/shared/SingleValueTableEditorContent.svelte';
import type { ProgressProperty } from '../types/progressProperty';
import type { AutoProperty } from '../types/autoProperty';
import type { KanbanProperty } from '../types/kanbanProperty';

function toggleHiddenEl(el: HTMLElement, bShow: boolean) {
    if (el && !bShow) {
        el.style.display = 'none';
        return true;
    } else if (el && bShow) {
        el.style.display = 'block';
        return false;
    }
    return bShow;
}

export class MetaEditSettingsTab extends PluginSettingTab {
    plugin: MetaEdit;
    private svelteElements: (
        | SingleValueTableEditorContent
        | AutoPropertiesModalContent
        | ProgressPropertiesModalContent
        | KanbanHelperSettingContent
    )[] = [];

    constructor(plugin: MetaEdit) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'MetaEdit Settings' });

        this.addPropertyTypeSettings(containerEl);
        //this.addProgressPropertiesSetting(containerEl);
        //this.addAutoPropertiesSetting(containerEl);
        //this.addIgnorePropertiesSetting(containerEl);
        //this.addEditModeSetting(containerEl);
        //this.addKanbanHelperSetting(containerEl);
        this.addUIElementsSetting(containerEl);
    }

    private addProgressPropertiesSetting(containerEl: HTMLElement) {
        let hidden: boolean = true;
        const setting = new Setting(containerEl)
            .setDesc('Update properties automatically.')
            .addToggle((toggle) => {
                toggle
                    .setTooltip('Toggle Progress Properties')
                    // @ts-ignore
                    .setValue(this.plugin.settings.ProgressProperties.enabled)
                    .onChange(async (value) => {
                        if (
                            value ===
                            // @ts-ignore
                            this.plugin.settings.ProgressProperties.enabled
                        )
                            return;

                        // @ts-ignore
                        this.plugin.settings.ProgressProperties.enabled = value;
                        this.plugin.toggleAutomators();

                        await this.plugin.saveSettings();
                    });
            })
            .addExtraButton((button: ExtraButtonComponent) =>
                button.onClick(() => (hidden = toggleHiddenEl(div, hidden))),
            );

        const div = setting.settingEl.createDiv();
        setting.settingEl.style.display = 'block';
        div.style.display = 'none';

        const modal = new ProgressPropertiesModalContent({
            target: div,
            props: {
                // @ts-ignore
                properties: this.plugin.settings.ProgressProperties.properties,
                save: async (progressProperties: ProgressProperty[]) => {
                    // @ts-ignore
                    this.plugin.settings.ProgressProperties.properties =
                        progressProperties;
                    await this.plugin.saveSettings();
                },
            },
        });

        this.svelteElements.push(modal);
    }

    private addAutoPropertiesSetting(containerEl: HTMLElement) {
        let hidden: boolean = true;
        const setting = new Setting(containerEl)
            .setName('Auto Properties')
            .setDesc('Quick switch for values you know the value of.')
            .addToggle((toggle) => {
                toggle
                    .setTooltip('Toggle Auto Properties')
                    // @ts-ignore
                    .setValue(this.plugin.settings.AutoProperties.enabled)
                    .onChange(async (value) => {
                        if (
                            value ===
                            // @ts-ignore
                            this.plugin.settings.AutoProperties.enabled
                        )
                            return;

                        // @ts-ignore
                        this.plugin.settings.AutoProperties.enabled = value;

                        await this.plugin.saveSettings();
                    });
            })
            .addExtraButton((b) =>
                b.onClick(() => (hidden = toggleHiddenEl(div, hidden))),
            );

        const div = setting.settingEl.createDiv();
        setting.settingEl.style.display = 'block';
        div.style.display = 'none';

        const modal = new AutoPropertiesModalContent({
            target: div,
            props: {
                // @ts-ignore
                autoProperties: this.plugin.settings.AutoProperties.properties,
                save: async (autoProperties: AutoProperty[]) => {
                    // @ts-ignore
                    this.plugin.settings.AutoProperties.properties =
                        autoProperties;
                    await this.plugin.saveSettings();
                },
            },
        });

        this.svelteElements.push(modal);
    }

    private addIgnorePropertiesSetting(containerEl: HTMLElement) {
        let modal: SingleValueTableEditorContent,
            div: HTMLDivElement,
            hidden = true;
        const setting = new Setting(containerEl)
            .setName('Ignore Properties')
            .setDesc('Hide these properties from the menu.')
            .addToggle((toggle) => {
                toggle
                    .setTooltip('Toggle Ignored Properties')
                    // @ts-ignore
                    .setValue(this.plugin.settings.IgnoredProperties.enabled)
                    .onChange(async (value) => {
                        if (
                            value ===
                            // @ts-ignore
                            this.plugin.settings.IgnoredProperties.enabled
                        )
                            return;

                        // @ts-ignore
                        this.plugin.settings.IgnoredProperties.enabled = value;

                        await this.plugin.saveSettings();
                        this.display();
                    });
            })
            .addExtraButton((b) =>
                b.onClick(() => (hidden = toggleHiddenEl(div, hidden))),
            );

        // @ts-ignore
        if (this.plugin.settings.IgnoredProperties.enabled) {
            div = setting.settingEl.createDiv();
            setting.settingEl.style.display = 'block';
            div.style.display = 'none';

            modal = new SingleValueTableEditorContent({
                target: div,
                props: {
                    properties:
                        // @ts-ignore
                        this.plugin.settings.IgnoredProperties.properties,
                    save: async (ignoredProperties: string[]) => {
                        // @ts-ignore
                        this.plugin.settings.IgnoredProperties.properties =
                            ignoredProperties;
                        await this.plugin.saveSettings();
                    },
                },
            });

            this.svelteElements.push(modal);
        }
    }

    private addEditModeSetting(containerEl: HTMLElement) {
        let bDivToggle: boolean = true;

        // For linebreaks
        const df = new DocumentFragment();
        df.createEl('p', {
            text: 'Single: property values are just one value. ',
        });
        df.createEl('p', { text: 'Multi: properties are arrays. ' });
        df.createEl('p', {
            text: 'Some Multi: all options are single, except those specified in the settings (click button).',
        });

        const setting = new Setting(containerEl)
            .setName('Edit Mode')
            .setDesc(df)
            .addDropdown((dropdown) => {
                dropdown
                    .addOption(EditMode.AllSingle, EditMode.AllSingle)
                    .addOption(EditMode.AllMulti, EditMode.AllMulti)
                    .addOption(EditMode.SomeMulti, EditMode.SomeMulti)
                    // @ts-ignore
                    .setValue(this.plugin.settings.EditMode.mode)
                    .onChange(async (value) => {
                        switch (value) {
                            case EditMode.AllMulti:
                                // @ts-ignore
                                this.plugin.settings.EditMode.mode =
                                    EditMode.AllMulti;
                                bDivToggle = toggleHiddenEl(div, false);
                                break;
                            case EditMode.AllSingle:
                                // @ts-ignore
                                this.plugin.settings.EditMode.mode =
                                    EditMode.AllSingle;
                                bDivToggle = toggleHiddenEl(div, false);
                                break;
                            case EditMode.SomeMulti:
                                // @ts-ignore
                                this.plugin.settings.EditMode.mode =
                                    EditMode.SomeMulti;
                                break;
                        }

                        // @ts-ignore
                        await this.plugin.saveSettings();
                    });
            })
            .addExtraButton((b) => {
                b.setTooltip('Configure which properties are Multi.');
                return b.onClick(
                    () => (bDivToggle = toggleHiddenEl(div, bDivToggle)),
                );
            });

        const div = setting.settingEl.createDiv();
        setting.settingEl.style.display = 'block';
        div.style.display = 'none';

        const modal = new SingleValueTableEditorContent({
            target: div,
            props: {
                // @ts-ignore
                properties: this.plugin.settings.EditMode.properties,
                save: async (properties: string[]) => {
                    // @ts-ignore
                    this.plugin.settings.EditMode.properties = properties;
                    await this.plugin.saveSettings();
                },
            },
        });

        this.svelteElements.push(modal);
    }

    hide(): any {
        this.svelteElements.forEach((el) => el.$destroy());
        return super.hide();
    }

    private addKanbanHelperSetting(containerEl: HTMLElement) {
        let hidden: boolean = true;
        const setting = new Setting(containerEl)
            .setName('Kanban Board Helper')
            .setDesc(
                'Update properties in links in kanban boards automatically when a card is moved to a new lane.',
            )
            .addToggle((toggle) => {
                toggle
                    .setTooltip('Toggle Kanban Helper')
                    // @ts-ignore
                    .setValue(this.plugin.settings.KanbanHelper.enabled)
                    .onChange(async (value) => {
                        // @ts-ignore
                        if (value === this.plugin.settings.KanbanHelper.enabled)
                            return;

                        // @ts-ignore
                        this.plugin.settings.KanbanHelper.enabled = value;
                        this.plugin.toggleAutomators();

                        await this.plugin.saveSettings();
                    });
            })
            .addExtraButton((button) =>
                button.onClick(() => (hidden = toggleHiddenEl(div, hidden))),
            );

        const div = setting.settingEl.createDiv();
        setting.settingEl.style.display = 'block';
        div.style.display = 'none';

        const modal = new KanbanHelperSettingContent({
            target: div,
            props: {
                // @ts-ignore
                kanbanProperties: this.plugin.settings.KanbanHelper.boards,
                boards: this.plugin.getFilesWithProperty('kanban-plugin'),
                app,
                save: async (kanbanProperties: KanbanProperty[]) => {
                    // @ts-ignore
                    this.plugin.settings.KanbanHelper.boards = kanbanProperties;
                    await this.plugin.saveSettings();
                },
            },
        });

        this.svelteElements.push(modal);
    }

    private addUIElementsSetting(containerEl: HTMLElement) {
        new Setting(containerEl)
            .setName('UI Elements')
            .setDesc(
                "Toggle UI elements: the 'Edit Meta' right-click menu option.",
            )
            .addToggle((toggle) => {
                toggle
                    .setTooltip('Toggle UI elements')
                    // @ts-ignore
                    .setValue(this.plugin.settings.UIElements.enabled)
                    .onChange(async (value) => {
                        // @ts-ignore
                        if (value === this.plugin.settings.UIElements.enabled)
                            return;

                        // @ts-ignore
                        this.plugin.settings.UIElements.enabled = value;
                        value
                            ? // @ts-ignore
                              this.plugin.linkMenu.registerEvent()
                            : // @ts-ignore
                              this.plugin.linkMenu.unregisterEvent();

                        await this.plugin.saveSettings();
                    });
            });
    }

    private addPropertyTypeSettings(container: HTMLElement) {
        const setting = new Setting(container)
            .setName('Property Types')
            .setDesc("Manage handling for properties.");

        setting.settingEl.createDiv().innerHTML = `
            <p> Manage handling for properties. </p>
            <p> You can add, remove, and edit property types. </p>
            <p> You can also set the default property type for new files. </p>
        `;

    }
}
