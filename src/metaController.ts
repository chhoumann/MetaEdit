import MetaEditParser from "./parser";
import type {App, TFile} from "obsidian";
import type MetaEdit from "./main";

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
}