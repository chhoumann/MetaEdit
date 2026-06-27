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

		const result = await driveListEdit(obsidian, notePath, {
			mode: "All Single",
			key: "authors",
			selectText: "Doe, Jane",
			enterValue: "Roe, Jane",
		});

		expect(result.readBack).toEqual(["Smith, John", "Roe, Jane"]);
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

		const result = await driveListEdit(obsidian, notePath, {
			mode: "All Single",
			key: "scripts",
			selectText: "cmd:build",
			enterValue: "cmd:rebuild",
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

		const result = await driveListEdit(obsidian, notePath, {
			mode: "All Single",
			key: "scripts",
			selectText: "cmd:addfirst",
			enterValue: "changed",
		});

		expect(result.content).toBe("---\nscripts:\n  - changed\n  - keep\n---\nbody\n");
		expect(result.readBack).toEqual(["changed", "keep"]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});
});

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
