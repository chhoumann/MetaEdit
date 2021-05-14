import MetaEditParser from "./parser";
import type {App, FrontMatterCache, TFile} from "obsidian";
import type MetaEdit from "./main";
import GenericPrompt from "./Modals/GenericPrompt/GenericPrompt";
import {EditMode} from "./Types/editMode";
import GenericSuggester from "./Modals/GenericSuggester/GenericSuggester";
import type {SuggestData} from "./Modals/metaEditSuggester";
import type {MetaEditSettings} from "./Settings/metaEditSettings";
import {ADD_FIRST_ELEMENT, ADD_TO_BEGINNING, ADD_TO_END} from "./constants";
import type {ProgressProperty} from "./Types/progressProperty";
import {ProgressPropertyOptions} from "./Types/progressPropertyOptions";

export default class MetaController {
    private parser: MetaEditParser;
    private readonly app: App;
    private plugin: MetaEdit;

    constructor(app: App, plugin: MetaEdit) {
        this.app = app;
        this.parser = new MetaEditParser(app);
        this.plugin = plugin;
    }

    public async getForCurrentFile() {
        try {
            const currentFile = this.app.workspace.getActiveFile();
            return await this.get(currentFile);
        }
        catch {
            this.plugin.logError("could not get current file content.");
            return null;
        }
    }

    public async get(file: TFile) {
        const yaml = this.parser.parseFrontmatter(file);
        const inlineFields = await this.parser.parseInlineFields(file);

        return {...yaml, ...inlineFields};
    }

