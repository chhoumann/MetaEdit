import MetaEditParser, {Property} from "./Parser/parser";
import type {App, TFile} from "obsidian";
import type MetaEdit from "./main";
import GenericPrompt from "./Modals/GenericPrompt/GenericPrompt";
import {EditMode} from "./Types/editMode";
import GenericSuggester from "./Modals/GenericSuggester/GenericSuggester";
import type {MetaEditSettings} from "./Settings/metaEditSettings";
import {ADD_FIRST_ELEMENT, ADD_TO_BEGINNING, ADD_TO_END} from "./constants";
import type {ProgressProperty} from "./Types/progressProperty";
import {ProgressPropertyOptions} from "./Types/progressPropertyOptions";
import {MetaType} from "./Types/metaType";
import {Notice} from "obsidian";
import {log} from "./logger/logManager";
import {MetaDataType} from "./Types/MetaDataType";
import PropertyListEditorModal from "./Modals/ListEditor/PropertyListEditorModal";

export default class MetaController {
    private parser: MetaEditParser;
    private readonly app: App;
    private plugin: MetaEdit;
    private readonly hasTrackerPlugin: boolean = false;
    private useTrackerPlugin: boolean = false;

    constructor(app: App, plugin: MetaEdit) {
        this.app = app;
        this.parser = new MetaEditParser(app);
        this.plugin = plugin;
        // @ts-ignore
        this.hasTrackerPlugin = !!this.app.plugins.plugins["obsidian-tracker"];
    }

    public async getPropertiesInFile(file: TFile): Promise<Property[]> {
        const yaml = await this.parser.parseFrontmatter(file);
        const inlineFields = await this.parser.parseInlineFields(file);
        const tags = await this.parser.getTagsForFile(file);

        return [...tags, ...yaml, ...inlineFields];
    }

    public async addYamlProp(propName: string, propValue: string, file: TFile): Promise<void> {
        const fileContent: string = await this.app.vault.read(file);
        const frontmatter: Property[] = await this.parser.parseFrontmatter(file);
        const isYamlEmpty: boolean = ((!frontmatter || frontmatter.length === 0) && !fileContent.match(/^-{3}\s*\n*\r*-{3}/));

        if (frontmatter.some(value => value.key === propName)) {
            new Notice(`Frontmatter in file '${file.name}' already has property '${propName}. Will not add.'`);
            return;
        }

        const settings = this.plugin.settings;
        if (settings.EditMode.mode === EditMode.AllMulti ||
            (settings.EditMode.mode === EditMode.SomeMulti && settings.EditMode.properties.contains(propName))) {
            propValue = `[${propValue}]`;
        }

        let splitContent = fileContent.split("\n");
        if (isYamlEmpty) {
            splitContent.unshift("---");
            splitContent.unshift(`${propName}: ${propValue}`);
            splitContent.unshift("---");
        }
        else {
            splitContent.splice(1, 0, `${propName}: ${propValue}`);
        }

        const newFileContent = splitContent.join("\n");
        await this.app.vault.modify(file, newFileContent);
    }

    public async addDataviewField(propName: string, propValue: string, file: TFile): Promise<void> {
        const fileContent: string = await this.app.vault.read(file);
        let lines = fileContent.split("\n").reduce((obj: {[key: string]: string}, line: string, idx: number) => {
            obj[idx] = !!line ? line : "";
            return obj;
        }, {});

        let appendAfter: string = await GenericSuggester.Suggest(this.app, Object.values(lines), Object.keys(lines));
        if (!appendAfter) return;

        let splitContent: string[] = fileContent.split("\n");
        if (typeof appendAfter === "number" || parseInt(appendAfter)) {
            splitContent.splice(parseInt(appendAfter), 0, `${propName}:: ${propValue}`);
        }
        const newFileContent = splitContent.join("\n");

        await this.app.vault.modify(file, newFileContent);
    }

    public async editMetaElement(property: Property, meta: Property[], file: TFile): Promise<void> {
        switch (property.type) {
            case MetaType.YAML:
                await this.editYamlProperty(property, file);
                break;
            case MetaType.Dataview:
                break;
            case MetaType.Tag:
                await this.editTag(property, file);
                break;
            case MetaType.Option:
                break;
        }
    }

    private async editTag(property: Property, file: TFile) {
        const splitTag: string[] = property.key.split("/");
        const allButLast: string = splitTag.slice(0, splitTag.length - 1).join("/");
        const trackerPluginMethod = "Use Tracker", metaEditMethod = "Use MetaEdit", choices = [trackerPluginMethod, metaEditMethod];
        let newValue: string;
        let method: string = metaEditMethod;

        if (this.hasTrackerPlugin)
            method = await GenericSuggester.Suggest(this.app, choices, choices);

        if (!method) return;

        if (method === trackerPluginMethod) {
            newValue = await GenericPrompt.Prompt(this.app, `Enter a new value for ${property.key}`)
            this.useTrackerPlugin = true;
        } else if (method === metaEditMethod) {
            const autoProp = await this.handleAutoProperties(allButLast);

            if (autoProp)
                newValue = autoProp;
            else
                newValue = await GenericPrompt.Prompt(this.app, `Enter a new value for ${property.key}`);
        }

        if (newValue) {
            await this.updatePropertyInFile(property, newValue, file);
        }
    }

