import {describe, expect, it} from "vitest";
import MetaEditParser, {type InlineFieldInsertLocation} from "./parser";

// computeInlineInsertIndex is pure: it only reads the content string, so drive it
// directly with literals. The returned index is into content.split(/\r?\n/), which is
// exactly what the writer splices into.
const insertIndex = (content: string, name: string, location?: InlineFieldInsertLocation): number =>
    new MetaEditParser({} as any).computeInlineInsertIndex(content, name, location);

// Apply the helper the way the writer does, so each case reads as the resulting file.
const append = (content: string, name: string, value: string, location?: InlineFieldInsertLocation): string => {
    const newline = content.includes("\r\n") ? "\r\n" : "\n";
    const lines = content.split(/\r?\n/);
    lines.splice(insertIndex(content, name, location), 0, `${name}:: ${value}`);
    return lines.join(newline);
};

describe("computeInlineInsertIndex - afterLastMatch", () => {
    it("inserts right after the last existing field, leaving the others untouched (#91)", () => {
        const content = ["---", "title: Movies", "---", "", "watch:: [[A]]", "watch:: [[B]]", "watch:: [[C]]", ""].join("\n");

        expect(insertIndex(content, "watch")).toBe(7);
        expect(append(content, "watch", "[[D]]")).toBe(
            ["---", "title: Movies", "---", "", "watch:: [[A]]", "watch:: [[B]]", "watch:: [[C]]", "watch:: [[D]]", ""].join("\n"),
        );
    });

    it("inserts between the last matching field and following content", () => {
        const content = ["intro", "watch:: a", "watch:: b", "outro"].join("\n");

        expect(append(content, "watch", "c")).toBe(["intro", "watch:: a", "watch:: b", "watch:: c", "outro"].join("\n"));
    });

    it("falls back to end of body when no field of that name exists", () => {
        const content = ["---", "title: x", "---", "", "Some body text."].join("\n");

        expect(append(content, "watch", "new")).toBe(
            ["---", "title: x", "---", "", "Some body text.", "watch:: new"].join("\n"),
        );
    });

    it("matches bracketed inline fields", () => {
        const content = ["intro [watch:: a] tail", "more body"].join("\n");

        expect(insertIndex(content, "watch")).toBe(1);
    });

    it("only matches the exact key, never a longer key with the same prefix", () => {
        const content = ["watching:: a", "rewatch:: b", "body"].join("\n");

        // No real `watch` field -> append to end of body, do not anchor on watching/rewatch.
        expect(append(content, "watch", "x")).toBe(["watching:: a", "rewatch:: b", "body", "watch:: x"].join("\n"));
    });

    it("treats a key with regex metacharacters literally", () => {
        const content = ["a.b:: first", "axb:: other", "body"].join("\n");

        // Must anchor on the literal `a.b` line (index 0), not the regex-style match `axb`.
        expect(insertIndex(content, "a.b")).toBe(1);
    });
});

describe("computeInlineInsertIndex - never inside frontmatter", () => {
    it("does not anchor on a Dataview-looking scalar inside frontmatter", () => {
        const content = ["---", 'summary: "[watch:: yaml scalar]"', "---", "Body"].join("\n");

        // The frontmatter line must be skipped; with no body field, append to end of body.
        expect(append(content, "watch", "new")).toBe(
            ["---", 'summary: "[watch:: yaml scalar]"', "---", "Body", "watch:: new"].join("\n"),
        );
    });

    it("appends after frontmatter when the note is frontmatter-only", () => {
        const content = ["---", "title: x", "---", ""].join("\n");

        expect(append(content, "watch", "new")).toBe(["---", "title: x", "---", "watch:: new", ""].join("\n"));
    });
});

describe("computeInlineInsertIndex - never inside fenced code blocks", () => {
    it("ignores a field inside a fenced code block", () => {
        const content = ["text", "```js", "watch:: fake", "```", "real:: x"].join("\n");

        // The fenced `watch:: fake` is not a real field; with no body `watch` field,
        // append after the last body content line.
        expect(append(content, "watch", "new")).toBe(
            ["text", "```js", "watch:: fake", "```", "real:: x", "watch:: new"].join("\n"),
        );
    });

    it("end places the field after a trailing closed fence, not before it", () => {
        const content = ["Intro", "```ts", "const x = 1;", "```"].join("\n");

        expect(append(content, "watch", "new", "end")).toBe(
            ["Intro", "```ts", "const x = 1;", "```", "watch:: new"].join("\n"),
        );
    });

    it("inserts before an unclosed trailing fence rather than inside it", () => {
        const content = ["intro", "```", "code"].join("\n");

        expect(append(content, "watch", "new", "end")).toBe(["intro", "watch:: new", "```", "code"].join("\n"));
    });

    it("does not close an outer ``` fence on a non-matching ~~~ marker", () => {
        const content = ["```", "~~~", "watch:: fake", "```", "after"].join("\n");

        // `watch:: fake` sits inside the still-open ``` fence, so it is not a match.
        expect(append(content, "watch", "new")).toBe(["```", "~~~", "watch:: fake", "```", "after", "watch:: new"].join("\n"));
    });
});

describe("computeInlineInsertIndex - location: end", () => {
    it("appends at end of body even when a matching field exists earlier", () => {
        const content = ["watch:: a", "body", "more"].join("\n");

        expect(append(content, "watch", "z", "end")).toBe(["watch:: a", "body", "more", "watch:: z"].join("\n"));
    });

    it("skips trailing blank lines and inserts after the last content line", () => {
        const content = ["body", "", ""].join("\n");

        expect(append(content, "watch", "x", "end")).toBe(["body", "watch:: x", "", ""].join("\n"));
    });
});

describe("computeInlineInsertIndex - edge cases", () => {
    it("handles an empty file (index 0)", () => {
        expect(insertIndex("", "watch")).toBe(0);
        expect(append("", "watch", "x")).toBe("watch:: x\n");
    });

    it("appends to a single-line note without a trailing newline", () => {
        expect(append("watch:: a", "watch", "b")).toBe(["watch:: a", "watch:: b"].join("\n"));
    });

    it("preserves CRLF line endings and does not introduce a bare LF", () => {
        const content = "Intro\r\nwatch:: old\r\nTail\r\n";

        expect(append(content, "watch", "new")).toBe("Intro\r\nwatch:: old\r\nwatch:: new\r\nTail\r\n");
    });

    it("recognizes a CRLF frontmatter block and does not anchor inside it", () => {
        const content = "---\r\nwatch:: yaml\r\n---\r\nBody\r\n";

        expect(append(content, "watch", "new")).toBe("---\r\nwatch:: yaml\r\n---\r\nBody\r\nwatch:: new\r\n");
    });
});
