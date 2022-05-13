import {PluginSettingTab, Setting} from 'obsidian';
import type MetaEdit from '../main';
import { PropertyTypes } from "../Modals/propertyTypes";
import {render, h} from "preact";

export class MetaEditSettingsTab extends PluginSettingTab {
    plugin: MetaEdit;

    constructor(plugin: MetaEdit) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'MetaEdit Settings' });

        this.addPropertyTypeSettings(containerEl);
        this.addUIElementsSetting(containerEl);
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
        new Setting(container).setName('Property Types').setDesc(
            'Configure how MetaEdit should handle multiple values in properties.',
        );
        const rc = h(PropertyTypes, {});
        const propertyTypesDiv = container.createDiv();
        render(rc, propertyTypesDiv);
    }
}
