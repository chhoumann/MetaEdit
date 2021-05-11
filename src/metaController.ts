import MetaEditParser from "./parser";
import type {App, TFile} from "obsidian";
import type MetaEdit from "./main";
import GenericPrompt from "./Modals/GenericPrompt/GenericPrompt";
import {EditMode} from "./Types/editMode";

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
        let file = this.app.workspace.getActiveFile();
        let content = await this.app.vault.cachedRead(file);
        let frontmatter = await this.app.metadataCache.getFileCache(file).frontmatter;
        let isYamlEmpty = Object.keys(frontmatter).length === 0 && !content.match(/^-{3}\s*\n*\r*-{3}/);

        let newProp = await this.createNewProperty();
        if (!newProp) return;

        let {propName, propValue} = newProp;

        const settings = this.plugin.settings;
        if (settings.EditMode.mode === EditMode.AllMulti ||
            (settings.EditMode.mode === EditMode.SomeMulti && settings.EditMode.multiProperties.contains(propName))) {
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

    private async createNewProperty() {
        let propName = await GenericPrompt.Prompt(this.app, "Enter a property name", "Property");
        if (!propName) return null;

        let propValue = "ay";
        if (this.plugin.settings.AutoProperties.enabled &&
            this.plugin.settings.AutoProperties.properties.find(a => a.name === propName))
            console.log("Suggest");
        else
            propValue = await GenericPrompt.Prompt(this.app, "Enter a property value", "Value");

        if (!propValue) return null;

        return {propName, propValue};
    }
}