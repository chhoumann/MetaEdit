import type {App, TFile} from "obsidian";
import {parseYaml} from "obsidian";
import {MetaType} from "./Types/metaType";

export type Property = {key: string, content: any, type: MetaType};

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
        const fileCache = this.app.metadataCache.getFileCache(file);
        const frontmatter = fileCache?.frontmatter;
        if (!frontmatter) return [];

        //@ts-ignore - this is part of the new Obsidian API as of v1.4.1
        const {start, end} = fileCache?.frontmatterPosition ?? fileCache?.frontmatter?.position;
        const filecontent = await this.app.vault.cachedRead(file);

        const yamlContent: string = filecontent.split("\n").slice(start.line, end.line).join("\n");
        const parsedYaml = parseYaml(yamlContent);

        let metaYaml: Property[] = [];

        for (const key in parsedYaml) {
            metaYaml.push({key, content: parsedYaml[key], type: MetaType.YAML});
        }

        return metaYaml;
    }

    public async parseInlineFields(file: TFile): Promise<Property[]> {
        const content = await this.app.vault.cachedRead(file);
        const regex = /[\[\(]?([^\n\r\(\[]*)::[ ]*([^\)\]\n\r]*)[\]\)]?/g;
        const properties: Property[] = [];

        let match;
        while ((match = regex.exec(content)) !== null) {
            const key: string = match[1].trim();
            const value: string = match[2].trim();
    
            properties.push({key, content: value, type: MetaType.Dataview});
        }
    
        return properties;
    }

}
