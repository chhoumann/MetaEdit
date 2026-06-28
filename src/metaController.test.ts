import {beforeEach, describe, expect, it, vi} from "vitest";
import {TFile} from "obsidian";

// The controller transitively imports Svelte-backed modals, which the node test
// environment cannot transform. The append writer never touches them, so replace the
// modal modules with light stubs to keep this suite jsdom-free.
vi.mock("./Modals/GenericPrompt/GenericPrompt", () => ({default: {Prompt: vi.fn()}}));
vi.mock("./Modals/GenericSuggester/GenericSuggester", () => ({default: {Suggest: vi.fn()}}));
vi.mock("./Modals/AutoPropertyValueModal/AutoPropertyValueModal", () => ({default: {Show: vi.fn()}}));

import MetaController from "./metaController";

const setup = (initial: string) => {
    const store = {content: initial};
    const app = {
        plugins: {plugins: {}},
        vault: {
            read: vi.fn(async () => store.content),
            modify: vi.fn(async (_file: unknown, data: string) => {
                store.content = data;
            }),
        },
    };
    const controller = new MetaController(app as never, {} as never);
    return {controller, file: new TFile("note.md"), store, app};
};

describe("MetaController.appendDataviewField", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("appends a new instance after the last one, leaving existing fields untouched (#91)", async () => {
        const {controller, file, store} = setup(
            ["---", "title: Movies", "---", "", "watch:: [[A]]", "watch:: [[B]]", "watch:: [[C]]", ""].join("\n"),
        );

        await controller.appendDataviewField("watch", "[[D]]", file);

        expect(store.content).toBe(
            ["---", "title: Movies", "---", "", "watch:: [[A]]", "watch:: [[B]]", "watch:: [[C]]", "watch:: [[D]]", ""].join("\n"),
        );
    });

    it("inserts at line index 0 instead of silently no-opping (the index-0 bug)", async () => {
        const {controller, file, store} = setup("");

        await controller.appendDataviewField("watch", "[[A]]", file);

        expect(store.content).toBe("watch:: [[A]]\n");
    });

    it("never inserts inside frontmatter", async () => {
        const {controller, file, store} = setup(["---", 'summary: "[watch:: yaml]"', "---", "Body"].join("\n"));

        await controller.appendDataviewField("watch", "new", file);

        expect(store.content).toBe(["---", 'summary: "[watch:: yaml]"', "---", "Body", "watch:: new"].join("\n"));
    });

    it("respects location: end", async () => {
        const {controller, file, store} = setup(["watch:: a", "body"].join("\n"));

        await controller.appendDataviewField("watch", "z", file, {location: "end"});

        expect(store.content).toBe(["watch:: a", "body", "watch:: z"].join("\n"));
    });

    it("stringifies array values", async () => {
        const {controller, file, store} = setup("body");

        await controller.appendDataviewField("genres", ["action", "drama"], file);

        expect(store.content).toBe(["body", "genres:: action, drama"].join("\n"));
    });

    it("preserves CRLF line endings", async () => {
        const {controller, file, store} = setup("Intro\r\nwatch:: old\r\nTail\r\n");

        await controller.appendDataviewField("watch", "new", file);

        expect(store.content).toBe("Intro\r\nwatch:: old\r\nwatch:: new\r\nTail\r\n");
    });

    it("serializes concurrent appends so neither write is lost", async () => {
        const {controller, file, store} = setup("body");

        await Promise.all([
            controller.appendDataviewField("watch", "1", file),
            controller.appendDataviewField("watch", "2", file),
        ]);

        expect(store.content).toBe(["body", "watch:: 1", "watch:: 2"].join("\n"));
    });
});
