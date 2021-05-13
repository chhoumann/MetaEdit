import MetaEditParser from "./parser";
import type {App, FrontMatterCache, TFile} from "obsidian";
import type MetaEdit from "./main";
import GenericPrompt from "./Modals/GenericPrompt/GenericPrompt";
import {EditMode} from "./Types/editMode";
import GenericSuggester from "./Modals/GenericSuggester/GenericSuggester";
import type {SuggestData} from "./Modals/metaEditSuggester";

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

    private async createNewProperty() {
        let propName = await GenericPrompt.Prompt(this.app, "Enter a property name", "Property");
        if (!propName) return null;

        let propValue: string;
        const autoProp = await this.HandleAutoProperties(propName);

        if (autoProp) {
            propValue = autoProp;
        } else {
            propValue = await GenericPrompt.Prompt(this.app, "Enter a property value", "Value");
            propValue = propValue.trim()
        }

        if (!propValue) return null;

        return {propName, propValue};
    }

    private async HandleAutoProperties(propertyName: string): Promise<string> {
        const autoProp = this.plugin.settings.AutoProperties.properties.find(a => a.name === propertyName);

        if (this.plugin.settings.AutoProperties.enabled && autoProp) {
            const options = autoProp.choices;
            return await GenericSuggester.Suggest(this.app, options, options);
        }

        return null;
    }

    async editMetaElement(toEdit: string, meta: SuggestData) {
        const mode: EditMode = this.plugin.settings.EditMode.mode;

        if (mode === EditMode.AllMulti || mode === EditMode.SomeMulti)
            await this.multiValueMode(toEdit, meta);
        else
            await this.standardMode(toEdit);
    }

    async standardMode(toEdit: string) {
        const autoProp = await this.HandleAutoProperties(toEdit);
        let newValue;

        if (autoProp)
            newValue = autoProp;
        else
            newValue = await GenericPrompt.Prompt(this.app, `Enter a new value for ${toEdit}`);

        if (newValue) {
            await this.updateFile(toEdit, newValue);
        }
    }

    async multiValueMode(choice: string, meta: SuggestData) {
        const settings = this.plugin.settings;
        const file = this.app.workspace.getActiveFile();
        const choiceIsYaml = !!this.parser.parseFrontmatter(file)[choice];
        let newValue;

        try {
            if (settings.EditMode.mode == EditMode.SomeMulti && !settings.EditMode.properties.includes(choice)) {
                await this.standardMode(choice);
                return false;
            }

            let selected: string, tempValue: string, splitValues: string[];
            let metaString: string = meta[choice];

            if (metaString !== null)
                metaString = metaString.toString();
            else
                metaString = "";

            if (choiceIsYaml) {
                splitValues = metaString.split('').filter(c => !c.includes("[]")).join().split(",");
            } else {
                splitValues = metaString.split(",").map(prop => prop.trim());
            }

            if (splitValues.length == 0 || (splitValues.length == 1 && splitValues[0] == "")) {
                const options = ["Add new value"];
                selected = await GenericSuggester.Suggest(this.app, options, ["cmd:addfirst"]);
            }
            else if (splitValues.length == 1) {
                const options = [splitValues[0], "Add to end", "Add to beginning"];
                selected = await GenericSuggester.Suggest(this.app, options, [splitValues[0], "cmd:end", "cmd:beg"]);
            } else {
                const options = ["Add to end", ...splitValues, "Add to beginning"];
                selected = await GenericSuggester.Suggest(this.app, options, ["cmd:end", ...splitValues, "cmd:beg"]);
            }

            if (!selected) return;
            let selectedIndex;

            const autoProp = await this.HandleAutoProperties(choice);
            if (autoProp) {
                tempValue = autoProp;
            } else if (selected.includes("cmd")) {
                tempValue = await GenericPrompt.Prompt(this.app, "Enter a new value");
            } else {
                selectedIndex = splitValues.findIndex(el => el == selected);
                tempValue = await GenericPrompt.Prompt(this.app, `Change ${selected} to`, selected);
            }

            if (!tempValue) return;
            switch(selected) {
                case "cmd:addfirst":
                    newValue = `${tempValue}`;
                    break;
                case "cmd:beg":
                    newValue = `${[tempValue, ...splitValues].join(", ")}`;
                    break;
                case "cmd:end":
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
        }
        catch(e) {
            console.log("MetaEdit: Error with Multi-Value Mode. Check settings.", e);
            return false;
        }

        if (!!newValue) {
            await this.updateFile(choice, newValue);
            return true;
        }

        return false;
    }

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