import type {App, CachedMetadata, FrontMatterInfo, TFile} from "obsidian";
import {getFrontMatterInfo, parseYaml} from "obsidian";
import {MetaType} from "./Types/metaType";
import {formatYamlPath, isPlainYamlObject, isYamlScalarLeaf, type YamlPath} from "./yamlPath";

export type Property = {
	key: string,
	content: any,
	type: MetaType,
	path?: YamlPath,
	rootKey?: string,
	isNested?: boolean,
	isVirtual?: boolean,
};
// `start`/`end` are the field's span in the line; `sepEnd` is the offset just
// after `::`; `valueEnd` is where the value content ends (the closing bracket
// for a bracketed field, or end-of-line for a full-line field). The latter two
// let the value be rewritten in place without disturbing the key or wrapper.
type InlineField = {key: string, value: string, start: number, end: number, sepEnd: number, valueEnd: number};
type ContentLine = {text: string, start: number, end: number, nextStart: number};
type LegacyFrontmatterPosition = {
    start: {line: number, col: number, offset: number},
    end: {line: number, col: number, offset: number},
};

// Dataview wraps inline fields in either square brackets or parentheses.
const INLINE_FIELD_WRAPPERS: Readonly<Record<string, string>> = Object.freeze({"[": "]", "(": ")"});

