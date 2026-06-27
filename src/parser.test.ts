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
});
