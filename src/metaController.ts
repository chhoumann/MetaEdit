import MetaEditParser from "./parser";
import {App} from "obsidian";

export default class MetaController {
    private parser: MetaEditParser;
    private readonly app: App;

    constructor(app: App) {
        this.app = app;
        this.parser = new MetaEditParser(app);
    }

    public async GetForCurrentFile() {
        const currentFile = this.app.workspace.getActiveFile();
        const yaml = this.parser.parseFrontmatter(currentFile);
        const inlineFields = await this.parser.parseInlineFields(currentFile);

        return {...yaml, ...inlineFields};
    }
}