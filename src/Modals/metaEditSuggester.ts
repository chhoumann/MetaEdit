import { App, FuzzyMatch, FuzzySuggestModal, TFile } from 'obsidian';
import type MetaEdit from '../main';
import type MetaController from '../metaController/metaController';
import type { Property } from '../types/Property';
import { MAIN_SUGGESTER_OPTIONS, newDataView, newYaml } from '../constants';
import { MetaType } from '../types/metaType';
import type { AutoProperty } from '../types/autoProperty';

export default class MetaEditSuggester extends FuzzySuggestModal<Property> {
    public app: App;
    private readonly file: TFile;
    private plugin: MetaEdit;
    private readonly data: Property[];
    private readonly options: Property[];
    private controller: MetaController;
    private suggestValues: string[] | undefined;

    constructor(
        app: App,
        plugin: MetaEdit,
        data: Property[],
        file: TFile,
        controller: MetaController,
    ) {
        super(app);
        this.file = file;
        this.app = app;
        this.plugin = plugin;
        this.data = this.removeIgnored(data);
        this.controller = controller;
        this.options = MAIN_SUGGESTER_OPTIONS;

        this.setSuggestValues();

        this.setInstructions([
            { command: '❌', purpose: 'Delete property' },
            { command: '🔃', purpose: 'Transform to YAML/Dataview' },
        ]);
    }

    renderSuggestion(item: FuzzyMatch<Property>, el: HTMLElement) {
        super.renderSuggestion(item, el);

        if (Object.values(this.options).find((v) => v === item.item)) {
            el.style.fontWeight = 'bold';
        } else {
            this.createButton(el, '❌', this.deleteItem(item));
            this.createButton(el, '🔃', this.transformProperty(item));
        }
    }

    getItemText(item: Property): string {
        return item.key;
    }

    getItems(): Property[] {
        return [...this.options, ...this.data];
    }

    async onChooseItem(
        item: Property,
        // @ts-ignore
        evt: MouseEvent | KeyboardEvent,
    ): Promise<void> {
        if (item.content === newYaml) {
            const newProperty = await this.controller.createNewProperty(
                this.suggestValues,
            );
            if (!newProperty) {
                // @ts-ignore
                return null;
            }

            const { propName, propValue } = newProperty;
            await this.controller.addYamlProp(propName, propValue, this.file);
            return;
        }

        if (item.content === newDataView) {
            const newProperty = await this.controller.createNewProperty(
                this.suggestValues,
            );
            if (!newProperty) {
                // @ts-ignore
                return null;
            }

            const { propName, propValue } = newProperty;
            await this.controller.addDataviewField(
                propName,
                propValue,
                this.file,
            );
            return;
        }

        await this.controller.editMetaElement(item, this.data, this.file);
    }

    private deleteItem(item: FuzzyMatch<Property>) {
        return async (evt: MouseEvent) => {
            evt.stopPropagation();
            await this.controller.deleteProperty(item.item, this.file);
            this.close();
        };
    }

    private transformProperty(item: FuzzyMatch<Property>) {
        return async (evt: MouseEvent | KeyboardEvent) => {
            evt.stopPropagation();
            const { item: property } = item;
            if (property.type === MetaType.YAML) {
                await this.toDataview(property);
            } else {
                await this.toYaml(property);
            }

            this.close();
        };
    }

    private async toYaml(property: Property) {
        await this.controller.deleteProperty(property, this.file);
        await this.controller.addYamlProp(
            property.key,
            // @ts-ignore
            property.content,
            this.file,
        );
    }

    private async toDataview(property: Property) {
        await this.controller.deleteProperty(property, this.file);
        await this.controller.addDataviewField(
            property.key,
            // @ts-ignore
            property.content,
            this.file,
        );
    }

    private createButton(
        el: HTMLElement,
        content: string,
        callback: (evt: MouseEvent) => void,
    ) {
        const itemButton = el.createEl('button');
        itemButton.textContent = content;
        itemButton.classList.add('not-a-button');
        itemButton.style.float = 'right';
        itemButton.style.marginRight = '4px';
        itemButton.addEventListener('click', callback);
    }

    private removeIgnored(data: Property[]): Property[] {
        // @ts-ignore
        const ignored = this.plugin.settings.IgnoredProperties.properties;
        const purged: Property[] = [];

        for (const item in data) {
            if (!ignored.contains(data[item].key)) purged.push(data[item]);
        }

        return purged;
    }

    private setSuggestValues() {
        // @ts-ignore
        const autoProps = this.plugin.settings.AutoProperties.properties;

        this.suggestValues = autoProps.reduce(
            (arr: string[], val: AutoProperty) => {
                if (
                    !this.data.find(
                        (prop) =>
                            val.name === prop.key || val.name.startsWith('#'),
                    )
                ) {
                    arr.push(val.name);
                }

                return arr;
            },
            [],
        );
    }
}
