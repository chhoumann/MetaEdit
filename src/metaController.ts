import MetaEditParser from "./parser";
import type {App, FrontMatterCache, TFile} from "obsidian";
import type MetaEdit from "./main";
import GenericPrompt from "./Modals/GenericPrompt/GenericPrompt";
import {EditMode} from "./Types/editMode";
import GenericSuggester from "./Modals/GenericSuggester/GenericSuggester";
import type {MetaEditSettings} from "./Settings/metaEditSettings";
import {ADD_FIRST_ELEMENT, ADD_TO_BEGINNING, ADD_TO_END} from "./constants";
import type {ProgressProperty} from "./Types/progressProperty";
import {ProgressPropertyOptions} from "./Types/progressPropertyOptions";
import type {SuggestData} from "./Types/suggestData";

export default class MetaController {
    private parser: MetaEditParser;
    private readonly app: App;
    private plugin: MetaEdit;

    constructor(app: App, plugin: MetaEdit) {
        this.app = app;
        this.parser = new MetaEditParser(app);
        this.plugin = plugin;
    }

    public async getPropertiesInFile(file: TFile) {
        const yaml = this.parser.parseFrontmatter(file);
        const inlineFields = await this.parser.parseInlineFields(file);

        return {...yaml, ...inlineFields};
    }

    public async addYamlProp(propName: string, propValue: string, file: TFile) {
        const fileContent: string = await this.app.vault.read(file);
        const frontmatter: FrontMatterCache = this.app.metadataCache.getFileCache(file).frontmatter;
        const isYamlEmpty: boolean = (frontmatter === undefined && !fileContent.match(/^-{3}\s*\n*\r*-{3}/));

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

    public async addDataviewField(propName: string, propValue: string, file: TFile) {
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

    public async editMetaElement(toEdit: string, meta: SuggestData, file: TFile) {
        const mode: EditMode = this.plugin.settings.EditMode.mode;

        if (mode === EditMode.AllMulti || mode === EditMode.SomeMulti)
            await this.multiValueMode(toEdit, meta, file);
        else
            await this.standardMode(toEdit, file);
    }

    public async handleProgressProps(meta: SuggestData, file: TFile) {
        try {
            const {enabled, properties} = this.plugin.settings.ProgressProperties;
            if (!enabled) return;

            const tasks = this.app.metadataCache.getFileCache(file)?.listItems?.filter(li => li.task);
            let total: number = 0, complete: number = 0, incomplete: number = 0;

            if (tasks) {
                total = tasks.length;
                complete = tasks.filter(i => i.task != " ").length;
                incomplete = total - complete;
            }

            const props = await this.progressPropHelper(properties, meta, {total, complete, incomplete});
            await this.updateMultipleInFile(props, file);
        }
        catch (e) {
            this.plugin.logError(e);
        }
    }

    public async createNewProperty() {
        let propName = await GenericPrompt.Prompt(this.app, "Enter a property name", "Property");
        if (!propName) return null;

        let propValue: string;
        const autoProp = await this.handleAutoProperties(propName);

        if (autoProp) {
            propValue = autoProp;
        } else {
            propValue = await GenericPrompt.Prompt(this.app, "Enter a property value", "Value");
            propValue = propValue.trim()
        }

        if (!propValue) return null;

        return {propName, propValue};
    }

    private async progressPropHelper(progressProps: ProgressProperty[], meta: SuggestData, counts: {total: number, complete: number, incomplete: number}) {
        return progressProps.reduce((obj: {[name: string]: string}, el) => {
            if (meta[el.name] != null) {
                switch (el.type) {
                    case ProgressPropertyOptions.TaskComplete:
                        obj[el.name] = `${counts.complete}`;
                        break;
                    case ProgressPropertyOptions.TaskIncomplete:
                        obj[el.name] = `${counts.incomplete}`;
                        break;
                    case ProgressPropertyOptions.TaskTotal:
                        obj[el.name] = `${counts.total}`;
                        break;
                    default: break;
                }
            }
            return obj;
        }, {})
    }

    private async standardMode(toEdit: string, file: TFile): Promise<void> {
        const autoProp = await this.handleAutoProperties(toEdit);
        let newValue;

        if (autoProp)
            newValue = autoProp;
        else
            newValue = await GenericPrompt.Prompt(this.app, `Enter a new value for ${toEdit}`);

        if (newValue) {
            await this.updatePropertyInFile(toEdit, newValue, file);
        }
    }

    private async multiValueMode(choice: string, meta: SuggestData, file: TFile): Promise<Boolean> {
        const settings: MetaEditSettings = this.plugin.settings;
        const choiceIsYaml: Boolean = !!this.parser.parseFrontmatter(file)[choice];
        let newValue: string;

        if (settings.EditMode.mode == EditMode.SomeMulti && !settings.EditMode.properties.includes(choice)) {
            await this.standardMode(choice, file);
            return false;
        }

        let selectedOption: string, tempValue: string, splitValues: string[];
        let currentPropValue: string = meta[choice];

        if (currentPropValue !== null)
            currentPropValue = currentPropValue.toString();
        else
            currentPropValue = "";

        if (choiceIsYaml) {
            splitValues = currentPropValue.split('').filter(c => !c.includes("[]")).join('').split(",");
        } else {
            splitValues = currentPropValue.split(",").map(prop => prop.trim());
        }

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

        const autoProp = await this.handleAutoProperties(choice);
        if (autoProp) {
            tempValue = autoProp;
        } else if (selectedOption.includes("cmd")) {
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
                if (selectedIndex)
                    splitValues[selectedIndex] = tempValue;
                else
                    splitValues = [tempValue];
                newValue = `${splitValues.join(", ")}`;
                break;
        }

        if (choiceIsYaml)
            newValue = `[${newValue}]`;

        if (newValue) {
            await this.updatePropertyInFile(choice, newValue, file);
            return true;
        }

        return false;
    }

    private async handleAutoProperties(propertyName: string): Promise<string> {
        const autoProp = this.plugin.settings.AutoProperties.properties.find(a => a.name === propertyName);

        if (this.plugin.settings.AutoProperties.enabled && autoProp) {
            const options = autoProp.choices;
            return await GenericSuggester.Suggest(this.app, options, options);
        }

        return null;
    }

    private async updatePropertyInFile(property: string, newValue: string, file: TFile) {
        const choiceIsYaml = !!this.parser.parseFrontmatter(file)[property];
        const fileContent = await this.app.vault.read(file);

        const newFileContent = fileContent.split("\n").map(line => {
            const regexp = new RegExp(`^\s*${property}:`);
            if (line.match(regexp)) {
                if (choiceIsYaml)
                    line = `${property}: ${newValue}`;
                else
                    line = `${property}:: ${newValue}`;
            }

            return line;
        }).join("\n");

        await this.app.vault.modify(file, newFileContent);
    }

    private async updateMultipleInFile(props: {[key: string]: string}, file: TFile) {
        const fileContent = await this.app.vault.read(file);

        const newFileContent = fileContent.split("\n").map(line => {
            Object.keys(props).forEach((prop: string) => {
                const regexp = new RegExp(`^\s*${prop}:`);

                if (line.match(regexp)) {
                    const isYamlProp = !!this.parser.parseFrontmatter(file)[prop];

                    if (isYamlProp)
                        line = `${prop}: ${props[prop]}`;
                    else
                        line = `${prop}:: ${props[prop]}`;
                }
            })

            return line;
        }).join("\n");

        await this.app.vault.modify(file, newFileContent);
    }
}