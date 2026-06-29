import {beforeEach, describe, expect, it, vi} from "vitest";
import {TFile} from "obsidian";

// The controller transitively imports Svelte-backed modals, which the node test
// environment cannot transform. The append writer never touches them, so replace the
// modal modules with light stubs to keep this suite jsdom-free.
vi.mock("./Modals/GenericPrompt/GenericPrompt", () => ({default: {Prompt: vi.fn()}}));
vi.mock("./Modals/GenericSuggester/GenericSuggester", () => ({default: {Suggest: vi.fn()}}));
vi.mock("./Modals/AutoPropertyValueModal/AutoPropertyValueModal", () => ({default: {Show: vi.fn()}}));

import MetaController from "./metaController";
import AutoPropertyValueModal from "./Modals/AutoPropertyValueModal/AutoPropertyValueModal";
import {SettingsWriter} from "./settingsWrites";
import type {AutoProperty} from "./Types/autoProperty";

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

// Persisting a chosen Auto Property value back into the settings is a read-modify-write
// on the shared `AutoProperties.properties`. These cover the serialization fix (deepsec
// slug other-race-condition): the controller routes that write through the plugin's one
// settings write queue, re-reads the live list inside the critical section, and rolls
// back in memory if the disk write fails.
describe("MetaController.persistAutoPropertyChoices", () => {
    const setupAutoProps = (options: {failFlush?: boolean; initialChoices?: string[]} = {}) => {
        const settings = {
            AutoProperties: {
                enabled: true,
                properties: [{name: "status", choices: [...(options.initialChoices ?? ["todo"])]} as AutoProperty],
            },
            EditMode: {mode: "AllSingle", properties: [] as string[]},
        };
        // The modeled disk snapshots `settings` synchronously at write time, exactly like
        // Obsidian's saveData, so a lost update would be visible here and not just in memory.
        let disk = structuredClone(settings);
        let flushes = 0;
        const writer = new SettingsWriter(async () => {
            flushes++;
            if (options.failFlush) throw new Error("disk full");
            disk = structuredClone(settings);
        });
        const plugin = {
            settings,
            saveSettings: () => writer.save(),
            updateSettings: (mutate: () => (() => void) | false | void) => writer.update(mutate),
        };
        const app = {plugins: {plugins: {}}, vault: {}};
        const controller = new MetaController(app as never, plugin as never);
        const persist = (autoProp: AutoProperty, values: string[]) =>
            (controller as unknown as {persistAutoPropertyChoices(a: AutoProperty, v: string[]): Promise<void>})
                .persistAutoPropertyChoices(autoProp, values);
        return {
            controller,
            plugin,
            settings,
            persist,
            liveChoices: () => settings.AutoProperties.properties[0].choices,
            diskChoices: () => disk.AutoProperties.properties[0].choices,
            flushes: () => flushes,
        };
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("persists a newly chosen value through the modal's save callback", async () => {
        const ctx = setupAutoProps();
        (AutoPropertyValueModal.Show as ReturnType<typeof vi.fn>).mockImplementation(
            async (_app: unknown, autoProp: AutoProperty, opts: {onSaveChoices: (v: string[]) => Promise<void>}) => {
                await opts.onSaveChoices(["doing"]);
                return "doing";
            },
        );

        await ctx.controller.handleAutoProperties("status");

        expect(ctx.liveChoices()).toEqual(["todo", "doing"]);
        expect(ctx.diskChoices()).toEqual(["todo", "doing"]);
    });

    it("does not lose a choice when two adds to the same property interleave", async () => {
        const ctx = setupAutoProps();
        const autoProp = ctx.settings.AutoProperties.properties[0];

        await Promise.all([
            ctx.persist(autoProp, ["doing"]),
            ctx.persist(autoProp, ["done"]),
        ]);

        expect(ctx.liveChoices()).toEqual(["todo", "doing", "done"]);
        expect(ctx.diskChoices()).toEqual(["todo", "doing", "done"]);
    });

    it("re-resolves the live entry by name when a concurrent write replaced the list", async () => {
        const ctx = setupAutoProps();
        const staleAutoProp = ctx.settings.AutoProperties.properties[0]; // captured before the replace

        // A concurrent setAutoProperties-style replace and a choice-add are enqueued
        // together; the persist must append to the REPLACED entry, not the stale one.
        await Promise.all([
            ctx.plugin.updateSettings(() => {
                ctx.settings.AutoProperties.properties = [{name: "status", choices: ["backlog"]} as AutoProperty];
                return () => undefined;
            }),
            ctx.persist(staleAutoProp, ["doing"]),
        ]);

        expect(ctx.liveChoices()).toEqual(["backlog", "doing"]);
        expect(ctx.diskChoices()).toEqual(["backlog", "doing"]);
    });

    it("skips the disk write when every chosen value already exists", async () => {
        const ctx = setupAutoProps({initialChoices: ["todo", "doing"]});
        const autoProp = ctx.settings.AutoProperties.properties[0];

        await ctx.persist(autoProp, ["todo", "doing"]);

        expect(ctx.flushes()).toBe(0);
        expect(ctx.liveChoices()).toEqual(["todo", "doing"]);
    });

    it("rolls back in memory and surfaces a notice when the save fails", async () => {
        const ctx = setupAutoProps({failFlush: true});
        const autoProp = ctx.settings.AutoProperties.properties[0];

        // persist swallows the failure (the note value is still valid) after rolling back.
        await expect(ctx.persist(autoProp, ["doing"])).resolves.toBeUndefined();

        expect(ctx.liveChoices()).toEqual(["todo"]);
        expect(ctx.diskChoices()).toEqual(["todo"]);
    });
});
