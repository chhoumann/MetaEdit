import MetaEditParser, {type Property} from "./parser";
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
import {Notice, normalizePath} from "obsidian";
import {log} from "./logger/logManager";
import AutoPropertyValueModal from "./Modals/AutoPropertyValueModal/AutoPropertyValueModal";
import type {AutoProperty} from "./Types/autoProperty";
import {findAutoProperty, isMultiAutoProperty, withChoiceAdded} from "./autoProperties";

const fileWriteQueues: Map<string, Promise<unknown>> = new Map();

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
        // @ts-expect-error - app.plugins is not part of the public Obsidian API
        this.hasTrackerPlugin = !!this.app.plugins.plugins["obsidian-tracker"];
    }

    public async getPropertiesInFile(file: TFile): Promise<Property[]> {
        const yaml = await this.parser.parseFrontmatter(file);
        const inlineFields = await this.parser.parseInlineFields(file);
        const tags = await this.parser.getTagsForFile(file);

        return [...tags, ...yaml, ...inlineFields];
    }

    public async addYamlProp(propName: string, propValue: unknown, file: TFile): Promise<void> {
        const settings = this.plugin.settings;
        if (settings.EditMode.mode === EditMode.AllMulti ||
            (settings.EditMode.mode === EditMode.SomeMulti && settings.EditMode.properties.contains(propName))) {
            propValue = [propValue];
        }

        let propertyExists = false;
        await this.enqueueFileWrite(file, async () => {
            await this.processFrontMatter(file, (frontmatter) => {
                if (Object.prototype.hasOwnProperty.call(frontmatter, propName)) {
                    propertyExists = true;
                    return;
                }

                frontmatter[propName] = propValue;
            });
        });

        if (propertyExists) {
            new Notice(`Frontmatter in file '${file.name}' already has property '${propName}. Will not add.'`);
        }
    }

    public async addDataviewField(propName: string, propValue: unknown, file: TFile): Promise<void> {
        const valueStr = Array.isArray(propValue) ? propValue.join(", ") : String(propValue);
        const fileContent: string = await this.app.vault.read(file);
        const lines = fileContent.split("\n").reduce((obj: {[key: string]: string}, line: string, idx: number) => {
            obj[idx] = !!line ? line : "";
            return obj;
        }, {});

        const appendAfter: string = await GenericSuggester.Suggest(this.app, Object.values(lines), Object.keys(lines));
        if (!appendAfter) return;

        const splitContent: string[] = fileContent.split("\n");
        if (typeof appendAfter === "number" || parseInt(appendAfter)) {
            splitContent.splice(parseInt(appendAfter), 0, `${propName}:: ${valueStr}`);
        }
        const newFileContent = splitContent.join("\n");

        await this.app.vault.modify(file, newFileContent);
    }

    public async editMetaElement(property: Property, meta: Property[], file: TFile): Promise<void> {
        const mode: EditMode = this.plugin.settings.EditMode.mode;

        if (property.type === MetaType.Tag) {
            await this.editTag(property, file);
            return;
        }

        // Auto Properties own their value-entry UX (description, pick-or-create,
        // single/multi). They take precedence over the global EditMode flow.
        if (this.getActiveAutoProperty(property.key)) {
            await this.editAutoProperty(property, file);
            return;
        }

        if (mode === EditMode.AllMulti || mode === EditMode.SomeMulti)
            await this.multiValueMode(property, file);
        else
            await this.standardMode(property, file);
    }

    private async editTag(property: Property, file: TFile) {
        const splitTag: string[] = property.key.split("/");
        const allButLast: string = splitTag.slice(0, splitTag.length - 1).join("/");
        const trackerPluginMethod = "Use Tracker", metaEditMethod = "Use MetaEdit", choices = [trackerPluginMethod, metaEditMethod];
        let newValue: string | string[];
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
                // A tag is a single token; collapse a multi result into one string.
                newValue = Array.isArray(autoProp) ? autoProp.join(", ") : autoProp;
            else
                newValue = await GenericPrompt.Prompt(this.app, `Enter a new value for ${property.key}`);
        }

        if (newValue) {
            await this.updatePropertyInFile(property, newValue, file);
        }
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
        const propName = await GenericPrompt.Prompt(this.app, "Enter a property name", "Property", "", suggestValues);
        if (!propName) return null;

        let propValue: string | string[];
        const autoProp = await this.handleAutoProperties(propName);

        if (autoProp !== null) {
            propValue = autoProp;
        } else {
            propValue = await GenericPrompt.Prompt(this.app, "Enter a property value", "Value")
                .catch(() => null);
        }

        if (propValue === null) return null;

        return {propName, propValue: typeof propValue === "string" ? propValue.trim() : propValue};
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

    private async standardMode(property: Property, file: TFile): Promise<void> {
        // Auto Properties are intercepted in editMetaElement, so this path only
        // handles free-text values.
        const newValue = await GenericPrompt.Prompt(this.app, `Enter a new value for ${property.key}`, property.content, property.content);

        if (newValue) {
            await this.updatePropertyInFile(property, newValue, file);
        }
    }

    private async multiValueMode(property: Property, file: TFile): Promise<boolean> {
        const settings: MetaEditSettings = this.plugin.settings;
        let newValue: string | string[];


        if (settings.EditMode.mode == EditMode.SomeMulti && !settings.EditMode.properties.includes(property.key)) {
            await this.standardMode(property, file);
            return false;
        }

        let selectedOption: string, tempValue: string, splitValues: string[];
        splitValues = this.splitMultiValue(property);

        if (splitValues.length == 0 || (splitValues.length == 1 && splitValues[0] == "")) {
            const options = ["Add new value"];
            selectedOption = await GenericSuggester.Suggest(this.app, options, [ADD_FIRST_ELEMENT]);
        }
        else if (splitValues.length == 1) {
            const options = [splitValues[0], "Add to end", "Add to beginning"];
            selectedOption = await GenericSuggester.Suggest(this.app, options, [splitValues[0], ADD_TO_END, ADD_TO_BEGINNING]);
        } else {
            const options = ["Add to end", ...splitValues, "Add to beginning"];
            selectedOption = await GenericSuggester.Suggest(this.app, options, [ADD_TO_END, ...splitValues, ADD_TO_BEGINNING]);
        }

        if (!selectedOption) return;
        let selectedIndex;

        // Auto Properties are intercepted in editMetaElement; this path is free-text.
        if (selectedOption.includes("cmd")) {
            tempValue = await GenericPrompt.Prompt(this.app, "Enter a new value");
        } else {
            selectedIndex = splitValues.findIndex(el => el == selectedOption);
            tempValue = await GenericPrompt.Prompt(this.app, `Change ${selectedOption} to`, selectedOption);
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
                if (selectedIndex !== -1)
                    splitValues[selectedIndex] = tempValue;
                else
                    splitValues = [tempValue];
                newValue = splitValues.join(", ");
                break;
        }

        if (property.type === MetaType.YAML)
            newValue = this.splitMultiValue({...property, content: newValue});

        if (newValue) {
            await this.updatePropertyInFile(property, newValue, file);
            return true;
        }

        return false;
    }

    private getActiveAutoProperty(propertyName: string): AutoProperty | undefined {
        if (!this.plugin.settings.AutoProperties.enabled) return undefined;
        return findAutoProperty(this.plugin.settings.AutoProperties.properties, propertyName);
    }

    /**
     * Open the Auto Property value prompt for `propertyName`, if one is defined and
     * enabled. Returns a string for a Single property, a string[] for a Multi
     * property, or null when there is no auto property or the user cancels.
     */
    public async handleAutoProperties(propertyName: string, currentValue?: unknown): Promise<string | string[] | null> {
        const autoProp = this.getActiveAutoProperty(propertyName);
        if (!autoProp) return null;

        const isMulti = isMultiAutoProperty(autoProp, this.plugin.settings.EditMode, propertyName);

        return await AutoPropertyValueModal.Show(this.app, autoProp, {
            isMulti,
            currentValue,
            onSaveChoices: (values: string[]) => this.persistAutoPropertyChoices(autoProp, values),
        });
    }

    private async editAutoProperty(property: Property, file: TFile): Promise<void> {
        const result = await this.handleAutoProperties(property.key, property.content);
        if (result === null || result === undefined) return;

        // YAML keeps a real list; inline/tag fields store a comma-joined string.
        const newValue: unknown =
            Array.isArray(result) && property.type !== MetaType.YAML ? result.join(", ") : result;

        await this.updatePropertyInFile(property, newValue, file);
    }

    private async persistAutoPropertyChoices(autoProp: AutoProperty, values: string[]): Promise<void> {
        let updated = autoProp;
        for (const value of values) {
            updated = withChoiceAdded(updated, value);
        }
        if (updated === autoProp) return; // nothing new

        const list = this.plugin.settings.AutoProperties.properties;
        const idx = list.findIndex(a => a === autoProp || a.name === autoProp.name);
        if (idx === -1) return;

        list[idx] = {...list[idx], choices: updated.choices};
        await this.plugin.saveSettings();
    }

    public async updatePropertyInFile(property: Partial<Property>, newValue: unknown, file: TFile): Promise<void> {
        if (!property.key) return;

        await this.enqueueFileWrite(file, async () => {
            if (property.type === MetaType.YAML) {
                await this.processFrontMatter(file, (frontmatter) => {
                    frontmatter[property.key] = newValue;
                });
                return;
            }

            const fileContent = await this.app.vault.read(file);

            const newFileContent = fileContent.split("\n").map(line => {
                if (this.lineMatch(property, line)) {
                    return this.updatePropertyLine(property, newValue, line);
                }

                return line;
            }).join("\n");

            await this.app.vault.modify(file, newFileContent);
        });
    }

    private escapeSpecialCharacters(text: string): string{
        return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    }

    private lineMatch(property: Partial<Property>, line: string): boolean {
        if (!property.key) return false;

        const tagRegex = new RegExp(`^\s*${this.escapeSpecialCharacters(property.key)}`);

        if (property.key.contains('#')) {
            return tagRegex.test(line);
        }

        if (property.type === MetaType.Dataview) {
            return this.dataviewPropertyRegex(property.key).test(line);
        }

        const propertyRegex = new RegExp(`^\\s*${this.escapeSpecialCharacters(property.key)}\\s*:`);
        return propertyRegex.test(line);
    }

    private updatePropertyLine(property: Partial<Property>, newValue: unknown, line: string) {
        if (!property.key) return line;

        let newLine: string;
        switch (property.type) {
            case MetaType.Dataview:
                newLine = line.replace(this.dataviewPropertyRegex(property.key), `$1${property.key}:: ${newValue}$4`);
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
        await this.enqueueFileWrite(file, async () => {
            const yamlProperties = properties.filter(prop => prop.type === MetaType.YAML);
            const textProperties = properties.filter(prop => prop.type !== MetaType.YAML);

            if (yamlProperties.length > 0) {
                await this.processFrontMatter(file, (frontmatter) => {
                    for (const prop of yamlProperties) {
                        frontmatter[prop.key] = prop.content;
                    }
                });
            }

            if (textProperties.length === 0) return;

            let fileContent = (await this.app.vault.read(file)).split("\n");

            for (const prop of textProperties) {
                fileContent = fileContent.map(line => {

                    if (this.lineMatch(prop, line)) {
                        return this.updatePropertyLine(prop, prop.content, line)
                    }

                    return line;
                });
            }
            const newFileContent = fileContent.join("\n");

            await this.app.vault.modify(file, newFileContent);
        });
    }

    private dataviewPropertyRegex(propertyKey: string): RegExp {
        return new RegExp(`(^|[\\s\\[\\(])(${this.escapeSpecialCharacters(propertyKey)})::[ ]*([^\\)\\]\\n\\r]*)(\\]\\]|[\\]\\)]?)`, "g");
    }

    private splitMultiValue(property: Partial<Property>): string[] {
        const content = property.content;

        if (Array.isArray(content)) {
            return content.map(prop => prop?.toString().trim() ?? "").filter(Boolean);
        }

        if (content === null || content === undefined) return [];

        return content.toString()
            .replace(/^\s*\[/, "")
            .replace(/\]\s*$/, "")
            .split(",")
            .map(prop => prop.trim())
            .filter(Boolean);
    }

    private async processFrontMatter(file: TFile, update: (frontmatter: Record<string, unknown>) => void): Promise<void> {
        await this.app.fileManager.processFrontMatter(file, update);
    }

    private async enqueueFileWrite<T>(file: TFile, task: () => Promise<T>): Promise<T> {
        const key = normalizePath(file.path);
        const previous = fileWriteQueues.get(key) ?? Promise.resolve();
        const queued = previous.catch(() => undefined).then(task);

        fileWriteQueues.set(key, queued);

        try {
            return await queued;
        }
        finally {
            if (fileWriteQueues.get(key) === queued) {
                fileWriteQueues.delete(key);
            }
        }
    }
}
