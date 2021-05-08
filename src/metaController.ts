import MetaEditParser from "./parser";
import type {App, TFile} from "obsidian";

export default class MetaController {
    private parser: MetaEditParser;
    private readonly app: App;

    constructor(app: App) {
        this.app = app;
        this.parser = new MetaEditParser(app);
    }

    public async getForCurrentFile() {
        const currentFile = this.app.workspace.getActiveFile();
        return await this.get(currentFile);
    }

    public async get(file: TFile) {
        const yaml = this.parser.parseFrontmatter(file);
        const inlineFields = await this.parser.parseInlineFields(file);

        return {...yaml, ...inlineFields};
    }
}