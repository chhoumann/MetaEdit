import { describe, expect, test } from "vitest";
import { createMetaEditE2EHarness, evalJsonAsync, PLUGIN_ID, writeLiveFile } from "./harness";
import { NATIVE_PROMPT_HELPERS_JS } from "./nativePromptHelpers";

const getContext = createMetaEditE2EHarness("multi-value");

// Live regressions for the multi-value / array editing cluster (#94, #51, #31, #36).
//
// Since PR #168, `editMetaElement` routes every top-level YAML property to the
// NativePropertyPrompt (Obsidian's own widgets), so the cluster's invariants -
// a list stays a native list, elements with commas or command-lookalike values
// survive, a scalar stays a scalar - are asserted through that prompt, driving
// the widget's real interactions (in-place pill edit, pill add, text edit).
// The legacy GenericSuggester + GenericPrompt multi-value editor still owns
// inline Dataview fields; the last two UI tests pin that surviving surface.
// (#184 note: the prompt/suggester UI renders fine in the headless instance -
// the earlier tests were simply waiting for a modal this flow no longer opens.)
describe("MetaEdit multi-value editing", () => {
	// #94: editing one element of a YAML `tags` block list must keep it a native
	// list - not collapse it to a comma-joined string. All Single was the mode
	// the original bug reproduced under; top-level YAML must ignore it entirely.
	test("edits a YAML tags list element in the native prompt and keeps it a native list (#94)", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("tags-list.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\ntags:\n  - state/inprogress\n  - course-flash/writing-obsidian-plugins\n---\nbody\n",
		);

		const result = await driveNativeEdit(obsidian, notePath, {
			mode: "All Single",
			key: "tags",
			action: { kind: "editPill", from: "state/inprogress", to: "state/finished" },
		});

		expect(result.pills).toEqual([
			"state/finished",
			"course-flash/writing-obsidian-plugins",
		]);
		expect(result.content).toBe(
			"---\ntags:\n  - state/finished\n  - course-flash/writing-obsidian-plugins\n---\nbody\n",
		);
		expect(result.readBack).toEqual([
			"state/finished",
			"course-flash/writing-obsidian-plugins",
		]);
		expect(result.sawLegacySuggester).toBe(false);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	// #51: adding another tag grows the native list.
	test("adds a tag to a YAML tags list via the native prompt (#51)", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("tags-add.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\ntags:\n  - cookingQ\n  - chicken\n---\nbody\n",
		);

		const result = await driveNativeEdit(obsidian, notePath, {
			mode: "All Single",
			key: "tags",
			action: { kind: "addPill", value: "asia" },
		});

		expect(result.content).toBe(
			"---\ntags:\n  - cookingQ\n  - chicken\n  - asia\n---\nbody\n",
		);
		expect(result.readBack).toEqual(["cookingQ", "chicken", "asia"]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	// Editing one element of a list whose elements contain commas must NOT shred
	// the other elements - the element-preserving core invariant.
	test("preserves list elements that contain commas", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("comma-list.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\nauthors:\n  - Smith, John\n  - Doe, Jane\n---\nbody\n",
		);

		const result = await driveNativeEdit(obsidian, notePath, {
			mode: "All Single",
			key: "authors",
			type: "multitext",
			action: { kind: "editPill", from: "Doe, Jane", to: "Roe, Jane" },
		});

		expect(result.pills).toEqual(["Smith, John", "Roe, Jane"]);
		expect(result.readBack).toEqual(["Smith, John", "Roe, Jane"]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	// A list element whose value merely contains "cmd" must be editable as a
	// normal element - never mistaken for an add/insert command.
	test("edits a list element whose value contains 'cmd' without collapsing the list", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("cmd-element.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\nscripts:\n  - cmd:build\n  - test\n---\nbody\n",
		);

		const result = await driveNativeEdit(obsidian, notePath, {
			mode: "All Single",
			key: "scripts",
			type: "multitext",
			action: { kind: "editPill", from: "cmd:build", to: "cmd:rebuild" },
		});

		expect(result.readBack).toEqual(["cmd:rebuild", "test"]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("edits a literal add-command sentinel as a normal list element", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("sentinel-value.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\nscripts:\n  - cmd:addfirst\n  - keep\n---\nbody\n",
		);

		const result = await driveNativeEdit(obsidian, notePath, {
			mode: "All Single",
			key: "scripts",
			type: "multitext",
			action: { kind: "editPill", from: "cmd:addfirst", to: "changed" },
		});

		expect(result.content).toBe("---\nscripts:\n  - changed\n  - keep\n---\nbody\n");
		expect(result.readBack).toEqual(["changed", "keep"]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	// A top-level YAML scalar gets the native text editor - never the legacy
	// value suggester or the legacy prompt.
	test("keeps a YAML scalar on the native text editor in All Single mode", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("scalar.md");
		await writeLiveFile(obsidian, notePath, "---\nstatus: open\n---\nbody\n");

		const result = await driveNativeEdit(obsidian, notePath, {
			mode: "All Single",
			key: "status",
			type: "text",
			action: { kind: "setText", value: "closed" },
		});

		expect(result.sawLegacySuggester).toBe(false);
		expect(result.sawLegacyPrompt).toBe(false);
		expect(result.content).toBe("---\nstatus: closed\n---\nbody\n");
		expect(result.readBack).toBe("closed");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	// All Multi must not route a top-level YAML scalar into the legacy multi
	// editor (which would flatten it through the suggester flow).
	test("keeps a YAML scalar scalar when edited through All Multi mode", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("scalar-allmulti.md");
		await writeLiveFile(obsidian, notePath, "---\nstatus: open\n---\nbody\n");

		const result = await driveNativeEdit(obsidian, notePath, {
			mode: "All Multi",
			key: "status",
			type: "text",
			action: { kind: "setText", value: "closed" },
		});

		expect(result.sawLegacySuggester).toBe(false);
		expect(result.content).toBe("---\nstatus: closed\n---\nbody\n");
		expect(result.readBack).toBe("closed");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	// #36: the public API update with an array writes a native YAML list
	// (verifying the processFrontMatter write path stays fixed).
	test("api.update with an array writes a native YAML list (#36)", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("api-array.md");
		await writeLiveFile(obsidian, notePath, "---\nfoo: [a, b]\n---\nbody\n");

		const result = await evalJsonAsync<{ content: string; readBack: unknown }>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
				await plugin.api.update("foo", ["a", "c"], file);
				const {promise, resolve} = Promise.withResolvers();
				setTimeout(resolve, 300);
				await promise;
				return {
					content: await app.vault.read(file),
					readBack: await plugin.api.getPropertyValue("foo", file),
				};
			})()
		`,
		);

		expect(result.content).toBe("---\nfoo:\n  - a\n  - c\n---\nbody\n");
		expect(result.readBack).toEqual(["a", "c"]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	// The legacy GenericSuggester + GenericPrompt multi-value editor still owns
	// inline Dataview fields: pick an element in the suggester, retype it in the
	// prompt. This also pins that both legacy modals render headlessly (#184).
	test("edits one element of an inline Dataview field through the legacy multi-value editor", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("dataview-edit.md");
		await writeLiveFile(obsidian, notePath, "authors:: alpha, beta\nbody\n");

		const result = await driveLegacyListEdit(obsidian, notePath, {
			mode: "All Multi",
			key: "authors",
			selectText: "beta",
			enterValue: "gamma",
		});

		expect(result.content).toContain("authors:: alpha, gamma");
		expect(result.readBack).toBe("alpha, gamma");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("adds an element to an inline Dataview field via Add to end", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("dataview-add.md");
		await writeLiveFile(obsidian, notePath, "authors:: alpha, beta\nbody\n");

		const result = await driveLegacyListEdit(obsidian, notePath, {
			mode: "All Multi",
			key: "authors",
			selectText: "Add to end",
			enterValue: "gamma",
		});

		expect(result.content).toContain("authors:: alpha, beta, gamma");
		expect(result.readBack).toBe("alpha, beta, gamma");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	// The add-command discrimination (VALUE_SELECTION_PREFIX vs the add
	// sentinels) only runs in the legacy editor, so guard it where it can still
	// regress: an element whose value contains "cmd" is a normal element.
	test("edits an inline Dataview element whose value contains 'cmd' as a normal element", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("dataview-cmd.md");
		await writeLiveFile(obsidian, notePath, "scripts:: cmd:build, test\nbody\n");

		const result = await driveLegacyListEdit(obsidian, notePath, {
			mode: "All Multi",
			key: "scripts",
			selectText: "cmd:build",
			enterValue: "cmd:rebuild",
		});

		expect(result.content).toContain("scripts:: cmd:rebuild, test");
		expect(result.readBack).toBe("cmd:rebuild, test");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	// An element whose value literally equals an add-command sentinel token must
	// still resolve to a "replace" edit, never to an add command.
	test("edits an inline Dataview element equal to the add-command sentinel as a normal element", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("dataview-sentinel.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"scripts:: metaedit:multi-value:add-first, keep\nbody\n",
		);

		const result = await driveLegacyListEdit(obsidian, notePath, {
			mode: "All Multi",
			key: "scripts",
			selectText: "metaedit:multi-value:add-first",
			enterValue: "changed",
		});

		expect(result.content).toContain("scripts:: changed, keep");
		expect(result.readBack).toBe("changed, keep");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});
});

type NativeEditAction =
	| { kind: "editPill"; from: string; to: string }
	| { kind: "addPill"; value: string }
	| { kind: "setText"; value: string };

// Drive the NativePropertyPrompt for a top-level YAML property: open it via
// editMetaElement, apply one real widget interaction, Save, and report the
// resulting file plus whether any legacy modal surface appeared.
//
// `type` (omitted for reserved keys like `tags`, whose widget is fixed) pins
// the key's vault-wide property type (Obsidian's "Property type" menu) so the
// prompt mounts the intended widget in ANY vault: without it the widget
// follows vault-wide state (e.g. a dev vault where `authors` is typed text
// from unrelated notes would mount the text widget).
async function driveNativeEdit(
	obsidian: Parameters<typeof evalJsonAsync>[0],
	notePath: string,
	opts: { mode: string; key: string; type?: string; action: NativeEditAction },
): Promise<{
	content: string;
	readBack: unknown;
	pills: string[] | null;
	sawLegacySuggester: boolean;
	sawLegacyPrompt: boolean;
}> {
	return await evalJsonAsync(
		obsidian,
		`
		(async () => {
			${NATIVE_PROMPT_HELPERS_JS}
			const plugin = app.plugins.plugins.${PLUGIN_ID};
			const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
			const action = ${JSON.stringify(opts.action)};
			const originalMode = plugin.settings.EditMode.mode;
			plugin.settings.EditMode.mode = ${JSON.stringify(opts.mode)};
			if (${JSON.stringify(opts.type ?? null)}) {
				app.metadataTypeManager.setType(${JSON.stringify(opts.key)}, ${JSON.stringify(opts.type)});
				await sleep(150);
			}
			try {
				const {promise, host} = await openNative(file, ${JSON.stringify(opts.key)});
				const sawLegacySuggester = Boolean(document.querySelector(".suggestion-item"));
				const sawLegacyPrompt = Boolean(document.querySelector(".metaEditPromptInput"));
				let pills = null;
				if (action.kind === "editPill") pills = await editPillByText(host, action.from, action.to);
				else if (action.kind === "addPill") pills = await addPillInHost(host, action.value);
				else setContenteditable(host, action.value);
				await saveOpenModal(promise);
				return {
					content: await app.vault.read(file),
					readBack: await plugin.api.getPropertyValue(${JSON.stringify(opts.key)}, file),
					pills,
					sawLegacySuggester,
					sawLegacyPrompt,
				};
			} finally {
				plugin.settings.EditMode.mode = originalMode;
			}
		})()
	`,
	);
}

// Drive the legacy multi-value flow (inline Dataview fields): editMetaElement
// opens the GenericSuggester, click a suggestion by its text, then type a
// value into the GenericPrompt and submit.
async function driveLegacyListEdit(
	obsidian: Parameters<typeof evalJsonAsync>[0],
	notePath: string,
	opts: { mode: string; key: string; selectText: string; enterValue: string },
): Promise<{ content: string; readBack: unknown }> {
	return await evalJsonAsync(
		obsidian,
		`
		(async () => {
			${NATIVE_PROMPT_HELPERS_JS}
			const plugin = app.plugins.plugins.${PLUGIN_ID};
			const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
			const originalMode = plugin.settings.EditMode.mode;
			plugin.settings.EditMode.mode = ${JSON.stringify(opts.mode)};
			try {
				const props = await plugin.controller.getPropertiesInFile(file);
				const property = props.find((p) => p.key === ${JSON.stringify(opts.key)});
				if (!property) throw new Error("Property not parsed: " + ${JSON.stringify(opts.key)});
				const editPromise = plugin.controller.editMetaElement(property, props, file);

				const item = await waitFor(
					".suggestion-item",
					(el) => el.textContent?.trim() === ${JSON.stringify(opts.selectText)},
				);
				item.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
				item.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
				item.dispatchEvent(new MouseEvent("click", { bubbles: true }));

				const input = await waitFor(".metaEditPromptInput");
				input.value = ${JSON.stringify(opts.enterValue)};
				input.dispatchEvent(new Event("input", { bubbles: true }));
				input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

				await editPromise;
				await sleep(300);
				return {
					content: await app.vault.read(file),
					readBack: await plugin.api.getPropertyValue(${JSON.stringify(opts.key)}, file),
				};
			} finally {
				plugin.settings.EditMode.mode = originalMode;
			}
		})()
	`,
	);
}