// Leading whitespace, blockquote/callout markers (`>`), and at most one list
// marker (`-`, `*`, `+`, `1.`/`1)`) precede the key of a "full-line" inline
// field. Stripping them lets `> - key:: value` resolve to the key `key`.
// A marker is only stripped when it is followed by whitespace, so the key it
// guards stays preceded by whitespace in the source - which is what the write
// path needs to re-locate it. `>foo::` therefore keeps its `>` rather than
// becoming an un-writable `foo`.
const FULL_LINE_PREFIX = /^\s*(?:>\s+)*(?:[-*+]\s+|\d+[.)]\s+)?/;

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
        const frontmatter = await this.parseFrontmatterObject(file);
        if (!frontmatter) return [];

        return this.objectToYamlProperties(frontmatter);
    }

    public parseFrontmatterCache(fileCache: CachedMetadata | null | undefined): Property[] {
        const frontmatter = fileCache?.frontmatter;
        if (!frontmatter) return [];

        return this.objectToYamlProperties(frontmatter, true);
    }

    public async parseFrontmatterObject(file: TFile): Promise<Record<string, unknown> | null> {
        const fileCache = this.app.metadataCache.getFileCache(file);
        const filecontent = await this.app.vault.cachedRead(file);
        const parsedYaml = this.parseFrontmatterContent(filecontent);
        if (this.isFrontmatterObject(parsedYaml)) return parsedYaml;

        const frontmatter = fileCache?.frontmatter;
        if (this.isFrontmatterObject(frontmatter)) return this.omitInternalFrontmatterPosition(frontmatter);

        return null;
    }

    private isFrontmatterObject(value: unknown): value is Record<string, unknown> {
        return isPlainYamlObject(value);
    }

    private omitInternalFrontmatterPosition(frontmatter: Record<string, unknown>): Record<string, unknown> {
        if (!this.isFrontmatterPosition(frontmatter.position)) return frontmatter;

        const cleaned = {...frontmatter};
        delete cleaned.position;
        return cleaned;
    }

    private isFrontmatterPosition(position: unknown): position is LegacyFrontmatterPosition {
        if (!position || typeof position !== "object") return false;

        const candidate = position as Partial<LegacyFrontmatterPosition>;
        return this.isPosition(candidate.start) && this.isPosition(candidate.end);
    }

    private isPosition(position: unknown): position is LegacyFrontmatterPosition["start"] {
        if (!position || typeof position !== "object") return false;

        const candidate = position as Partial<LegacyFrontmatterPosition["start"]>;
        return typeof candidate.line === "number" &&
            typeof candidate.col === "number" &&
            typeof candidate.offset === "number";
    }

    private objectToYamlProperties(parsedYaml: unknown, omitInternalPosition: boolean = false): Property[] {
        // Frontmatter is only meaningful as a mapping. Malformed YAML (a bare
        // scalar, a top-level sequence, null) must not be walked with `for..in`,
        // which would surface array/string indices like `0:value` (#85).
        if (!this.isFrontmatterObject(parsedYaml)) return [];

        const rootProperties: Property[] = [];
        const nestedProperties: Property[] = [];

        for (const key in parsedYaml as Record<string, unknown>) {
            const value = (parsedYaml as Record<string, unknown>)[key];
            if (omitInternalPosition && key === "position" && this.isFrontmatterPosition(value)) continue;

            rootProperties.push({key, content: value, type: MetaType.YAML});
            this.collectNestedYamlProperties(value, [key], nestedProperties);
        }

        return [...rootProperties, ...nestedProperties];
    }

    private collectNestedYamlProperties(value: unknown, path: YamlPath, properties: Property[]): void {
        if (isYamlScalarLeaf(value)) {
            if (path.length > 1 && typeof path[path.length - 1] !== "number") {
                const rootKey = String(path[0]);
                properties.push({
                    key: formatYamlPath(path),
                    content: value,
                    type: MetaType.YAML,
                    path: [...path],
                    rootKey,
                    isNested: true,
                    isVirtual: true,
                });
            }
            return;
        }

        if (Array.isArray(value)) {
            value.forEach((item, idx) => this.collectNestedYamlProperties(item, [...path, idx], properties));
            return;
        }

        if (isPlainYamlObject(value)) {
            for (const key in value) {
                this.collectNestedYamlProperties(value[key], [...path, key], properties);
            }
        }
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
        const lines = this.splitContentLines(content);
        const frontmatterInfo = this.getFrontmatterInfo(content);
        let openFence: string | null = null;

        for (const {text: line, start} of lines) {

            // Skip a leading YAML frontmatter block - it is handled by parseFrontmatter.
            if (frontmatterInfo?.exists && start < frontmatterInfo.contentStart) {
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

    private parseFrontmatterContent(content: string): unknown | null {
        const frontmatterInfo = this.getFrontmatterInfo(content);
        if (!frontmatterInfo?.exists) return null;

        // Malformed YAML must not abort the whole note's metadata parse: treat it
        // as non-parseable so parseFrontmatter falls back (to the cache, then to
        // an empty result) and inline/tag parsing still runs. Mirrors the bulk
        // preflight's BulkMetadataEditor.readLiveFrontmatter.
        try {
            return parseYaml(frontmatterInfo.frontmatter);
        } catch {
            return null;
        }
    }

    private getFrontmatterInfo(content: string): FrontMatterInfo | null {
        const info = getFrontMatterInfo(content);
        if (info.exists) return info;

        return this.getLegacyDotCloseFrontmatterInfo(content);
    }

    private getLegacyDotCloseFrontmatterInfo(content: string): FrontMatterInfo | null {
        const lines = this.splitContentLines(content);
        if (!/^---\s*$/.test(lines[0]?.text ?? "")) return null;

        for (let i = 1; i < lines.length; i++) {
            if (!/^\.\.\.\s*$/.test(lines[i].text)) continue;

            const from = lines[0].nextStart;
            const to = lines[i].start;
            return {
                exists: true,
                frontmatter: content.slice(from, to),
                from,
                to,
                contentStart: lines[i].nextStart,
            };
        }

        return null;
    }

    private splitContentLines(content: string): ContentLine[] {
        const textLines = content.split(/\r?\n/);
        const lines: ContentLine[] = [];
        let offset = 0;

        for (let i = 0; i < textLines.length; i++) {
            const text = textLines[i];
            const start = offset;
            const end = start + text.length;
            let nextStart = end;

            if (i < textLines.length - 1) {
                nextStart += content.startsWith("\r\n", end) ? 2 : 1;
            }

            lines.push({text, start, end, nextStart});
            offset = nextStart;
        }

        return lines;
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

        // closing.end points just past the close bracket, so the value content
        // ends one character earlier (at the close bracket itself).
        return {key, value: closing.value, start, end: closing.end, sepEnd: sep + 2, valueEnd: closing.end - 1};
    }

    private findClosingBracket(line: string, start: number, open: string, close: string): {value: string, end: number} | null {
        // Only bracket nesting matters; `\` is treated as an ordinary character.
        // Honouring it as an escape would let a value ending in a backslash
        // (e.g. a Windows path `C:\`) swallow its own closing bracket and drop
        // the whole field.
        let nesting = 0;

        for (let i = start; i < line.length; i++) {
            const char = line[i];

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
        const lineEnd = line.endsWith("\r") ? line.length - 1 : line.length;
        const prefix = line.match(FULL_LINE_PREFIX)?.[0] ?? "";
        const body = line.slice(prefix.length, lineEnd);

        const sep = body.indexOf("::");
        if (sep < 0) return null;

        const key = body.substring(0, sep).trim();
        if (!key) return null;

        const value = body.substring(sep + 2).trim();
        // A full-line field has no wrapper: its value runs to end of line.
        const sepEnd = prefix.length + sep + 2;
        return {key, value, start: prefix.length, end: lineEnd, sepEnd, valueEnd: lineEnd};
    }

    /**
     * Rewrite the value of every inline field named `key` on a single line,
     * leaving the key, surrounding text, and any `[...]`/`(...)` wrapper intact.
     *
     * This is the write-side counterpart to {@link parseInlineContent}: because
     * it reuses the same field boundaries, a full-line value (which may itself
     * contain `]`/`)`, e.g. `ref:: [[Note]]`) is replaced up to end-of-line and a
     * bracketed value only up to its matching close bracket - so updates no
     * longer append a stray closing bracket. Returns the line unchanged when no
     * field matches.
     */
    public replaceInlineFieldValue(line: string, key: string, newValue: string): string {
        const matches = this.parseLineFields(line).filter(field => field.key === key);
        if (matches.length === 0) return line;

        // Splice right-to-left so each field's offsets stay valid as we rewrite.
        let result = line;
        for (let i = matches.length - 1; i >= 0; i--) {
            const field = matches[i];
            result = result.slice(0, field.sepEnd) + " " + newValue + result.slice(field.valueEnd);
        }
        return result;
    }

}