    private async editYamlProperty(property: Property, file: TFile) {
        // Depending on data type, we need to do something different.
        // Arrays should ask for lists of values, and objects should ask for a key/value pair.
        // Simple values should just be prompted for a new value.
        switch (property.dataType) {
            case MetaDataType.Array:
                const newList = await PropertyListEditorModal.Prompt(this.app, (property.content as Property[]));
                
                break;
            case MetaDataType.Object:
                break;
            case MetaDataType.KeyValue:
                break;
            case MetaDataType.ArrayItem:
                break;
        }
    }

    private async editDataViewProperty(property: Property, file: TFile) {
        // ...
    }

    public async handleProgressProps(meta: Property[], file: TFile): Promise<void> {
        try {
            const {enabled, properties} = this.plugin.settings.ProgressProperties;
            if (!enabled) return;

            const tasks = this.app.metadataCache.getFileCache(file)?.listItems?.filter(li => li.task);
            if (!tasks) return;
            let total: number = 0, complete: number = 0, incomplete: number = 0;

            total = tasks.length;
            complete = tasks.filter(i => i.task != " ").length;
            incomplete = total - complete;

            const props = await this.progressPropHelper(properties, meta, {total, complete, incomplete});
            await this.updateMultipleInFile(props, file);
        }
        catch (e) {
            log.logError(e);
        }
    }

    public async createNewProperty(suggestValues?: string[]) {
        let propName = await GenericPrompt.Prompt(this.app, "Enter a property name", "Property", "", suggestValues);
        if (!propName) return null;

        let propValue: string;
        const autoProp = await this.handleAutoProperties(propName);

        if (autoProp) {
            propValue = autoProp;
        } else {
            propValue = await GenericPrompt.Prompt(this.app, "Enter a property value", "Value")
                .catch(() => null);
        }

        if (propValue === null) return null;

        return {propName, propValue: propValue.trim()};
    }

    public async deleteProperty(property: Property, file: TFile): Promise<void> {
        const fileContent = await this.app.vault.read(file);
        const splitContent = fileContent.split("\n");
        const regexp = new RegExp(`^\s*${property.key}:`);

        const idx = splitContent.findIndex(s => s.match(regexp));
        const newFileContent = splitContent.filter((v, i) => {
            if (i != idx) return true;
        }).join("\n");

        await this.app.vault.modify(file, newFileContent);
    }

    private async progressPropHelper(progressProps: ProgressProperty[], meta: Property[], counts: {total: number, complete: number, incomplete: number}) {
        return progressProps.reduce((obj: Property[], el) => {
            const property = meta.find(prop => prop.key === el.name);
            if (property) {
                switch (el.type) {
                    case ProgressPropertyOptions.TaskComplete:
                        obj.push({...property, content: counts.complete.toString()});
                        break;
                    case ProgressPropertyOptions.TaskIncomplete:
                        obj.push({...property, content: counts.incomplete.toString()});
                        break;
                    case ProgressPropertyOptions.TaskTotal:
                        obj.push({...property, content: counts.total.toString()});
                        break;
                    default: break;
                }
            }

            return obj;
        }, [])
    }

    public async handleAutoProperties(propertyName: string): Promise<string> {
        const autoProp = this.plugin.settings.AutoProperties.properties.find(a => a.name === propertyName);

        if (this.plugin.settings.AutoProperties.enabled && autoProp) {
            const options = autoProp.choices;
            return await GenericPrompt.Prompt(this.app, `Enter a new value for ${propertyName}`, '', '', options);
        }

        return null;
    }

    public async updatePropertyInFile(property: Partial<Property>, newValue: string, file: TFile): Promise<void> {
        const fileContent = await this.app.vault.read(file);

        const newFileContent = fileContent.split("\n").map(line => {
            if (this.lineMatch(property, line)) {
                return this.updatePropertyLine(property, newValue);
            }

            return line;
        }).join("\n");

        await this.app.vault.modify(file, newFileContent);
    }

    private lineMatch(property: Partial<Property>, line: string): boolean {
        const propertyRegex = new RegExp(`^\s*${property.key}\:{1,2}`);
        const tagRegex = new RegExp(`^\s*${property.key}`);

        if (property.key.contains('#')) {
            return tagRegex.test(line);
        }

        return propertyRegex.test(line);
    }

    private updatePropertyLine(property: Partial<Property>, newValue: string) {
        let newLine: string;
        switch (property.type) {
            case MetaType.Dataview:
                newLine = `${property.key}:: ${newValue}`;
                break;
            case MetaType.YAML:
                newLine = `${property.key}: ${newValue}`;
                break;
            case MetaType.Tag:
                if (this.useTrackerPlugin) {
                    newLine = `${property.key}:${newValue}`;
                } else {
                    const splitTag: string[] = property.key.split("/");
                    if (splitTag.length === 1)
                        newLine = `${splitTag[0]}/${newValue}`;
                    else if (splitTag.length > 1) {
                        const allButLast: string = splitTag.slice(0, splitTag.length - 1).join("/");
                        newLine = `${allButLast}/${newValue}`;
                    } else
                        newLine = property.key;
                }
                break;
            default:
                newLine = property.key;
                break;
        }

        return newLine;
    }

    private async updateMultipleInFile(properties: Property[], file: TFile): Promise<void> {
        let fileContent = (await this.app.vault.read(file)).split("\n");

        for (const prop of properties) {
            fileContent = fileContent.map(line => {

                if (this.lineMatch(prop, line)) {
                    return this.updatePropertyLine(prop, prop.content.toString())
                }

                return line;
            });
        }
        const newFileContent = fileContent.join("\n");

        await this.app.vault.modify(file, newFileContent);
    }
}