    public async addYamlProp() {
        let file: TFile = this.app.workspace.getActiveFile();
        let content: string = await this.app.vault.read(file);
        let frontmatter: FrontMatterCache = this.app.metadataCache.getFileCache(file).frontmatter;
        let isYamlEmpty: boolean = (frontmatter === undefined && !content.match(/^-{3}\s*\n*\r*-{3}/));

        let newProp = await this.createNewProperty();
        if (!newProp) return;

        let {propName, propValue} = newProp;

        const settings = this.plugin.settings;
        if (settings.EditMode.mode === EditMode.AllMulti ||
            (settings.EditMode.mode === EditMode.SomeMulti && settings.EditMode.properties.contains(propName))) {
            propValue = `[${propValue}]`;
        }

        let splitContent = content.split("\n");
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

    public async addDataviewField() {
        let newProp = await this.createNewProperty();
        if (!newProp) return;

        const {propName, propValue} = newProp;

        const file:TFile = this.app.workspace.getActiveFile();

        let content: string = await this.app.vault.read(file);
        let lines = content.split("\n").reduce((obj: {[key: string]: string}, line: string, idx: number) => {
            obj[idx] = !!line ? line : "";
            return obj;
        }, {});

        let appendAfter: string = await GenericSuggester.Suggest(this.app, Object.values(lines), Object.keys(lines));
        if (!appendAfter) return;

        let splitContent: string[] = content.split("\n");
        if (typeof appendAfter === "number" || parseInt(appendAfter)) {
            splitContent.splice(parseInt(appendAfter), 0, `${propName}:: ${propValue}`);
        }
        const newFileContent = splitContent.join("\n");

        await this.app.vault.modify(file, newFileContent);
    }

    public async editMetaElement(toEdit: string, meta: SuggestData) {
        const mode: EditMode = this.plugin.settings.EditMode.mode;

        if (mode === EditMode.AllMulti || mode === EditMode.SomeMulti)
            await this.multiValueMode(toEdit, meta);
        else
            await this.standardMode(toEdit);
    }

    public async handleProgressProps(meta: SuggestData) {
        const progressProps = this.plugin.settings.ProgressProperties;
        if (!progressProps.enabled) return;

        const file = this.app.workspace.getActiveFile();
        const listItems = this.app.metadataCache.getFileCache(file).listItems;

        if (!listItems || listItems.length == 0) return;
        const tasks = listItems.filter(i => i.task);

        const totalTaskCount = tasks.length;
        if (!totalTaskCount) return;

        const completedTaskCount = tasks.filter(i => i.task != " ").length;
        const incompleteTaskCount = totalTaskCount - completedTaskCount;

        const total = progressProps.properties.filter(p => p.type === ProgressPropertyOptions.TaskTotal);
        const complete = progressProps.properties.filter(p => p.type === ProgressPropertyOptions.TaskComplete);
        const incomplete = progressProps.properties.filter(p => p.type === ProgressPropertyOptions.TaskIncomplete);

        const props = {
            ...await this.progressPropHelper(total, meta, totalTaskCount),
            ...await this.progressPropHelper(complete, meta, completedTaskCount),
            ...await this.progressPropHelper(incomplete, meta, incompleteTaskCount)
        }

        await this.updateMultipleInFile(props);
    }

    private async progressPropHelper(progressProps: ProgressProperty[], meta: SuggestData, count: number) {
        try {
            if (this.validateStringArray(progressProps.map(prop => prop.name))) {
                return progressProps.reduce((obj: {[name: string]: string}, el) => {
                    if (meta[el.name] != null)
                        obj[el.name] = `${count}`;
                    return obj;
                }, {})
            }
        }
        catch(e) {
            console.log(e)
        }
    }

    private async standardMode(toEdit: string): Promise<void> {
        const autoProp = await this.handleAutoProperties(toEdit);
        let newValue;

        if (autoProp)
            newValue = autoProp;
        else
            newValue = await GenericPrompt.Prompt(this.app, `Enter a new value for ${toEdit}`);

        if (newValue) {
            await this.updateFile(toEdit, newValue);
        }
    }

    private async multiValueMode(choice: string, meta: SuggestData): Promise<Boolean> {
        const settings: MetaEditSettings = this.plugin.settings;
        const file: TFile = this.app.workspace.getActiveFile();
        const choiceIsYaml: Boolean = !!this.parser.parseFrontmatter(file)[choice];
        let newValue: string;

        if (settings.EditMode.mode == EditMode.SomeMulti && !settings.EditMode.properties.includes(choice)) {
            await this.standardMode(choice);
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
            await this.updateFile(choice, newValue);
            return true;
        }

        return false;
    }

    private async createNewProperty() {
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

    private async handleAutoProperties(propertyName: string): Promise<string> {
        const autoProp = this.plugin.settings.AutoProperties.properties.find(a => a.name === propertyName);

        if (this.plugin.settings.AutoProperties.enabled && autoProp) {
            const options = autoProp.choices;
            return await GenericSuggester.Suggest(this.app, options, options);
        }

        return null;
    }

    private validateStringArray = (array: string[]) => array && (array.length >= 1 && array[0] != "");

    private async updateFile(choice: string, newValue: string) {
        const file = this.app.workspace.getActiveFile();
        const choiceIsYaml = !!this.parser.parseFrontmatter(file)[choice];
        let content = await this.app.vault.read(file);

        let newFileContent = content.split("\n").map(line => {
            const regexp = new RegExp(`^\s*${choice}:`);
            if (line.match(regexp)) {
                if (choiceIsYaml)
                    line = `${choice}: ${newValue}`;
                else
                    line = `${choice}:: ${newValue}`;
            }

            return line;
        }).join("\n");

        await this.app.vault.modify(file, newFileContent);
    }

    private async updateMultipleInFile(props: {[key: string]: string}) {
        const file = this.app.workspace.getActiveFile();
        let content = await this.app.vault.cachedRead(file);

        let newFileContent = content.split("\n").map(line => {
            Object.keys(props).forEach((prop: string) => {
                const regexp = new RegExp(`^\s*${prop}:`);
                if (line.match(regexp)) {
                    if (!!this.parser.parseFrontmatter(file)[prop])
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