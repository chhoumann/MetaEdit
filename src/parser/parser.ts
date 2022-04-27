import type { TFile } from 'obsidian';
import { parseYaml } from 'obsidian';
import type { Property } from '../types/Property';
import { MetaType } from '../types/metaType';
import {extractFrontmatterString} from "./extractFrontmatterString";

export default class MetaEditParser {
    public async getFileMetadata(file: TFile): Promise<Property[]> {
        const fileContent = await app.vault.cachedRead(file);

        const frontmatter = await this.parseFrontmatter(fileContent);
        const inlineFields = await this.parseInlineFields(fileContent);
        const tags = await this.getTagsInFile(file);

        return [...frontmatter, ...inlineFields, ...tags];
    }

    public async getTagsInFile(file: TFile): Promise<Property[]> {
        const cachedTags = app.metadataCache.getFileCache(file)?.tags;
        if (!cachedTags) return [];

        const mTags: Property[] = [];
        cachedTags.forEach((tag) =>
            mTags.push({ key: tag.tag, content: tag.tag, type: MetaType.Tag }),
        );

        return mTags;
    }

    public async parseFrontmatter(fileContent: string): Promise<Property[]> {
        const yamlContent = extractFrontmatterString(fileContent);

        // This is done to avoid the accidentally removing the property 'position' from the frontmatter, as
        // it gets overwritten had we just used the frontmatter object.
        const parsedYaml = parseYaml(yamlContent);

        const metaYaml: Property[] = [];
        Object.entries(parsedYaml).forEach(([key, value]) => {
            metaYaml.push({ key, content: value, type: MetaType.YAML });
        });

        return metaYaml;
    }

    public async parseInlineFields(fileContent: string): Promise<Property[]> {
        //                          @ts-ignore
        const userHasDataview = !!app.plugins.plugins.dataview;
        if (!userHasDataview) return [];

        return fileContent.split('\n').reduce((obj: Property[], str: string) => {
            const parts = str.split('::');

            if (parts[0] && parts[1]) {
                obj.push({
                    key: parts[0],
                    content: parts[1].trim(),
                    type: MetaType.Dataview,
                });
            } else if (str.includes('::')) {
                const key: string = str.replace('::', '');
                obj.push({ key, content: '', type: MetaType.Dataview });
            }

            return obj;
        }, []);
    }
}
