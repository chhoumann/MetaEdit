import MetaEditParser from "./parser";
import type {App, FrontMatterCache, TFile} from "obsidian";
import type MetaEdit from "./main";
import GenericPrompt from "./Modals/GenericPrompt/GenericPrompt";
import {EditMode} from "./Types/editMode";
import GenericSuggester from "./Modals/GenericSuggester/GenericSuggester";

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
        const autoProp = this.plugin.settings.AutoProperties.properties.find(a => a.name === propName);
        if (this.plugin.settings.AutoProperties.enabled && autoProp) {
            const options = autoProp.choices;
            propValue = await GenericSuggester.Suggest(this.app, options, options);
        }
        else {
            propValue = await GenericPrompt.Prompt(this.app, "Enter a property value", "Value");
            propValue = propValue.trim()
        }

        if (!propValue) return null;

        return {propName, propValue};
    }

    async editMetaElement(toEdit: string) {
        const mode: EditMode = this.plugin.settings.EditMode.mode;

        if (mode === EditMode.AllMulti || mode === EditMode.SomeMulti)
            await multiValueMode(toEdit);
        else
            await standardMode(toEdit);
    }

    async standardMode(toEdit: string) {
        const autoProp = this.plugin.settings.AutoProperties.properties.find(a => a.name === toEdit);
        let newValue;

        if (autoProp) {
            const options = autoProp.choices;
            newValue = await GenericSuggester.Suggest(this.app, options, options);
        }
        else
            newValue = await GenericPrompt.Prompt(this.app, `Enter a new value for ${toEdit}`);

        if (newValue) {
            await updateFile(choice, newValue);
        }
    }
}