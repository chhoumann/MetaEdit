import {describe, expect, it} from "vitest";
import {TFile} from "obsidian";
import {getDateInputType, getValueSuggestions} from "./valueSuggest";
import {MetaType} from "../../Types/metaType";

type FileCache = {frontmatter?: Record<string, unknown>};

const makeApp = (options: {
    files?: Record<string, FileCache>;
    tags?: Record<string, number>;
    assignedWidget?: (key: string) => string | null;
    typeInfo?: (key: string) => {expected?: {type?: string}} | undefined;
    noTypeManager?: boolean;
}) => {
    const files = options.files ?? {};
    const markdownFiles = Object.keys(files).map(path => new TFile(path));

    return {
        vault: {
            getMarkdownFiles: () => markdownFiles,
        },
        metadataCache: {
            getTags: () => options.tags ?? {},
            getFileCache: (file: TFile) => files[file.path],
        },
        ...(options.noTypeManager
            ? {}
            : {
                metadataTypeManager: {
                    getAssignedWidget: options.assignedWidget ?? (() => null),
                    getTypeInfo: options.typeInfo ?? (() => undefined),
                },
            }),
    } as never;
};

describe("getValueSuggestions - frontmatter values", () => {
    it("returns distinct values ranked by frequency, then alphabetically", () => {
        const app = makeApp({
            files: {
                "a.md": {frontmatter: {status: "reading"}},
                "b.md": {frontmatter: {status: "finished"}},
                "c.md": {frontmatter: {status: "reading"}},
                "d.md": {frontmatter: {genre: "fiction"}},
            },
        });

        expect(getValueSuggestions(app, "status", MetaType.YAML)).toEqual(["reading", "finished"]);
    });

    it("flattens array values element-wise and unions scalars and arrays", () => {
        const app = makeApp({
            files: {
                "a.md": {frontmatter: {tags: ["a", "b"]}},
                "b.md": {frontmatter: {tags: "a"}},
                "c.md": {frontmatter: {tags: ["c"]}},
            },
        });

        // "a" occurs twice -> first; then b, c alphabetically.
        expect(getValueSuggestions(app, "tags", MetaType.YAML)).toEqual(["a", "b", "c"]);
    });

    it("coerces numbers and skips null, empty, and object values", () => {
        const app = makeApp({
            files: {
                "a.md": {frontmatter: {rating: 4}},
                "b.md": {frontmatter: {rating: null}},
                "c.md": {frontmatter: {rating: ""}},
                "d.md": {frontmatter: {rating: {nested: true}}},
                "e.md": {frontmatter: {}},
                "f.md": {},
            },
        });

        expect(getValueSuggestions(app, "rating", MetaType.YAML)).toEqual(["4"]);
    });

    it("returns an empty list when the key is unknown or empty", () => {
        const app = makeApp({files: {"a.md": {frontmatter: {status: "reading"}}}});

        expect(getValueSuggestions(app, "missing", MetaType.YAML)).toEqual([]);
        expect(getValueSuggestions(app, "", MetaType.YAML)).toEqual([]);
    });
});

describe("getValueSuggestions - tags", () => {
    it("suggests leaf segments (not full paths) ranked by count", () => {
        const app = makeApp({
            tags: {
                "#topic/science": 2,
                "#topic/history": 1,
                "#topic": 5,
                "#status/active": 3,
            },
        });

        // leaves: science(2), history(1), topic(5), active(3) -> by count desc
        expect(getValueSuggestions(app, "#topic/science", MetaType.Tag)).toEqual([
            "topic",
            "active",
            "science",
            "history",
        ]);
    });

    it("merges identical leaf segments under different parents", () => {
        const app = makeApp({
            tags: {
                "#a/draft": 1,
                "#b/draft": 2,
                "#draft": 4,
            },
        });

        expect(getValueSuggestions(app, "#a/draft", MetaType.Tag)).toEqual(["draft"]);
    });
});

describe("getDateInputType", () => {
    const dateApp = (assigned: string | null, inferred?: string) =>
        makeApp({
            assignedWidget: () => assigned,
            typeInfo: () => (inferred ? {expected: {type: inferred}} : undefined),
        });

    it("returns 'date' for an explicitly date-typed key with an ISO value", () => {
        expect(getDateInputType(dateApp("date"), "due", "2026-07-01", MetaType.YAML)).toBe("date");
    });

    it("returns 'date' for an empty value on a date-typed key", () => {
        expect(getDateInputType(dateApp("date"), "due", "", MetaType.YAML)).toBe("date");
        expect(getDateInputType(dateApp("date"), "due", null, MetaType.YAML)).toBe("date");
    });

    it("falls back to inferred type when no widget is explicitly assigned", () => {
        expect(getDateInputType(dateApp(null, "date"), "due", "2026-07-01", MetaType.YAML)).toBe("date");
    });

    it("returns 'datetime' only for a minute-precision ISO datetime value", () => {
        expect(getDateInputType(dateApp("datetime"), "when", "2026-07-01T13:30", MetaType.YAML)).toBe("datetime");
        expect(getDateInputType(dateApp("datetime"), "when", "2026-07-01T13:30:45", MetaType.YAML)).toBeNull();
        expect(getDateInputType(dateApp("datetime"), "when", "2026-07-01", MetaType.YAML)).toBeNull();
    });

    it("falls back to text (null) for non-ISO values so they are never clobbered", () => {
        expect(getDateInputType(dateApp("date"), "due", "next friday", MetaType.YAML)).toBeNull();
        expect(getDateInputType(dateApp("date"), "due", "TBD", MetaType.YAML)).toBeNull();
    });

    it("never offers a picker for non-date types or non-YAML properties", () => {
        expect(getDateInputType(dateApp("text"), "title", "2026-07-01", MetaType.YAML)).toBeNull();
        expect(getDateInputType(dateApp("date"), "due", "2026-07-01", MetaType.Dataview)).toBeNull();
        expect(getDateInputType(dateApp("date"), "#due", "2026-07-01", MetaType.Tag)).toBeNull();
    });

    it("degrades to text when metadataTypeManager is unavailable", () => {
        const app = makeApp({noTypeManager: true});
        expect(getDateInputType(app, "due", "2026-07-01", MetaType.YAML)).toBeNull();
    });
});
