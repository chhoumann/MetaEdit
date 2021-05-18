import type {App, TFile} from "obsidian";
import {parseYaml} from "obsidian";

export default class MetaEditParser {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    public async parseFrontmatter(file: TFile): Promise<{ [key: string]: any }> {
        const frontmatter = this.app.metadataCache.getFileCache(file).frontmatter;
        if (!frontmatter) return {};
        const {position: {start, end}} = frontmatter;
        const filecontent = await this.app.vault.read(file);

        return parseYaml(filecontent.split("\n").slice(start.line, end.line).join("\n"));
    }

    public async parseInlineFields(file: TFile): Promise<{ [key: string]: string}> {
        const content = await this.app.vault.read(file);

        return content.split("\n").reduce((obj: {[key: string]: string}, str: string) => {
            let parts = str.split("::");

            if (parts[0] && parts[1]) {
                obj[parts[0]] = parts[1].trim();
            }
            else if (str.includes("::")) {
                obj[str.replace("::",'')] = "";
            }

            return obj;
        },  {});
    }

}
