import {type App, type FuzzyMatch, FuzzySuggestModal, type TFile} from "obsidian";
import type MetaEdit from "../main";
import type MetaController from "../metaController";
import type {Property} from "../parser";
import {MAIN_SUGGESTER_OPTIONS, newDataView, newYaml} from "../constants";
import {MetaType} from "../Types/metaType";
import type {AutoProperty} from "../Types/autoProperty";
import {getKnownPropertyNames} from "./GenericPrompt/valueSuggest";
import {setPendingValueContext} from "./GenericPrompt/promptValueContext";
import {filterMenuItems} from "./menuFilter";

export default class MetaEditSuggester extends FuzzySuggestModal<Property> {
    public app: App;
    private readonly file: TFile;
    private plugin: MetaEdit;
    private readonly data: Property[];
    private readonly options: Property[];
    private controller: MetaController;
    private suggestValues: string[];

    constructor(app: App, plugin: MetaEdit, data: Property[], file: TFile, controller: MetaController) {
        super(app);
        this.file = file;
        this.app = app;
        this.plugin = plugin;
        const ignored = plugin.settings.IgnoredProperties;
        this.data = filterMenuItems(data, {
            enabled: ignored.enabled,
            ignoredProperties: ignored.properties,
            hideFileTags: ignored.hideFileTags,
        });
        this.controller = controller;
        this.options = MAIN_SUGGESTER_OPTIONS;

        this.setSuggestValues();

        this.setInstructions([
            {command: "❌", purpose: "Delete property"},
            {command: "🔃", purpose: "Transform to YAML/Dataview"}
        ])
    }

    renderSuggestion(item: FuzzyMatch<Property>, el: HTMLElement) {
        super.renderSuggestion(item, el);

        if (Object.values(this.options).find(v => v === item.item)) {
            el.style.fontWeight = "bold";
        } else {
            this.createButton(el,"❌", this.deleteItem(item));
            this.createButton(el, "🔃", this.transformProperty(item))
        }
    }

    getItemText(item: Property): string {
        return item.key;
    }

    getItems(): Property[] {
        return [...this.options, ...this.data];
    }

    async onChooseItem(item: Property, _evt: MouseEvent | KeyboardEvent): Promise<void> {
        if (item.content === newYaml) {
            const newProperty = await this.controller.createNewProperty(this.suggestValues);
            if (!newProperty) return null;

            const {propName, propValue} = newProperty;
            await this.controller.addYamlProp(propName, propValue, this.file);
            return;
        }

        if (item.content === newDataView) {
            const newProperty = await this.controller.createNewProperty(this.suggestValues);
            if (!newProperty) return null;

            const {propName, propValue} = newProperty;
            await this.controller.addDataviewField(propName, propValue, this.file);
            return;
        }

        // Hand the prompt the property it is editing so it can offer value
        // autocomplete and a native date picker, without routing UI concerns
        // through the controller's write/parse core. Cleared in finally so it
        // never outlives this edit.
        setPendingValueContext({app: this.app, key: item.key, type: item.type});
        try {
            await this.controller.editMetaElement(item, this.data, this.file);
        } finally {
            setPendingValueContext(null);
        }
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
            const {item: property} = item;
            if (property.type === MetaType.YAML) {
                await this.toDataview(property);
            } else {
                await this.toYaml(property);
            }

            this.close();
        }
    }

    private async toYaml(property: Property) {
        await this.controller.deleteProperty(property, this.file);
        await this.controller.addYamlProp(property.key, property.content, this.file);
    }

    private async toDataview(property: Property) {
        await this.controller.deleteProperty(property, this.file);
        await this.controller.addDataviewField(property.key, property.content, this.file);
    }

    private createButton(el: HTMLElement, content: string, callback: (evt: MouseEvent) => void) {
        const itemButton = el.createEl("button");
        itemButton.textContent = content;
        itemButton.classList.add("not-a-button");
        itemButton.style.float = "right";
        itemButton.style.marginRight = "4px";
        itemButton.addEventListener("click", callback);
    }

    private setSuggestValues() {
        const existing = new Set(this.data.map(prop => prop.key));
        const names = new Set<string>();

        // Configured Auto Property names (existing behaviour).
        for (const autoProp of this.plugin.settings.AutoProperties.properties as AutoProperty[]) {
            if (!autoProp.name.startsWith('#')) names.add(autoProp.name);
        }

        // Property names already used in the vault, so the "new property" name
        // prompt autocompletes known keys instead of free-typing them.
        for (const name of getKnownPropertyNames(this.app)) names.add(name);

        this.suggestValues = [...names].filter(name => !existing.has(name));
    }
}