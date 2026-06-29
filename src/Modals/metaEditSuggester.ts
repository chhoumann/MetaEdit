import {type App, type FuzzyMatch, FuzzySuggestModal, Notice, setIcon, setTooltip, type TFile} from "obsidian";
import type MetaEdit from "../main";
import type MetaController from "../metaController";
import type {Property} from "../parser";
import {MAIN_SUGGESTER_OPTIONS, newDataView, newYaml} from "../constants";
import {MetaType} from "../Types/metaType";
import type {AutoProperty} from "../Types/autoProperty";
import {getKnownPropertyNames} from "./GenericPrompt/valueSuggest";
import {setPendingValueContext} from "./GenericPrompt/promptValueContext";
import {canStructureEditProperty, filterMenuItems} from "./menuFilter";
import {isReservedFrontmatterKey, isYamlParentContainerValue} from "../yamlPath";
import {shouldUseTypedListEditor} from "../typedList";

const DELETE_PROPERTY_ICON = "trash-2";
const TRANSFORM_PROPERTY_ICON = "replace";
const DELETE_PROPERTY_TOOLTIP = "Delete property";
const TRANSFORM_PROPERTY_TOOLTIP = "Transform to YAML ⇄ Dataview";

export default class MetaEditSuggester extends FuzzySuggestModal<Property> {
    public app: App;
    private readonly file: TFile;
    private plugin: MetaEdit;
    private readonly data: Property[];
    private readonly options: Property[];
    private controller: MetaController;
    private suggestValues: string[];
    // Every property key actually present in the file, BEFORE the ignored/parent
    // filtering used for the list. Used to keep already-present keys out of the
    // "new property" name suggestions, even ones hidden by IgnoredProperties.
    private readonly fileKeys: Set<string>;

    constructor(app: App, plugin: MetaEdit, data: Property[], file: TFile, controller: MetaController) {
        super(app);
        this.file = file;
        this.app = app;
        this.plugin = plugin;
        this.fileKeys = new Set(data.map(prop => prop.key));
        const ignored = plugin.settings.IgnoredProperties;
        this.data = filterMenuItems(data, {
            enabled: ignored.enabled,
            ignoredProperties: ignored.properties,
            hideFileTags: ignored.hideFileTags,
        }).filter(item => !MetaEditSuggester.isYamlParentContainer(item));
        this.controller = controller;
        this.options = MAIN_SUGGESTER_OPTIONS;

        this.setSuggestValues();

        this.setInstructions([
            {command: "#tag", purpose: "rename in this note · vault-wide: Tag pane"},
        ])
    }

    renderSuggestion(item: FuzzyMatch<Property>, el: HTMLElement) {
        super.renderSuggestion(item, el);

        if (Object.values(this.options).find(v => v === item.item)) {
            el.classList.add("metaedit-suggester-command");
        } else {
            if (MetaEditSuggester.canStructureEdit(item.item)) {
                this.createButton(el, DELETE_PROPERTY_ICON, DELETE_PROPERTY_TOOLTIP, this.deleteItem(item));
                this.createButton(el, TRANSFORM_PROPERTY_ICON, TRANSFORM_PROPERTY_TOOLTIP, this.transformProperty(item))
            }
        }
    }

    getItemText(item: Property): string {
        // Disambiguate repeated body tags so the user can tell which occurrence
        // they are about to edit (each row rewrites its own exact span). Show the
        // line and an occurrence ordinal, so even two #dup on the same line differ.
        if (item.type === MetaType.Tag && item.position) {
            const sameKey = this.data
                .filter(d => d.type === MetaType.Tag && d.key === item.key && d.position)
                .sort((a, b) => a.position!.start - b.position!.start);
            if (sameKey.length > 1) {
                const ordinal = sameKey.findIndex(d => d.position!.start === item.position!.start) + 1;
                const line = item.position.line !== undefined ? `line ${item.position.line + 1}, ` : "";
                return `${item.key} (${line}${ordinal}/${sameKey.length})`;
            }
        }
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
            // The add fails closed on a reserved object-machinery key
            // (__proto__/constructor/prototype). Surface it as a Notice here so
            // a typed reserved name does not become an uncaught rejection. The
            // inline (Dataview) path below is line-based, not a frontmatter key,
            // so it is intentionally NOT guarded.
            try {
                await this.controller.addYamlProp(propName, propValue, this.file);
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                new Notice(`MetaEdit could not add '${propName}': ${reason}`);
            }
            return;
        }

