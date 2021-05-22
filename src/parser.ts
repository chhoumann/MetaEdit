import type {App, TFile} from "obsidian";
import {parseYaml} from "obsidian";
import {MetaType} from "./Types/metaType";

export type Property = {key: string, content: string, type: MetaType};

export default class MetaEditParser {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    public async getTagsForFile(file: TFile): Promise<Property[]> {
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache) return [];
        const tags = cache.tags;
        if (!tags) return [];

        let mTags: Property[] = [];
        tags.forEach(tag => mTags.push({key: tag.tag, content: tag.tag, type: MetaType.Tag}));
        return mTags;
    }

    public async parseFrontmatter(file: TFile): Promise<Property[]> {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!frontmatter) return [];
        const {position: {start, end}} = frontmatter;
        const filecontent = await this.app.vault.read(file);

        const yamlContent: string = filecontent.split("\n").slice(start.line, end.line).join("\n");
        const parsedYaml = parseYaml(yamlContent);

        let metaYaml: Property[] = [];

        for (const key in parsedYaml) {
            metaYaml.push({key, content: parsedYaml[key]?.toString(), type: MetaType.YAML});
        }

        return metaYaml;
    }

    public async parseInlineFields(file: TFile): Promise<Property[]> {
        const content = await this.app.vault.read(file);

        return content.split("\n").reduce((obj: Property[], str: string) => {
            let parts = str.split("::");

            if (parts[0] && parts[1]) {
                obj.push({key: parts[0], content: parts[1].trim(), type: MetaType.Dataview});
            }
            else if (str.includes("::")) {
                const key: string = str.replace("::",'');
                obj.push({key, content: "", type: MetaType.Dataview});
            }

            return obj;
        },  []);
    }

}
