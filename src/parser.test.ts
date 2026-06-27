import {describe, expect, it, vi} from "vitest";
import {TFile} from "obsidian";
import MetaEditParser from "./parser";
import {MetaType} from "./Types/metaType";

const createParser = (cache: unknown, content: string): MetaEditParser => {
    const app = {
        metadataCache: {
            getFileCache: vi.fn().mockReturnValue(cache),
        },
        vault: {
            cachedRead: vi.fn().mockResolvedValue(content),
        },
    };

    return new MetaEditParser(app as any);
};

// Inline parsing is pure: drive it directly with a string so the many edge
// cases read clearly.
const parseInline = (content: string): Array<{key: string, content: unknown}> =>
    new MetaEditParser({} as any)
        .parseInlineContent(content)
        .map(({key, content: value}) => ({key, content: value}));

describe("MetaEditParser frontmatter parsing", () => {
    it("uses legacy frontmatter.position when frontmatterPosition is missing", async () => {
        const file = new TFile("legacy.md");
        const parser = createParser(
            {
                frontmatter: {
                    position: {
                        start: {line: 0, col: 0, offset: 0},
                        end: {line: 2, col: 3, offset: 18},
                    },
                },
            },
            "---\nstatus: live\n---\nBody\n",
        );

        await expect(parser.parseFrontmatter(file)).resolves.toEqual([
            {key: "status", content: "live", type: MetaType.YAML},
        ]);
    });

    it("falls back to cached frontmatter entries when no position metadata exists", async () => {
        const file = new TFile("cache-only.md");
        const parser = createParser(
            {
                frontmatter: {
                    status: "cached",
                    tags: ["a", "b"],
                },
            },
            "",
        );

        await expect(parser.parseFrontmatter(file)).resolves.toEqual([
            {key: "status", content: "cached", type: MetaType.YAML},
            {key: "tags", content: ["a", "b"], type: MetaType.YAML},
        ]);
    });

    // #85: `tags:value` (and other non-mapping frontmatter) must not be walked
    // with `for..in`, which would surface string/array indices like `0:value`.
    it("ignores non-mapping frontmatter instead of emitting index keys (#85)", async () => {
        const stringFm = createParser({frontmatter: "tags:someValue"}, "");
        await expect(stringFm.parseFrontmatter(new TFile("string-fm.md"))).resolves.toEqual([]);

        const arrayFm = createParser({frontmatter: ["item1", "item2"]}, "");
        await expect(arrayFm.parseFrontmatter(new TFile("array-fm.md"))).resolves.toEqual([]);
    });
});

