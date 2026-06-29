import { describe, expect, test } from "vitest";
import { createMetaEditE2EHarness, evalJsonAsync, PLUGIN_ID } from "./harness";

const getContext = createMetaEditE2EHarness("multi-value");

// Live regressions for the multi-value / array editing cluster (#94, #51, #31, #36).
// These drive the real Obsidian write path (processFrontMatter / stringifyYaml) and,
// for the command flow, the real suggester + prompt UI.
describe("MetaEdit multi-value editing", () => {
	// #94: in the DEFAULT All Single mode, editing a YAML `tags` block list must keep
	// it a native list - not collapse it to a comma-joined string.
	test("edits a YAML tags list in All Single mode and keeps it a native list (#94)", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("tags-list.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\ntags:\n  - state/inprogress\n  - course-flash/writing-obsidian-plugins\n---\nbody\n",
		);

		const result = await driveListEdit(obsidian, notePath, {
			mode: "All Single",
			key: "tags",
			selectText: "state/inprogress",
			enterValue: "state/finished",
		});

		expect(result.content).toBe(
			"---\ntags:\n  - state/finished\n  - course-flash/writing-obsidian-plugins\n---\nbody\n",
		);
		expect(result.readBack).toEqual([
			"state/finished",
			"course-flash/writing-obsidian-plugins",
		]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	// #51: adding another tag to a `tags` list grows the native list.
	test("adds a tag to a YAML tags list via Add to end (#51)", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("tags-add.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\ntags:\n  - cookingQ\n  - chicken\n---\nbody\n",
		);

		const result = await driveListEdit(obsidian, notePath, {
			mode: "All Single",
			key: "tags",
			selectText: "Add to end",
			enterValue: "asia",
		});

		expect(result.content).toBe(
			"---\ntags:\n  - cookingQ\n  - chicken\n  - asia\n---\nbody\n",
		);
		expect(result.readBack).toEqual(["cookingQ", "chicken", "asia"]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	// Editing one element of a list whose elements contain commas must NOT shred the
	// other elements - the element-preserving core fix.
	test("preserves list elements that contain commas", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("comma-list.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\nauthors:\n  - Smith, John\n  - Doe, Jane\n---\nbody\n",
		);

		const result = await driveTypedListEdit(obsidian, notePath, {
			key: "authors",
			actions: [{ kind: "set", index: 1, value: "Roe, Jane" }],
		});

		expect(result.readBack).toEqual(["Smith, John", "Roe, Jane"]);
		expect(result.dom.hasPillEditor).toBe(true);
		expect(result.dom.hasGenericPromptInput).toBe(false);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	// A list element whose value merely contains "cmd" must be editable as a normal
	// element - it must not be mistaken for an add/insert command and collapse the list.
	test("edits a list element whose value contains 'cmd' without collapsing the list", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("cmd-element.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\nscripts:\n  - cmd:build\n  - test\n---\nbody\n",
		);

		const result = await driveTypedListEdit(obsidian, notePath, {
			key: "scripts",
			actions: [{ kind: "set", index: 0, value: "cmd:rebuild" }],
		});

		expect(result.readBack).toEqual(["cmd:rebuild", "test"]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	// A YAML scalar in All Single mode still uses the single-line editor (no suggester),
	// so the routing change does not regress ordinary scalar edits.
	test("keeps a YAML scalar on the single-line editor in All Single mode", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("scalar.md");
		await writeLiveFile(obsidian, notePath, "---\nstatus: open\n---\nbody\n");

		const result = await evalJsonAsync<{ content: string; readBack: unknown; suggesterOpened: boolean }>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
				const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
				const waitFor = async (selector) => {
					const start = Date.now();
					while (Date.now() - start < 5000) {
						const el = document.querySelector(selector);
						if (el) return el;
						await sleep(80);
					}
					throw new Error("Timed out waiting for " + selector);
				};
				const originalMode = plugin.settings.EditMode.mode;
				plugin.settings.EditMode.mode = "All Single";
				try {
					const props = await plugin.controller.getPropertiesInFile(file);
					const property = props.find((p) => p.key === "status");
					const editPromise = plugin.controller.editMetaElement(property, props, file);
					const input = await waitFor(".metaEditPromptInput");
					const suggesterOpened = Boolean(document.querySelector(".suggestion-item"));
					input.value = "closed";
					input.dispatchEvent(new Event("input", { bubbles: true }));
					input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
					await editPromise;
					await sleep(300);
					return {
						content: await app.vault.read(file),
						readBack: await plugin.api.getPropertyValue("status", file),
						suggesterOpened,
					};
				} finally {
					plugin.settings.EditMode.mode = originalMode;
				}
			})()
		`,
		);

		expect(result.suggesterOpened).toBe(false);
		expect(result.content).toBe("---\nstatus: closed\n---\nbody\n");
		expect(result.readBack).toBe("closed");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("keeps a YAML scalar scalar when edited through All Multi mode", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("scalar-allmulti.md");
		await writeLiveFile(obsidian, notePath, "---\nstatus: open\n---\nbody\n");

		const result = await driveListEdit(obsidian, notePath, {
			mode: "All Multi",
			key: "status",
			selectText: "open",
			enterValue: "closed",
		});

		expect(result.content).toBe("---\nstatus: closed\n---\nbody\n");
		expect(result.readBack).toBe("closed");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	// #36: the public API update with an array writes a native YAML list (verifying the
	// processFrontMatter write path that already fixed this stays fixed).
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
				await new Promise((r) => setTimeout(r, 300));
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

	test("edits a literal add-command sentinel as a normal list element", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("sentinel-value.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\nscripts:\n  - cmd:addfirst\n  - keep\n---\nbody\n",
		);

		const result = await driveTypedListEdit(obsidian, notePath, {
			key: "scripts",
			actions: [{ kind: "set", index: 0, value: "changed" }],
		});

		expect(result.content).toBe("---\nscripts:\n  - changed\n  - keep\n---\nbody\n");
		expect(result.readBack).toEqual(["changed", "keep"]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("keeps aliases on the legacy array editor and preserves commas", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("aliases-list.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\naliases:\n  - Alias, One\n  - Alias Two\n---\nbody\n",
		);

		const result = await driveListEdit(obsidian, notePath, {
			mode: "All Single",
			key: "aliases",
			selectText: "Alias, One",
			enterValue: "Alias, Changed",
		});

		expect(result.readBack).toEqual(["Alias, Changed", "Alias Two"]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("adds a wikilink-with-comma as one typed-list item", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("typed-list-add-wikilink.md");
		await writeLiveFile(obsidian, notePath, "---\ntopics:\n  - alpha\n---\nbody\n");

		const result = await driveTypedListEdit(obsidian, notePath, {
			key: "topics",
			actions: [{ kind: "typeAdd", value: "[[A, B]]" }],
		});

		expect(result.readBack).toEqual(["alpha", "[[A, B]]"]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("preserves duplicate typed-list values and order", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("typed-list-duplicates.md");
		await writeLiveFile(obsidian, notePath, "---\nitems:\n  - dup\n  - dup\n---\nbody\n");

		const result = await driveTypedListEdit(obsidian, notePath, {
			key: "items",
			actions: [{ kind: "add", value: "dup" }],
		});

		expect(result.readBack).toEqual(["dup", "dup", "dup"]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("preserves untouched mixed typed-list values", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("typed-list-mixed.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\nmixed:\n  - 1\n  - true\n  - null\n  - old\n---\nbody\n",
		);

		const result = await driveTypedListEdit(obsidian, notePath, {
			key: "mixed",
			actions: [{ kind: "set", index: 3, value: "new" }],
		});

		expect(result.readBack).toEqual([1, true, null, "new"]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("prepends and reorders mixed typed-list items without stringifying untouched values", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("typed-list-reorder-mixed.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\nmixed:\n  - 1\n  - true\n  - null\n  - x\n---\nbody\n",
		);

		const result = await driveTypedListEdit(obsidian, notePath, {
			key: "mixed",
			actions: [
				{ kind: "prepend", value: "first" },
				{ direction: "up", index: 4, kind: "move" },
				{ direction: "up", index: 3, kind: "move" },
				{ direction: "up", index: 2, kind: "move" },
			],
		});

		expect(result.readBack).toEqual(["first", "x", 1, true, null]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("saves a typed list containing an untouched YAML date", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("typed-list-date.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\ndates:\n  - 2026-01-02\n  - old\n---\nbody\n",
		);

		const result = await driveTypedListEdit(obsidian, notePath, {
			key: "dates",
			actions: [{ kind: "set", index: 1, value: "new" }],
		});

		expect(result.content).toContain("new");
		expect(result.readBack).toEqual(["2026-01-02", "new"]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("writes an empty ordinary typed list as an empty YAML array", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("typed-list-empty.md");
		await writeLiveFile(obsidian, notePath, "---\nitems:\n  - alpha\n  - beta\n---\nbody\n");

		const result = await driveTypedListEdit(obsidian, notePath, {
			key: "items",
			actions: [
				{ kind: "remove", index: 1 },
				{ kind: "remove", index: 0 },
			],
		});

		expect(result.content).toBe("---\nitems: []\n---\nbody\n");
		expect(result.readBack).toEqual([]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("refuses a stale typed-list write when frontmatter changes while the modal is open", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("typed-list-stale.md");
		await writeLiveFile(obsidian, notePath, "---\nitems:\n  - base\n---\nbody\n");

		const result = await evalJsonAsync<{ content: string; readBack: unknown; notices: string[] }>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
				const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
				const waitFor = async (selector, predicate = () => true) => {
					const start = Date.now();
					while (Date.now() - start < 5000) {
						const el = Array.from(document.querySelectorAll(selector)).find(predicate);
						if (el) return el;
						await sleep(80);
					}
					throw new Error("Timed out waiting for " + selector);
				};

				const props = await plugin.controller.getPropertiesInFile(file);
				const property = props.find((p) => p.key === "items");
				const editPromise = plugin.controller.editMetaElement(property, props, file);
				const addInput = await waitFor(".metaedit-typed-list-add-input");
				addInput.value = "local";
				addInput.dispatchEvent(new Event("input", { bubbles: true }));
				addInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

				await app.fileManager.processFrontMatter(file, (frontmatter) => {
					frontmatter.items = ["external"];
				});
				await sleep(300);

				const save = await waitFor(".metaedit-typed-list-save");
				save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
				await editPromise;
				await sleep(300);

				return {
					content: await app.vault.read(file),
					readBack: await plugin.api.getPropertyValue("items", file),
					notices: Array.from(document.querySelectorAll(".notice")).map((notice) => notice.textContent?.trim() ?? ""),
				};
			})()
		`,
		);

		expect(result.content).toBe("---\nitems:\n  - external\n---\nbody\n");
		expect(result.readBack).toEqual(["external"]);
		expect(result.notices.some(text => text.includes("current value changed before update"))).toBe(true);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});
});

type TypedListAction =
	| { kind: "add"; value: string }
	| { kind: "remove"; index: number }
	| { kind: "set"; index: number; value: string }
	| { kind: "typeAdd"; value: string }
	| { kind: "prepend"; value: string }
	| { direction: "down" | "up"; index: number; kind: "move" };

async function driveTypedListEdit(
	obsidian: Parameters<typeof evalJsonAsync>[0],
	notePath: string,
	opts: { key: string; actions: TypedListAction[] },
): Promise<{
	content: string;
	dom: { hasGenericPromptInput: boolean; hasPillEditor: boolean; pillValues: string[] };
	readBack: unknown;
}> {
	return await evalJsonAsync(
		obsidian,
		`
		(async () => {
			const plugin = app.plugins.plugins.${PLUGIN_ID};
			const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
			const actions = ${JSON.stringify(opts.actions)};
			const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
			const waitFor = async (selector, predicate = () => true) => {
				const start = Date.now();
				while (Date.now() - start < 5000) {
					const el = Array.from(document.querySelectorAll(selector)).find(predicate);
					if (el) return el;
					await sleep(80);
				}
				throw new Error("Timed out waiting for " + selector);
			};
			const setInputValue = (input, value) => {
				input.value = value;
				input.dispatchEvent(new Event("input", { bubbles: true }));
			};

			const props = await plugin.controller.getPropertiesInFile(file);
			const property = props.find((p) => p.key === ${JSON.stringify(opts.key)});
			if (!property) throw new Error("Property not parsed: " + ${JSON.stringify(opts.key)});
			const editPromise = plugin.controller.editMetaElement(property, props, file);
			await waitFor(".metaedit-typed-list-modal .multi-select-container");
			const dom = {
				hasGenericPromptInput: Boolean(document.querySelector(".metaEditPromptInput")),
				hasPillEditor: Boolean(document.querySelector(".metaedit-typed-list-modal .multi-select-container")),
				pillValues: Array.from(document.querySelectorAll(".metaedit-typed-list-pill-input")).map((input) => input.value),
			};

			for (const action of actions) {
				if (action.kind === "set") {
					const input = document.querySelectorAll(".metaedit-typed-list-pill-input")[action.index];
					if (!input) throw new Error("Missing pill input at " + action.index);
					setInputValue(input, action.value);
				}
				if (action.kind === "add") {
					const input = await waitFor(".metaedit-typed-list-add-input");
					setInputValue(input, action.value);
					input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
					await sleep(100);
				}
				if (action.kind === "prepend") {
					const input = await waitFor(".metaedit-typed-list-add-input");
					setInputValue(input, action.value);
					const button = await waitFor(".metaedit-typed-list-add-beginning");
					button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
					await sleep(100);
				}
				if (action.kind === "typeAdd") {
					const input = await waitFor(".metaedit-typed-list-add-input");
					setInputValue(input, action.value);
					await sleep(100);
				}
				if (action.kind === "move") {
					const selector = action.direction === "up"
						? ".metaedit-typed-list-move-up"
						: ".metaedit-typed-list-move-down";
					const button = document.querySelectorAll(selector)[action.index];
					if (!button) throw new Error("Missing move button at " + action.index);
					button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
					await sleep(100);
				}
				if (action.kind === "remove") {
					const button = document.querySelectorAll(".metaedit-typed-list-remove")[action.index];
					if (!button) throw new Error("Missing remove button at " + action.index);
					button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
					await sleep(100);
				}
			}

			const save = await waitFor(".metaedit-typed-list-save");
			save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await editPromise;
			await sleep(300);

			return {
				content: await app.vault.read(file),
				dom,
				readBack: await plugin.api.getPropertyValue(${JSON.stringify(opts.key)}, file),
			};
		})()
	`,
	);
}

// Drive the command edit flow for a list property: open editMetaElement, click a
// suggestion by its text, then type a value into the prompt and submit.
async function driveListEdit(
	obsidian: Parameters<typeof evalJsonAsync>[0],
	notePath: string,
	opts: { mode: string; key: string; selectText: string; enterValue: string },
): Promise<{ content: string; readBack: unknown }> {
	return await evalJsonAsync(
		obsidian,
		`
		(async () => {
			const plugin = app.plugins.plugins.${PLUGIN_ID};
			const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
			const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
			const waitFor = async (selector, predicate = () => true) => {
				const start = Date.now();
				while (Date.now() - start < 5000) {
					const el = Array.from(document.querySelectorAll(selector)).find(predicate);
					if (el) return el;
					await sleep(80);
				}
				throw new Error("Timed out waiting for " + selector);
			};
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

async function writeLiveFile(
	obsidian: Parameters<typeof evalJsonAsync>[0],
	path: string,
	content: string,
): Promise<void> {
	await evalJsonAsync<void>(
		obsidian,
		`
		(async () => {
			const path = ${JSON.stringify(path)};
			const content = ${JSON.stringify(content)};
			const parts = path.split("/");
			let current = "";
			for (const part of parts.slice(0, -1)) {
				current = current ? current + "/" + part : part;
				if (!app.vault.getAbstractFileByPath(current)) {
					try {
						await app.vault.createFolder(current);
					} catch (error) {
						if (!String(error.message).includes("Folder already exists")) throw error;
					}
				}
			}
			const existing = app.vault.getAbstractFileByPath(path);
			if (existing) await app.vault.delete(existing);
			await app.vault.create(path, content);
			// Wait for the metadata cache to populate the new file's frontmatter.
			for (let i = 0; i < 40; i++) {
				const cache = app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(path));
				if (cache && cache.frontmatter) break;
				await new Promise((r) => setTimeout(r, 50));
			}
		})()
	`,
	);
}
