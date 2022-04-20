import MetaEditParser from "../parser";
import { Property } from "../Types/Property";
import type {TFile} from "obsidian";
import GenericPrompt from "../Modals/GenericPrompt/GenericPrompt";
import {EditMode} from "../Types/editMode";
import GenericSuggester from "../Modals/GenericSuggester/GenericSuggester";
import type {MetaEditSettings} from "../Settings/metaEditSettings";
import {ADD_FIRST_ELEMENT, ADD_TO_BEGINNING, ADD_TO_END} from "../constants";
import type {ProgressProperty} from "../Types/progressProperty";
import {ProgressPropertyOptions} from "../Types/progressPropertyOptions";
import {MetaType} from "../Types/metaType";
import {Notice} from "obsidian";
import {log} from "../logger/logManager";

interface IMetaController {
    addProperty(property: Property): void;
    removeProperty(property: Property): void;
    editProperty(property: Property): void;
}

export default class MetaController implements IMetaController {
    addProperty(property: Property): void {
        // Handling for YAML, Tags, and DataView.
        throw new Error("Method not implemented.");
    }

    removeProperty(property: Property): void {
        throw new Error("Method not implemented.");
    }

    editProperty(property: Property): void {
        throw new Error("Method not implemented.");
    }
}

export class MetaController_Old {
    private parser: MetaEditParser;
    private readonly hasTrackerPlugin: boolean = false;
    private useTrackerPlugin: boolean = false;

    constructor() {
        this.parser = new MetaEditParser();
        // @ts-ignore
        this.hasTrackerPlugin = !!app.plugins.plugins["obsidian-tracker"];
    }

