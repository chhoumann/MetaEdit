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
import {EditMode} from "./Types/editMode";
import {MetaType} from "./Types/metaType";
import type {Property} from "./parser";

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

const callUpdateMultiple = (controller: MetaController, props: Property[], file: TFile) =>
    (controller as unknown as {updateMultipleInFile(p: Property[], f: TFile): Promise<void>})
        .updateMultipleInFile(props, file);

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

describe("MetaController inline Dataview writes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("updatePropertyInFile rewrites real inline fields but leaves frontmatter and fenced examples untouched", async () => {
        const {controller, file, store} = setup(
            [
                "---",
                "summary: \"[status:: yaml example]\"",
                "---",
                "",
                "status:: Backlog",
                "",
                "```dataview",
                "status:: fenced example",
                "```",
                "",
                "tail",
            ].join("\n"),
        );

        await controller.updatePropertyInFile({key: "status", content: "Backlog", type: MetaType.Dataview}, "Done", file);

        expect(store.content).toBe(
            [
                "---",
                "summary: \"[status:: yaml example]\"",
                "---",
                "",
                "status:: Done",
                "",
                "```dataview",
                "status:: fenced example",
                "```",
                "",
                "tail",
            ].join("\n"),
        );
    });

    it("updateMultipleInFile rewrites multiple real inline fields but leaves fenced examples untouched", async () => {
        const {controller, file, store} = setup(
            [
                "status:: Backlog",
                "priority:: Low",
                "",
                "```",
                "status:: fenced status",
                "priority:: fenced priority",
                "```",
            ].join("\n"),
        );

        await callUpdateMultiple(
            controller,
            [
                {key: "status", content: "Done", type: MetaType.Dataview},
                {key: "priority", content: "High", type: MetaType.Dataview},
            ],
            file,
        );

        expect(store.content).toBe(
            [
                "status:: Done",
                "priority:: High",
                "",
                "```",
                "status:: fenced status",
                "priority:: fenced priority",
                "```",
            ].join("\n"),
        );
    });

    it("preserves mixed line endings while updating inline fields outside fences", async () => {
        const {controller, file, store} = setup(
            "status:: Backlog\r\nbody\n```dataview\r\nstatus:: fenced example\r\n```\n",
        );

        await controller.updatePropertyInFile({key: "status", content: "Backlog", type: MetaType.Dataview}, "Done", file);

        expect(store.content).toBe(
            "status:: Done\r\nbody\n```dataview\r\nstatus:: fenced example\r\n```\n",
        );
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

// Reserved object-machinery keys (__proto__/constructor/prototype) must be
// refused at EVERY controller frontmatter sink, mirroring the bulk path
// (deepsec slug other-prototype-pollution). A reserved key is dropped silently
// (or pollutes the prototype) by a dynamic `frontmatter[key] = value`, so the
// guard must fail closed - throw, never report a phantom success.
describe("MetaController reserved-key guard", () => {
    const RESERVED = ["__proto__", "constructor", "prototype"] as const;

    const setupFrontmatter = (initial: Record<string, unknown> = {}) => {
        const fm: Record<string, unknown> = {...initial};
        // Mirror Obsidian: the callback mutates the frontmatter object in place;
        // if it throws, the error propagates and the note is left unchanged.
        const processFrontMatter = vi.fn(async (_file: unknown, fn: (f: Record<string, unknown>) => void) => {
            fn(fm);
        });
        const vaultModify = vi.fn(async () => {});
        const app = {
            plugins: {plugins: {}},
            vault: {read: vi.fn(async () => ""), modify: vaultModify},
            fileManager: {processFrontMatter},
        };
        const plugin = {
            settings: {
                EditMode: {mode: EditMode.AllSingle, properties: [] as string[]},
                AutoProperties: {enabled: false, properties: []},
            },
        };
        const controller = new MetaController(app as never, plugin as never);
        return {controller, file: new TFile("note.md"), fm, processFrontMatter, vaultModify};
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("addYamlProp refuses reserved keys before opening the file, and writes ordinary keys", async () => {
        const ctx = setupFrontmatter();

        for (const key of RESERVED) {
            await expect(ctx.controller.addYamlProp(key, "x", ctx.file)).rejects.toThrow(/reserved property name/);
        }
        expect(ctx.processFrontMatter).not.toHaveBeenCalled();
        expect(ctx.fm).toEqual({});

        await ctx.controller.addYamlProp("status", "draft", ctx.file);
        expect(ctx.fm).toEqual({status: "draft"});
    });

    it("updatePropertyInFile refuses a reserved YAML key before opening the file, and updates ordinary keys", async () => {
        const ctx = setupFrontmatter({status: "draft"});

        for (const key of RESERVED) {
            await expect(
                ctx.controller.updatePropertyInFile({key, type: MetaType.YAML}, "x", ctx.file),
            ).rejects.toThrow(/reserved property name/);
        }
        expect(ctx.processFrontMatter).not.toHaveBeenCalled();
        expect(ctx.fm).toEqual({status: "draft"});

        await ctx.controller.updatePropertyInFile({key: "status", type: MetaType.YAML}, "done", ctx.file);
        expect(ctx.fm).toEqual({status: "done"});
    });

    it("updateMultipleInFile refuses a batch with any reserved YAML key, atomically", async () => {
        const ctx = setupFrontmatter({status: "draft"});
        const batch: Property[] = [
            {key: "status", type: MetaType.YAML, content: "done"},
            {key: "__proto__", type: MetaType.YAML, content: "x"},
        ];

        await expect(callUpdateMultiple(ctx.controller, batch, ctx.file)).rejects.toThrow(/reserved property name/);
        expect(ctx.processFrontMatter).not.toHaveBeenCalled();
        expect(ctx.fm).toEqual({status: "draft"});
    });

    it("updateMultipleInFile leaves body (tag) edits unwritten when a reserved YAML key is in the batch", async () => {
        const ctx = setupFrontmatter({status: "draft"});
        // A tag splice runs BEFORE the frontmatter write today, so the up-front
        // guard must abort the whole batch before any body edit lands.
        const batch: Property[] = [
            {key: "#todo", type: MetaType.Tag, content: "#done", position: {start: 0, end: 5, line: 0} as never},
            {key: "constructor", type: MetaType.YAML, content: "x"},
        ];

        await expect(callUpdateMultiple(ctx.controller, batch, ctx.file)).rejects.toThrow(/reserved property name/);
        expect(ctx.vaultModify).not.toHaveBeenCalled();
        expect(ctx.processFrontMatter).not.toHaveBeenCalled();
        expect(ctx.fm).toEqual({status: "draft"});
    });

    it("updateMultipleInFile refuses a reserved NESTED path segment before the tag splice (atomic)", async () => {
        const ctx = setupFrontmatter({safe: {ok: 1}});
        // A nested property carries its key in `path`; `prop.key` is the dotted
        // label, which is NOT a reserved literal. The guard must inspect the path
        // segments, or the tag splice lands before setYamlPath throws later.
        const batch: Property[] = [
            {key: "#todo", type: MetaType.Tag, content: "#done", position: {start: 0, end: 5, line: 0} as never},
            {key: "safe.__proto__", type: MetaType.YAML, content: "x", path: ["safe", "__proto__"]},
        ];

        await expect(callUpdateMultiple(ctx.controller, batch, ctx.file)).rejects.toThrow(/reserved property name/);
        expect(ctx.vaultModify).not.toHaveBeenCalled();
        expect(ctx.processFrontMatter).not.toHaveBeenCalled();
        expect(ctx.fm).toEqual({safe: {ok: 1}});
    });

    it("updateMultipleInFile writes ordinary YAML keys", async () => {
        const ctx = setupFrontmatter({status: "draft"});

        await callUpdateMultiple(ctx.controller, [{key: "status", type: MetaType.YAML, content: "done"}], ctx.file);

        expect(ctx.fm).toEqual({status: "done"});
    });

    it("updateYamlPath/addOrUpdateYamlPath refuse a reserved path segment (the throw inside processFrontMatter leaves the note unchanged)", async () => {
        const ctx = setupFrontmatter({safe: {ok: 1}});

        await expect(ctx.controller.updateYamlPath(["safe", "__proto__"], "x", ctx.file))
            .rejects.toThrow(/reserved property name/);
        await expect(ctx.controller.addOrUpdateYamlPath(["__proto__", "x"], "y", ctx.file))
            .rejects.toThrow(/reserved property name/);

        expect(ctx.fm).toEqual({safe: {ok: 1}});

        await ctx.controller.updateYamlPath(["safe", "ok"], 2, ctx.file);
        expect(ctx.fm).toEqual({safe: {ok: 2}});
    });
});