describe("MetaEditParser inline field parsing", () => {
    it("parses exact inline keys that contain regex metacharacters", async () => {
        const file = new TFile("inline.md");
        const parser = createParser(
            {},
            "progress (%):: old\n[[my-key:: value]]\n(status:: complete)\n",
        );

        await expect(parser.parseInlineFields(file)).resolves.toEqual([
            {key: "progress (%)", content: "old", type: MetaType.Dataview},
            {key: "my-key", content: "value", type: MetaType.Dataview},
            {key: "status", content: "complete", type: MetaType.Dataview},
        ]);
    });

    it("reads keys behind blockquote and list markers (#78)", () => {
        expect(parseInline("> - bqListKey:: bqListVal")).toEqual([{key: "bqListKey", content: "bqListVal"}]);
        expect(parseInline("> quoteKey:: quoteVal")).toEqual([{key: "quoteKey", content: "quoteVal"}]);
        expect(parseInline("- listKey:: listVal")).toEqual([{key: "listKey", content: "listVal"}]);
        expect(parseInline("* starKey:: v")).toEqual([{key: "starKey", content: "v"}]);
        expect(parseInline("+ plusKey:: v")).toEqual([{key: "plusKey", content: "v"}]);
        expect(parseInline("1. orderedKey:: v")).toEqual([{key: "orderedKey", content: "v"}]);
        expect(parseInline("> > - nestedKey:: v")).toEqual([{key: "nestedKey", content: "v"}]);
        expect(parseInline("    - indentedKey:: v")).toEqual([{key: "indentedKey", content: "v"}]);
    });

    it("strips wrapping brackets/parens from keys and values (#84)", () => {
        expect(parseInline("- (parenKey:: parenVal)")).toEqual([{key: "parenKey", content: "parenVal"}]);
        expect(parseInline("(bareParenKey:: bareParenVal)")).toEqual([{key: "bareParenKey", content: "bareParenVal"}]);
        expect(parseInline("[brackKey:: brackVal]")).toEqual([{key: "brackKey", content: "brackVal"}]);
        // Value must not keep a trailing wrapper paren.
        expect(parseInline("- (someKey:: Something to do)")).toEqual([{key: "someKey", content: "Something to do"}]);
    });

    it("extracts every bracketed field from a table row (#84)", () => {
        expect(parseInline("| (task:: do a thing) | (result:: None) |")).toEqual([
            {key: "task", content: "do a thing"},
            {key: "result", content: "None"},
        ]);
    });

    it("keeps a verbatim full-line key so round keys survive a write cycle", () => {
        expect(parseInline("progress (%):: 50")).toEqual([{key: "progress (%)", content: "50"}]);
        expect(parseInline("plainKey:: plainVal")).toEqual([{key: "plainKey", content: "plainVal"}]);
    });

    it("lets bracketed fields win over a full-line read on the same line", () => {
        // The first `::` sits inside `(task:: ...)`, so there is no garbage
        // `| (task` full-line key.
        expect(parseInline("text (task:: t) more")).toEqual([{key: "task", content: "t"}]);
    });

    it("handles values containing colons, links, and balanced brackets", () => {
        expect(parseInline("url:: https://example.com/a::b")).toEqual([{key: "url", content: "https://example.com/a::b"}]);
        expect(parseInline("note:: see foo (bar) baz")).toEqual([{key: "note", content: "see foo (bar) baz"}]);
        expect(parseInline("(ref:: [[Some Note]])")).toEqual([{key: "ref", content: "[[Some Note]]"}]);
    });

    it("supports unicode and emoji keys", () => {
        expect(parseInline("café:: oui")).toEqual([{key: "café", content: "oui"}]);
        expect(parseInline("уровень:: высокий")).toEqual([{key: "уровень", content: "высокий"}]);
    });

    it("keeps empty values", () => {
        expect(parseInline("emptyKey::")).toEqual([{key: "emptyKey", content: ""}]);
        expect(parseInline("(emptyKey::)")).toEqual([{key: "emptyKey", content: ""}]);
    });

    it("ignores lines without inline fields", () => {
        expect(parseInline("Just a sentence with a : single colon.")).toEqual([]);
        expect(parseInline("# Heading")).toEqual([]);
        expect(parseInline("| --- | --- |")).toEqual([]);
        expect(parseInline("[[A Wikilink]] and (parentheses)")).toEqual([]);
    });

    it("does not read fields inside fenced code blocks", () => {
        const content = [
            "real:: yes",
            "```js",
            "const fake = 'fake:: no';",
            "```",
            "real2:: yes",
            "~~~",
            "tilde:: no",
            "~~~",
            "real3:: yes",
        ].join("\n");
        expect(parseInline(content)).toEqual([
            {key: "real", content: "yes"},
            {key: "real2", content: "yes"},
            {key: "real3", content: "yes"},
        ]);
    });

    it("does not read fields inside the YAML frontmatter block", () => {
        const content = ["---", "title:: not inline", "---", "body:: yes"].join("\n");
        expect(parseInline(content)).toEqual([{key: "body", content: "yes"}]);
    });

    it("parses two adjacent bracketed fields", () => {
        expect(parseInline("(a:: 1)(b:: 2)")).toEqual([
            {key: "a", content: "1"},
            {key: "b", content: "2"},
        ]);
    });

    it("treats a backslash as an ordinary value character", () => {
        // A `\` before the closing bracket must not drop the field.
        expect(parseInline("(x:: a\\) (y:: b)")).toEqual([
            {key: "x", content: "a\\"},
            {key: "y", content: "b"},
        ]);
        expect(parseInline("(path:: C:\\)")).toEqual([{key: "path", content: "C:\\"}]);
        expect(parseInline("[note:: draft\\]")).toEqual([{key: "note", content: "draft\\"}]);
    });

    it("only strips a blockquote marker that is separated from the key by space", () => {
        // `> key::` (spaced) -> clean key; `>key::` keeps the marker so the key
        // is still locatable by the write path, mirroring the list-marker rule.
        expect(parseInline("> spaced:: v")).toEqual([{key: "spaced", content: "v"}]);
        expect(parseInline(">tight:: v")).toEqual([{key: ">tight", content: "v"}]);
        expect(parseInline("-tight:: v")).toEqual([{key: "-tight", content: "v"}]);
    });
});