    public async addYamlProp(propName: string, propValue: string, file: TFile): Promise<void> {
        const fileContent: string = await app.vault.read(file);
        const frontmatter: Property[] = await this.parser.parseFrontmatter(file);
        const isYamlEmpty: boolean = ((!frontmatter || frontmatter.length === 0) && !fileContent.match(/^-{3}\s*\n*\r*-{3}/));

        if (frontmatter.some(value => value.key === propName)) {
            new Notice(`Frontmatter in file '${file.name}' already has property '${propName}. Will not add.'`);
            return;
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
        await app.vault.modify(file, newFileContent);
    }

    public async addDataviewField(propName: string, propValue: string, file: TFile): Promise<void> {
        const fileContent: string = await app.vault.read(file);
        let lines = fileContent.split("\n").reduce((obj: {[key: string]: string}, line: string, idx: number) => {
            obj[idx] = !!line ? line : "";
            return obj;
        }, {});

        let appendAfter: string = await GenericSuggester.Suggest(app, Object.values(lines), Object.keys(lines));
        if (!appendAfter) return;

        let splitContent: string[] = fileContent.split("\n");
        if (typeof appendAfter === "number" || parseInt(appendAfter)) {
            splitContent.splice(parseInt(appendAfter), 0, `${propName}:: ${propValue}`);
        }
        const newFileContent = splitContent.join("\n");

        await app.vault.modify(file, newFileContent);
    }

    public async editMetaElement(property: Property, meta: Property[], file: TFile): Promise<void> {
        const mode: EditMode = this.plugin.settings.EditMode.mode;

        if (property.type === MetaType.Tag)
            await this.editTag(property, file);
        else if (mode === EditMode.AllMulti || mode === EditMode.SomeMulti)
            await this.multiValueMode(property, file);
        else
            await this.standardMode(property, file);
    }

    private async editTag(property: Property, file: TFile) {
        const splitTag: string[] = property.key.split("/");
        const allButLast: string = splitTag.slice(0, splitTag.length - 1).join("/");
        const trackerPluginMethod = "Use Tracker", metaEditMethod = "Use MetaEdit", choices = [trackerPluginMethod, metaEditMethod];
        let newValue: string;
        let method: string = metaEditMethod;

        if (this.hasTrackerPlugin)
            method = await GenericSuggester.Suggest(app, choices, choices);

        if (!method) return;

        if (method === trackerPluginMethod) {
            newValue = await GenericPrompt.Prompt(app, `Enter a new value for ${property.key}`)
            this.useTrackerPlugin = true;
        } else if (method === metaEditMethod) {
            const autoProp = await this.handleAutoProperties(allButLast);

            if (autoProp)
                newValue = autoProp;
            else
                newValue = await GenericPrompt.Prompt(app, `Enter a new value for ${property.key}`);
        }

        if (newValue) {
            await this.updatePropertyInFile(property, newValue, file);
        }
    }

    public async handleProgressProps(meta: Property[], file: TFile): Promise<void> {
        try {
            const {enabled, properties} = this.plugin.settings.ProgressProperties;
            if (!enabled) return;

            const tasks = app.metadataCache.getFileCache(file)?.listItems?.filter(li => li.task);
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
        let propName = await GenericPrompt.Prompt(app, "Enter a property name", "Property", "", suggestValues);
        if (!propName) return null;

        let propValue: string;
        const autoProp = await this.handleAutoProperties(propName);

        if (autoProp) {
            propValue = autoProp;
        } else {
            propValue = await GenericPrompt.Prompt(app, "Enter a property value", "Value")
                .catch(() => null);
        }

        if (propValue === null) return null;

        return {propName, propValue: propValue.trim()};
    }

    public async deleteProperty(property: Property, file: TFile): Promise<void> {
        const fileContent = await app.vault.read(file);
        const splitContent = fileContent.split("\n");
        const regexp = new RegExp(`^\s*${property.key}:`);

        const idx = splitContent.findIndex(s => s.match(regexp));
        const newFileContent = splitContent.filter((v, i) => {
            if (i != idx) return true;
        }).join("\n");

        await app.vault.modify(file, newFileContent);
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

    private async standardMode(property: Property, file: TFile): Promise<void> {
        const autoProp = await this.handleAutoProperties(property.key);
        let newValue;

        if (autoProp)
            newValue = autoProp;
        else
            newValue = await GenericPrompt.Prompt(app, `Enter a new value for ${property.key}`, property.content, property.content);

        if (newValue) {
            await this.updatePropertyInFile(property, newValue, file);
        }
    }

    private async multiValueMode(property: Property, file: TFile): Promise<Boolean> {
        const settings: MetaEditSettings = this.plugin.settings;
        let newValue: string;


        if (settings.EditMode.mode == EditMode.SomeMulti && !settings.EditMode.properties.includes(property.key)) {
            await this.standardMode(property, file);
            return false;
        }

        let selectedOption: string, tempValue: string, splitValues: string[];
        let currentPropValue: string = property.content;

        if (currentPropValue !== null)
            currentPropValue = currentPropValue.toString();
        else
            currentPropValue = "";

        if (property.type === MetaType.YAML) {
            splitValues = currentPropValue.split('').filter(c => !c.includes("[]")).join('').split(",");
        } else {
            splitValues = currentPropValue.split(",").map(prop => prop.trim());
        }

        if (splitValues.length == 0 || (splitValues.length == 1 && splitValues[0] == "")) {
            const options = ["Add new value"];
            selectedOption = await GenericSuggester.Suggest(app, options, [ADD_FIRST_ELEMENT]);
        }
        else if (splitValues.length == 1) {
            const options = [splitValues[0], "Add to end", "Add to beginning"];
            selectedOption = await GenericSuggester.Suggest(app, options, [splitValues[0], ADD_TO_END, ADD_TO_BEGINNING]);
        } else {
            const options = ["Add to end", ...splitValues, "Add to beginning"];
            selectedOption = await GenericSuggester.Suggest(app, options, [ADD_TO_END, ...splitValues, ADD_TO_BEGINNING]);
        }

        if (!selectedOption) return;
        let selectedIndex;

        const autoProp = await this.handleAutoProperties(property.key);
        if (autoProp) {
            tempValue = autoProp;
        } else if (selectedOption.includes("cmd")) {
            tempValue = await GenericPrompt.Prompt(app, "Enter a new value");
        } else {
            selectedIndex = splitValues.findIndex(el => el == selectedOption);
            tempValue = await GenericPrompt.Prompt(app, `Change ${selectedOption} to`, selectedOption);
        }

        if (!tempValue) return;
        switch(selectedOption) {
            case ADD_FIRST_ELEMENT:
                newValue = `${tempValue}`;
                break;
            case ADD_TO_BEGINNING:
                newValue = `${[tempValue, ...splitValues].join(", ")}`;
                break;
            case ADD_TO_END:
                newValue = `${[...splitValues, tempValue].join(", ")}`;
                break;
            default:
                if (selectedIndex)
                    splitValues[selectedIndex] = tempValue;
                else
                    splitValues = [tempValue];
                newValue = `${splitValues.join(", ")}`;
                break;
        }

        if (property.type === MetaType.YAML)
            newValue = `[${newValue}]`;

        if (newValue) {
            await this.updatePropertyInFile(property, newValue, file);
            return true;
        }

        return false;
    }

    public async handleAutoProperties(propertyName: string): Promise<string> {
        const autoProp = this.plugin.settings.AutoProperties.properties.find(a => a.name === propertyName);

        if (this.plugin.settings.AutoProperties.enabled && autoProp) {
            const options = autoProp.choices;
            return await GenericPrompt.Prompt(app, `Enter a new value for ${propertyName}`, '', '', options);
        }

        return null;
    }

    public async updatePropertyInFile(property: Partial<Property>, newValue: string, file: TFile): Promise<void> {
        const fileContent = await app.vault.read(file);

        const newFileContent = fileContent.split("\n").map(line => {
            if (this.lineMatch(property, line)) {
                return this.updatePropertyLine(property, newValue);
            }

            return line;
        }).join("\n");

        await app.vault.modify(file, newFileContent);
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
        let fileContent = (await app.vault.read(file)).split("\n");

        for (const prop of properties) {
            fileContent = fileContent.map(line => {

                if (this.lineMatch(prop, line)) {
                    return this.updatePropertyLine(prop, prop.content)
                }

                return line;
            });
        }
        const newFileContent = fileContent.join("\n");

        await app.vault.modify(file, newFileContent);
    }
}