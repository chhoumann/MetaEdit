import { afterEach, describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";

// MetaController and BulkMetadataEditor transitively import Svelte-backed modals
// (and BulkOptionModal extends obsidian's Modal), which the node test environment
// cannot transform. None of those are touched by the write paths under test, so
// replace the modal modules with light stubs to keep this suite jsdom-free
// (mirrors metaController.test.ts).
vi.mock("../Modals/GenericPrompt/GenericPrompt", () => ({ default: { Prompt: vi.fn() } }));
vi.mock("../Modals/GenericSuggester/GenericSuggester", () => ({ default: { Suggest: vi.fn() } }));
vi.mock("../Modals/AutoPropertyValueModal/AutoPropertyValueModal", () => ({ default: { Show: vi.fn() } }));
vi.mock("./BulkOptionModal", () => ({ BulkOptionModal: { Choose: vi.fn() } }));

import MetaController from "../metaController";
import { BulkMetadataEditor } from "./bulkMetadataEditor";
import GenericPrompt from "../Modals/GenericPrompt/GenericPrompt";
import { EditMode } from "../Types/editMode";

/**
 * Proves the deepsec finding `other-write-serialization-race`: bulk frontmatter
 * writes now run through the controller's per-file write queue
 * (`MetaController.enqueueFrontmatterWrite` -> `enqueueFileWrite`), so a bulk
 * `processFrontMatter` write can no longer race - and lose to - a controller
 * `vault.read`+`vault.modify` whole-file write to the SAME note.
 *
 * The race partner is a REAL whole-file controller write (`appendDataviewField`,
 * which Obsidian does not serialize against a bare `processFrontMatter`), not a
 * YAML/`processFrontMatter` path that would already be safe. Each test uses a
 * unique path so the module-level `fileWriteQueues` map never leaks state across
 * tests, and every gate is released so each queue fully drains.
 */

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// Minimal but faithful frontmatter <-> string round-trip for the in-memory vault:
// `processFrontMatter` mutates the parsed object, the inline/whole-file path edits
// the raw string, and both share one content store - exactly the two write
// primitives that race in production.
function parseContent(content: string): { fm: Record<string, unknown>; body: string } {
	const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return { fm: {}, body: content };

	const fm: Record<string, unknown> = {};
	for (const line of match[1].split("\n")) {
		const idx = line.indexOf(":");
		if (idx === -1) continue;
		const key = line.slice(0, idx).trim();
		if (!key) continue;
		fm[key] = line.slice(idx + 1).trim();
	}
	return { fm, body: match[2] };
}

function serializeContent(fm: Record<string, unknown>, body: string): string {
	const lines = Object.entries(fm).map(([key, value]) => `${key}: ${String(value)}`);
	return `---\n${lines.join("\n")}\n---\n${body}`;
}

type Harness = {
	app: any;
	plugin: any;
	controller: MetaController;
	bulkEditor: BulkMetadataEditor;
	files: Map<string, { content: string }>;
	/** Paths whose `processFrontMatter` callback (the bulk write) has started. */
	fmStarted: string[];
	/** Optional hook run before each `vault.modify`, used to gate a controller write. */
	hooks: { beforeModify?: (file: TFile, content: string) => Promise<void> | void };
};

function makeHarness(initial: Record<string, string>): Harness {
	const files = new Map<string, { content: string }>();
	for (const [path, content] of Object.entries(initial)) files.set(path, { content });

	const fmStarted: string[] = [];
	const hooks: Harness["hooks"] = {};

	const app: any = {
		plugins: { plugins: {} },
		vault: {
			read: async (file: TFile) => files.get(file.path)!.content,
			cachedRead: async (file: TFile) => files.get(file.path)!.content,
			modify: async (file: TFile, content: string) => {
				if (hooks.beforeModify) await hooks.beforeModify(file, content);
				files.get(file.path)!.content = content;
			},
		},
		fileManager: {
			processFrontMatter: async (file: TFile, fn: (fm: Record<string, unknown>) => void) => {
				fmStarted.push(file.path);
				const store = files.get(file.path)!;
				const { fm, body } = parseContent(store.content);
				fn(fm);
				store.content = serializeContent(fm, body);
			},
		},
	};

	const plugin: any = {
		app,
		settings: { EditMode: { mode: EditMode.AllSingle, properties: [] as string[] } },
	};
	const controller = new MetaController(app, plugin);
	plugin.controller = controller;
	const bulkEditor = new BulkMetadataEditor(app, plugin);

	return { app, plugin, controller, bulkEditor, files, fmStarted, hooks };
}

/**
 * Park a controller whole-file write (`appendDataviewField`) at its `vault.modify`
 * step (its stale snapshot already read), then start a bulk frontmatter write to
 * the same note. Snapshot whether the bulk write has begun while the controller is
 * still parked, release the gate, and return the drained result. Uses bounded
 * `tick()`s and an unconditional release so it never blocks on bulk completing -
 * which post-fix cannot happen until the gate opens (it is queued behind).
 */
async function runGatedRace(harness: Harness, file: TFile) {
	let releaseModify!: () => void;
	const modifyGate = new Promise<void>((resolve) => {
		releaseModify = resolve;
	});
	// One-shot: gate only the first modify (the controller's), then step aside.
	harness.hooks.beforeModify = async () => {
		harness.hooks.beforeModify = undefined;
		await modifyGate;
	};

	const pController = harness.controller.appendDataviewField("reviewed", "yes", file, {
		location: "end",
	});
	await tick(); // controller reads its snapshot and parks at the modify gate

	const pBulk = harness.bulkEditor.apply([file], "status", "draft", "skip");
	await tick(); // post-fix: bulk is queued; pre-fix: bulk's write already ran

	const bulkStartedWhileParked = harness.fmStarted.includes(file.path);
	releaseModify();
	const [, summary] = await Promise.all([pController, pBulk]);

	return {
		bulkStartedWhileParked,
		summary,
		finalContent: harness.files.get(file.path)!.content,
	};
}

describe("BulkMetadataEditor serialization through the controller write queue", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("queues the bulk frontmatter write behind an in-flight controller write to the same note", async () => {
		const path = "race-order.md";
		const harness = makeHarness({ [path]: "---\ntitle: Note\n---\nbody\n" });

		const result = await runGatedRace(harness, new TFile(path));

		// The bulk write must NOT have begun while the controller write held the
		// queue. Pre-fix (direct processFrontMatter, unqueued) this is true and the
		// assertion fails - which is the regression this proves.
		expect(result.bulkStartedWhileParked).toBe(false);
		// Once the controller write completes, the bulk write runs.
		expect(harness.fmStarted).toContain(path);
	});

	it("does not lose the bulk frontmatter change when it races a controller whole-file write", async () => {
		const path = "race-loss.md";
		const harness = makeHarness({ [path]: "---\ntitle: Note\n---\nbody\n" });

		const result = await runGatedRace(harness, new TFile(path));

		// Both writes survive: the controller's appended inline field AND the bulk
		// frontmatter property. Pre-fix the controller's stale snapshot overwrites
		// and silently drops `status: draft`.
		expect(result.finalContent).toContain("status: draft");
		expect(result.finalContent).toContain("reviewed:: yes");
		expect(result.summary.added).toBe(1);
	});

	it("isolates a failing bulk write and keeps the per-file queue usable for the next write", async () => {
		const path = "race-error.md";
		const harness = makeHarness({ [path]: "---\ntitle: Note\n---\nbody\n" });
		const file = new TFile(path);

		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		// The queued bulk write rejects. enqueueFileWrite must still propagate the
		// failure to apply's per-file guard AND clean up the queue entry so the next
		// write to the same path is not poisoned by the rejection.
		harness.app.fileManager.processFrontMatter = vi.fn(async () => {
			throw new Error("boom");
		});

		const summary = await harness.bulkEditor.apply([file], "status", "draft", "skip");

		expect(summary.failed).toBe(1);
		expect(summary.failures).toEqual([{ path, error: "boom" }]);
		expect(warn).toHaveBeenCalledTimes(1);

		// A subsequent same-file controller write still runs to completion, proving
		// the queue recovered from the rejected bulk write.
		await harness.controller.appendDataviewField("reviewed", "yes", file, { location: "end" });
		expect(harness.files.get(path)!.content).toContain("reviewed:: yes");
	});
});

