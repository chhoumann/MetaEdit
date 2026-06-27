import type {App, CachedMetadata, Loc, TFile} from "obsidian";
import {parseYaml} from "obsidian";
import {MetaType} from "./Types/metaType";

export type Property = {key: string, content: any, type: MetaType};
type FrontmatterPosition = {start: Loc, end: Loc};

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

        const mTags: Property[] = [];
        tags.forEach(tag => mTags.push({key: tag.tag, content: tag.tag, type: MetaType.Tag}));
        return mTags;
    }

    public async parseFrontmatter(file: TFile): Promise<Property[]> {
        const fileCache = this.app.metadataCache.getFileCache(file);
        const frontmatter = fileCache?.frontmatter;
        if (!frontmatter) return [];

        const frontmatterPosition = this.getFrontmatterPosition(fileCache);
        if (!frontmatterPosition) {
            return this.objectToYamlProperties(frontmatter, true);
        }

        const {start, end} = frontmatterPosition;
        const filecontent = await this.app.vault.cachedRead(file);
        const yamlContent: string = filecontent.split("\n").slice(start.line, end.line).join("\n");
        const parsedYaml = parseYaml(yamlContent);

        return this.objectToYamlProperties(parsedYaml);
    }

    private getFrontmatterPosition(fileCache: CachedMetadata): FrontmatterPosition | null {
        const frontmatterPosition = fileCache.frontmatterPosition;
        if (this.isFrontmatterPosition(frontmatterPosition)) return frontmatterPosition;

        const legacyPosition = fileCache.frontmatter?.position;
        if (this.isFrontmatterPosition(legacyPosition)) return legacyPosition;

        return null;
    }

    private isFrontmatterPosition(position: unknown): position is FrontmatterPosition {
        if (!position || typeof position !== "object") return false;

        const candidate = position as Partial<FrontmatterPosition>;
        return this.isPosition(candidate.start) && this.isPosition(candidate.end);
    }

    private isPosition(position: unknown): position is Loc {
        if (!position || typeof position !== "object") return false;

        const candidate = position as Partial<Loc>;
        return typeof candidate.line === "number" &&
            typeof candidate.col === "number" &&
            typeof candidate.offset === "number";
    }

    private objectToYamlProperties(parsedYaml: Record<string, unknown>, omitInternalPosition: boolean = false): Property[] {
        if (!parsedYaml) return [];

        const metaYaml: Property[] = [];

        for (const key in parsedYaml) {
            if (omitInternalPosition && key === "position" && this.isFrontmatterPosition(parsedYaml[key])) continue;

            metaYaml.push({key, content: parsedYaml[key], type: MetaType.YAML});
        }

        return metaYaml;
    }

    public async parseInlineFields(file: TFile): Promise<Property[]> {
        const content = await this.app.vault.cachedRead(file);
        const regex = /(?:\[\[|[\[\(]|^)([^\n\r\[\]]*?)::[ ]*([^\)\]\n\r]*)(?:\]\]|[\]\)])?/gm;
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
