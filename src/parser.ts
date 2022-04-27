import type { TFile } from 'obsidian';
import { parseYaml } from 'obsidian';
import type { Property } from './types/Property';
import { MetaType } from './types/metaType';

export default class MetaEditParser {
    public async getFileMetadata(file: TFile): Promise<Property[]> {
        const frontmatter = await this.parseFrontmatter(file);
        const inlineFields = await this.parseInlineFields(file);
        const tags = await this.getTagsInFile(file);

        return [...frontmatter, ...inlineFields, ...tags];
    }

    public async getTagsInFile(file: TFile): Promise<Property[]> {
        const cache = app.metadataCache.getFileCache(file);
        if (!cache) return [];
        const tags = cache.tags;
        if (!tags) return [];

        const mTags: Property[] = [];
        tags.forEach((tag) =>
            mTags.push({ key: tag.tag, content: tag.tag, type: MetaType.Tag }),
        );

        return mTags;
    }

    public async parseFrontmatter(file: TFile): Promise<Property[]> {
        const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
        if (!frontmatter) return [];
        const {
            position: { start, end },
        } = frontmatter;
        const fileContent = await app.vault.cachedRead(file);

        const yamlContent: string = fileContent
            .split('\n')
            .slice(start.line, end.line)
            .join('\n');
        // This is done to avoid the accidentally removing the property 'position' from the frontmatter, as
        // it gets overwritten had we just used the frontmatter object.
        const parsedYaml = parseYaml(yamlContent);

        const metaYaml: Property[] = [];

        for (const key in parsedYaml) {
            metaYaml.push({
                key,
                content: parsedYaml[key],
                type: MetaType.YAML,
            });
        }

        return metaYaml;
    }

    public async parseInlineFields(file: TFile): Promise<Property[]> {
        const content = await app.vault.cachedRead(file);

        return content.split('\n').reduce((obj: Property[], str: string) => {
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