/**
 * Proves the deepsec finding `other-proto-key-unguarded`: a reserved
 * object-machinery key (`__proto__`/`constructor`/`prototype`) is refused rather
 * than silently dropped (or prototype-mutated) while the summary claims it was
 * added. The bulk write must never report success/added for such a key, and the
 * note must be left byte-for-byte untouched.
 */
describe("BulkMetadataEditor reserved-key guard", () => {
	const RESERVED = ["__proto__", "constructor", "prototype"];
	const ORIGINAL = "---\ntitle: Note\n---\nbody\n";

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("rejects a reserved key at the public apply() boundary without touching any note", async () => {
		for (const key of RESERVED) {
			const path = `reserved-apply-${key}.md`;
			const harness = makeHarness({ [path]: ORIGINAL });
			const file = new TFile(path);

			// apply() refuses the whole batch once - it rejects rather than returning
			// a summary that overstates the refusal as N per-note write failures.
			await expect(harness.bulkEditor.apply([file], key, "draft", "skip")).rejects.toThrow(
				/reserved property name/,
			);

			// processFrontMatter was never invoked and the note is byte-for-byte intact.
			expect(harness.fmStarted).not.toContain(path);
			expect(harness.files.get(path)!.content).toBe(ORIGINAL);
		}
	});

	it("fails closed at the applyToFile write boundary when called directly (bypassing apply)", async () => {
		// TS `private` is not runtime-private and `plugin.bulkEditor` is public, so
		// applyToFile is reachable on its own. The write-boundary guard must still
		// keep "__proto__" from reaching `frontmatter[key] = ...`.
		const path = "reserved-applyToFile.md";
		const harness = makeHarness({ [path]: ORIGINAL });
		const file = new TFile(path);

		await expect(
			(harness.bulkEditor as any).applyToFile(file, "__proto__", "draft", "skip", false),
		).rejects.toThrow(/reserved property name/);

		expect(harness.fmStarted).not.toContain(path);
		expect(harness.files.get(path)!.content).toBe(ORIGINAL);
	});

	it("run() aborts on a reserved key before applying, so no summary can report it added", async () => {
		// The original bug was the completion summary disagreeing with the write:
		// "__proto__" was reported "added" though nothing landed. apply() is what
		// produces that summary, so the interactive flow must never reach it.
		const path = "reserved-run.md";
		const harness = makeHarness({ [path]: ORIGINAL });
		(GenericPrompt.Prompt as ReturnType<typeof vi.fn>).mockResolvedValueOnce("  __proto__  ");
		const applySpy = vi.spyOn(harness.bulkEditor, "apply");

		await harness.bulkEditor.run([new TFile(path)], "Folder");

		// Trimmed to "__proto__", refused before the value prompt: apply (and thus
		// any added/success summary) is never reached, and the note is untouched.
		expect(GenericPrompt.Prompt).toHaveBeenCalledTimes(1); // key prompt only, no value prompt
		expect(applySpy).not.toHaveBeenCalled();
		expect(harness.files.get(path)!.content).toBe(ORIGINAL);
	});

	it("still writes an ordinary key normally", async () => {
		const path = "reserved-normal-key.md";
		const harness = makeHarness({ [path]: ORIGINAL });

		const summary = await harness.bulkEditor.apply([new TFile(path)], "status", "draft", "skip");

		expect(summary.added).toBe(1);
		expect(summary.failed).toBe(0);
		expect(harness.files.get(path)!.content).toContain("status: draft");
	});
});
