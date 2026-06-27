import type {App, CachedMetadata, Loc, TFile} from "obsidian";
import {parseYaml} from "obsidian";
import {MetaType} from "./Types/metaType";

export type Property = {key: string, content: any, type: MetaType};
type FrontmatterPosition = {start: Loc, end: Loc};
type InlineField = {key: string, value: string, start: number, end: number};

// Dataview wraps inline fields in either square brackets or parentheses.
const INLINE_FIELD_WRAPPERS: Readonly<Record<string, string>> = Object.freeze({"[": "]", "(": ")"});

// Leading whitespace, blockquote/callout markers (`>`), and at most one list
// marker (`-`, `*`, `+`, `1.`/`1)`) precede the key of a "full-line" inline
// field. Stripping them lets `> - key:: value` resolve to the key `key`.
const FULL_LINE_PREFIX = /^(?:\s*(?:>\s*)*)(?:[-*+]\s+|\d+[.)]\s+)?/;

// Opening fences for code blocks (``` or ~~~), optionally indented up to three
// spaces. Inline fields inside code blocks are examples, not metadata.
const CODE_FENCE = /^\s{0,3}(`{3,}|~{3,})/;

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

    private objectToYamlProperties(parsedYaml: unknown, omitInternalPosition: boolean = false): Property[] {
        // Frontmatter is only meaningful as a mapping. Malformed YAML (a bare
        // scalar, a top-level sequence, null) must not be walked with `for..in`,
        // which would surface array/string indices like `0:value` (#85).
        if (!parsedYaml || typeof parsedYaml !== "object" || Array.isArray(parsedYaml)) return [];

        const metaYaml: Property[] = [];

        for (const key in parsedYaml as Record<string, unknown>) {
            const value = (parsedYaml as Record<string, unknown>)[key];
            if (omitInternalPosition && key === "position" && this.isFrontmatterPosition(value)) continue;

            metaYaml.push({key, content: value, type: MetaType.YAML});
        }

        return metaYaml;
    }

    public async parseInlineFields(file: TFile): Promise<Property[]> {
        const content = await this.app.vault.cachedRead(file);
        return this.parseInlineContent(content);
    }

    /**
     * Extract inline `key:: value` fields from raw note content.
     *
     * Mirrors Dataview's two-mode model: bracketed fields (`[k:: v]` / `(k:: v)`)
     * take precedence over a single "full-line" field, and a line yields one or
     * the other - never both. Keys are returned clean (without leading list or
     * blockquote markers) so callers can match and round-trip them; the
     * full-line key is otherwise kept verbatim so odd-but-real keys like
     * `progress (%)` survive a read/write cycle.
     */
    public parseInlineContent(content: string): Property[] {
        const properties: Property[] = [];
        const lines = content.split(/\r?\n/);
        let inFrontmatter = false;
        let openFence: string | null = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Skip a leading YAML frontmatter block - it is handled by parseFrontmatter.
            if (i === 0 && /^---\s*$/.test(line)) {
                inFrontmatter = true;
                continue;
            }
            if (inFrontmatter) {
                if (/^(?:---|\.\.\.)\s*$/.test(line)) inFrontmatter = false;
                continue;
            }

            // Skip fenced code blocks so example fields are not treated as metadata.
            const fence = line.match(CODE_FENCE);
            if (fence) {
                const marker = fence[1][0];
                if (openFence === null) {
                    openFence = marker;
                    continue;
                }
                if (openFence === marker) {
                    openFence = null;
                    continue;
                }
            }
            if (openFence !== null) continue;

            if (!line.includes("::")) continue;

            for (const field of this.parseLineFields(line)) {
                properties.push({key: field.key, content: field.value, type: MetaType.Dataview});
            }
        }

        return properties;
    }

    private parseLineFields(line: string): InlineField[] {
        const bracketed = this.extractBracketedFields(line);
        if (bracketed.length > 0) return bracketed;

        const fullLine = this.extractFullLineField(line);
        return fullLine ? [fullLine] : [];
    }

    private extractBracketedFields(line: string): InlineField[] {
        const fields: InlineField[] = [];

        for (const open of Object.keys(INLINE_FIELD_WRAPPERS)) {
            let idx = line.indexOf(open);
            while (idx >= 0) {
                const field = this.findBracketedField(line, idx);
                if (!field) {
                    idx = line.indexOf(open, idx + 1);
                    continue;
                }
                fields.push(field);
                idx = line.indexOf(open, field.end);
            }
        }

        fields.sort((a, b) => a.start - b.start);

        // Drop fields that overlap an already-kept one (e.g. a `(` field nested
        // inside a `[` field), keeping the earliest.
        const kept: InlineField[] = [];
        for (const field of fields) {
            if (kept.length === 0 || kept[kept.length - 1].end <= field.start) {
                kept.push(field);
            }
        }
        return kept;
    }

    private findBracketedField(line: string, start: number): InlineField | null {
        const open = line[start];
        const close = INLINE_FIELD_WRAPPERS[open];

        const sep = line.indexOf("::", start + 1);
        if (sep < 0) return null;

        const key = line.substring(start + 1, sep).trim();
        // A wrapper character inside the key means this open bracket is not the
        // real start of the field (e.g. the outer `[` of `[[my-key:: value]]`).
        if (!key || /[[\]()]/.test(key)) return null;

        const closing = this.findClosingBracket(line, sep + 2, open, close);
        if (!closing) return null;

        return {key, value: closing.value, start, end: closing.end};
    }

    private findClosingBracket(line: string, start: number, open: string, close: string): {value: string, end: number} | null {
        let nesting = 0;
        let escaped = false;

        for (let i = start; i < line.length; i++) {
            const char = line[i];

            if (char === "\\") {
                escaped = !escaped;
                continue;
            }
            if (escaped) {
                escaped = false;
                continue;
            }

            if (char === open) {
                nesting++;
            } else if (char === close) {
                if (nesting === 0) {
                    return {value: line.substring(start, i).trim(), end: i + 1};
                }
                nesting--;
            }
        }

        return null;
    }

    private extractFullLineField(line: string): InlineField | null {
        const prefix = line.match(FULL_LINE_PREFIX)?.[0] ?? "";
        const body = line.slice(prefix.length);

        const sep = body.indexOf("::");
        if (sep < 0) return null;

        const key = body.substring(0, sep).trim();
        if (!key) return null;

        const value = body.substring(sep + 2).trim();
        return {key, value, start: prefix.length, end: line.length};
    }

}
