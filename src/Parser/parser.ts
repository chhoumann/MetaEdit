import type {App, FrontMatterCache, TFile} from "obsidian";
import {parseYaml} from "obsidian";
import {MetaType} from "../Types/metaType";
import {MetaDataType} from "../Types/MetaDataType";

export type Property = {key: string, content: (number | string | Property | Property[]), type: MetaType, dataType?: MetaDataType};

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
        const frontMatterCache: FrontMatterCache = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!frontMatterCache) return [];

        const { position: {start, end} } = frontMatterCache;
        const fileContent = await this.app.vault.cachedRead(file);

        const yamlContent: string = fileContent.split("\n").slice(start.line, end.line).join("\n");
        const parsedYaml = parseYaml(yamlContent);

        let metaYaml: Property[] = this.createPropertyArray(parsedYaml);
        console.log(metaYaml);

        return metaYaml;
    }

    private createPropertyArray(properties: any): Property[] {
        const metaProperties: Property[] = [];

        for (const key in properties) {
            const property: Property = this.createProperty(key, properties[key]);
            metaProperties.push(property);
        }

        return metaProperties;
    }

    private createProperty(key: string, content: any): Property {
        const dataType = this.getPropertyType(key, content);

        if (dataType === MetaDataType.Object) {
            for (const key in content) {
                content[key] = this.createProperty(key, content[key]);
            }
        }

        if (dataType === MetaDataType.Array) {
            content = content.map(item => this.createProperty(null, item));
        }

        const property: Property = {
            key,
            dataType,
            content,
            type: MetaType.YAML
        }

        return property;
    }

    private getPropertyType(key: string, property: any): MetaDataType {
        if (Array.isArray(property)) {
            return MetaDataType.Array;
        }

        if (typeof property === "object") {
            return MetaDataType.Object;
        }

        if (key) {
            return MetaDataType.KeyValue;
        }

        return MetaDataType.ArrayItem;
    }

    public async parseInlineFields(file: TFile): Promise<Property[]> {
        const content = await this.app.vault.cachedRead(file);

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