        if (item.content === newDataView) {
            const newProperty = await this.controller.createNewProperty(this.suggestValues);
            if (!newProperty) return null;

            const {propName, propValue} = newProperty;
            await this.controller.appendDataviewField(propName, propValue, this.file);
            return;
        }

        if (MetaEditSuggester.isYamlParentContainer(item)) return;

        // Hand legacy GenericPrompt the property it is editing so it can offer
        // value autocomplete and a native date picker. The typed list modal owns
        // its inputs and does not consume this singleton context.
        if (shouldUseTypedListEditor(item)) setPendingValueContext(null);
        else setPendingValueContext({app: this.app, key: item.key, type: item.type});
        try {
            await this.controller.editMetaElement(item, this.data, this.file);
        } finally {
            setPendingValueContext(null);
        }
    }

    private deleteItem(item: FuzzyMatch<Property>) {
        return async (evt: MouseEvent) => {
            evt.stopPropagation();
            // Always close the modal, even if the write fails, so a rejected
            // delete never leaves the suggester stuck open over stale data.
            try {
                await this.controller.deleteProperty(item.item, this.file);
            } finally {
                this.close();
            }
        };
    }

    private transformProperty(item: FuzzyMatch<Property>) {
        return async (evt: MouseEvent | KeyboardEvent) => {
            evt.stopPropagation();
            const {item: property} = item;
            if (!MetaEditSuggester.canStructureEdit(property)) return;

            // Transforming a non-YAML field INTO YAML would create a frontmatter
            // key. Refuse a reserved key BEFORE toYaml deletes the source field,
            // so the transform never deletes data it then cannot re-add. The
            // reverse (YAML -> inline) is allowed: it removes the frontmatter key
            // and is line-based, so it cannot alias object machinery.
            if (property.type !== MetaType.YAML && isReservedFrontmatterKey(property.key)) {
                new Notice(`MetaEdit: "${property.key}" is a reserved property name and can't be a YAML property.`);
                this.close();
                return;
            }

            try {
                if (property.type === MetaType.YAML) {
                    await this.toDataview(property);
                } else {
                    await this.toYaml(property);
                }
            } catch (error) {
                // A transform deletes then re-adds; if the re-add fails the property
                // is already gone, so surface it instead of letting the modal close
                // hide the loss.
                const reason = error instanceof Error ? error.message : String(error);
                new Notice(`MetaEdit could not transform '${property.key}': ${reason}. It may have been removed - reopen the note to check.`);
            } finally {
                this.close();
            }
        }
    }

    private async toYaml(property: Property) {
        await this.controller.deleteProperty(property, this.file);
        await this.controller.addYamlProp(property.key, property.content, this.file);
    }

    private async toDataview(property: Property) {
        await this.controller.deleteProperty(property, this.file);
        await this.controller.appendDataviewField(property.key, property.content, this.file);
    }

    private createButton(el: HTMLElement, iconName: string, tooltip: string, callback: (evt: MouseEvent) => void) {
        const itemButton = el.createEl("button");
        itemButton.type = "button";
        itemButton.classList.add("clickable-icon", "metaedit-suggester-action-button");
        itemButton.setAttribute("aria-label", tooltip);
        setIcon(itemButton, iconName);
        setTooltip(itemButton, tooltip);
        itemButton.addEventListener("click", callback);
    }

    private static canStructureEdit(property: Property): boolean {
        return canStructureEditProperty(property);
    }

    private static isYamlParentContainer(property: Property): boolean {
        if (property.type !== MetaType.YAML || property.isVirtual) return false;
        return isYamlParentContainerValue(property.content);
    }

    private setSuggestValues() {
        // Exclude every key already in the file (not just the visible rows), so an
        // ignored-but-present property is never offered as a "new" name and then
        // rejected with the "already has property" Notice.
        const existing = this.fileKeys;
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
