import { describe, expect, test } from "vitest";
import { createMetaEditE2EHarness, evalJsonAsync, PLUGIN_ID, WAIT_OPTS } from "./harness";

const getContext = createMetaEditE2EHarness("audit-gaps");

describe("MetaEdit audit gap coverage", () => {
	test("AUTO-01: with Auto Properties disabled, autoprop() returns null and opens no modal", async () => {
		const { obsidian } = getContext();
		const result = await evalJsonAsync<{ resultWhenDisabled: unknown; modalOpened: boolean }>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const prevEnabled = plugin.settings.AutoProperties.enabled;
				const prevProps = plugin.settings.AutoProperties.properties;
				plugin.settings.AutoProperties.enabled = false;
				plugin.settings.AutoProperties.properties = [{ name: "mood", choices: ["good", "bad"] }];
				try {
					const before = document.querySelectorAll(".modal").length;
					const r = await plugin.api.autoprop("mood");
					await new Promise(res => setTimeout(res, 150));
					const after = document.querySelectorAll(".modal").length;
					return { resultWhenDisabled: r, modalOpened: after > before };
				} finally {
					plugin.settings.AutoProperties.enabled = prevEnabled;
					plugin.settings.AutoProperties.properties = prevProps;
				}
			})()
		`,
		);
		expect(result.resultWhenDisabled).toBeNull();
		expect(result.modalOpened).toBe(false);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("RUN-08: duplicate body #tags are disambiguated with line and ordinal in the suggester", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("dup-tags.md");
		const labels = await evalJsonAsync<string[]>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const path = ${JSON.stringify(notePath)};
				let f = app.vault.getAbstractFileByPath(path);
				const body = "First #dup here.\\nSecond #dup there.\\n";
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				// Wait for tag spans to validate against disk.
				for (let i = 0; i < 60; i++) {
					await new Promise(r => setTimeout(r, 50));
					const props = await plugin.controller.getPropertiesInFile(f);
					const tags = props.filter(p => p.type === 2 && p.key === "#dup");
					if (tags.length === 2 && tags.every(t => t.position && body.slice(t.position.start, t.position.end) === t.key)) break;
				}
				// Open the real suggester and read the disambiguated row labels from the DOM.
				await plugin.runMetaEditForFile(f);
				const sleep = (ms) => new Promise(r => setTimeout(r, ms));
				let items = [];
				for (let i = 0; i < 60; i++) {
					await sleep(80);
					items = Array.from(document.querySelectorAll(".suggestion-item"));
					if (items.length) break;
				}
				const texts = items.map(el => ((el.querySelector(".suggestion-item-text") || el).textContent || "").trim());
				app.workspace.activeModal?.close?.();
				for (const el of Array.from(document.querySelectorAll(".suggestion-container, .suggestion-item"))) el.remove();
				return texts.filter(t => t.startsWith("#dup"));
			})()
		`,
		);
		// Each occurrence is labelled with its line and ordinal (1/2 and 2/2).
		expect(labels.length).toBe(2);
		expect(labels.some((t) => /1\/2/.test(t))).toBe(true);
		expect(labels.some((t) => /2\/2/.test(t))).toBe(true);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("PROG-04: Excalidraw files are skipped by the on-modify automators", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("drawing.excalidraw.md");
		// Drive the automator with dev.eval (toggleAutomators may log, which would
		// break evalJsonAsync), then read the file with a clean eval.
		await obsidian.dev.eval(`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const path = ${JSON.stringify(notePath)};
				let f = app.vault.getAbstractFileByPath(path);
				const body = "---\\nexcalidraw-plugin: parsed\\ntaskCount: 0\\n---\\n# Tasks\\n- [ ] one\\n- [x] two\\n";
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				await new Promise(r => setTimeout(r, 400));
				plugin.settings.ProgressProperties.enabled = true;
				plugin.settings.ProgressProperties.properties = [{ name: "taskCount", type: "Total Tasks" }];
				plugin.toggleAutomators();
				await app.vault.modify(f, body + "more body\\n");
				await new Promise(r => setTimeout(r, 1400));
				plugin.settings.ProgressProperties.enabled = false;
				plugin.settings.ProgressProperties.properties = [];
				plugin.toggleAutomators();
			})()
		`);
		// Read the result through the sandbox API (no eval-string construction).
		const content = await sandbox.waitForContent(
			"drawing.excalidraw.md",
			(v) => v.includes("taskCount"),
			WAIT_OPTS,
		);
		// taskCount stays 0: the Excalidraw frontmatter key makes the automator skip it.
		expect(content).toContain("taskCount: 0");
		expect(content).not.toMatch(/taskCount: "?2"?/);
	});

	test("YAML-06: updateMultipleInFile writes nested YAML paths without creating new keys", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("multi-nested.md");
		const result = await evalJsonAsync<{ cache: Record<string, unknown> }>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const path = ${JSON.stringify(notePath)};
				let f = app.vault.getAbstractFileByPath(path);
				const body = "---\\nmeta:\\n  a: 1\\n  b: 2\\n---\\nbody\\n";
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				await new Promise(r => setTimeout(r, 300));
				// Build nested-path Property objects (existing leaves) and write in one batch.
				const props = [
					{ key: "meta.a", content: "10", type: 0, path: ["meta", "a"], rootKey: "meta", isNested: true },
					{ key: "meta.b", content: "20", type: 0, path: ["meta", "b"], rootKey: "meta", isNested: true },
				];
				await plugin.controller.updateMultipleInFile(props, f);
				await new Promise(r => setTimeout(r, 300));
				return { cache: app.metadataCache.getFileCache(f)?.frontmatter ?? {} };
			})()
		`,
		);
		// Both existing nested leaves are updated in a single batched frontmatter write
		// (values written verbatim as the strings provided).
		expect(result.cache.meta).toEqual({ a: "10", b: "20" });
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("PROG-03: only [x]/[X] tasks count as complete; custom markers count as incomplete", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("task-counts.md");
		const result = await evalJsonAsync<{ done: unknown; todo: unknown; total: unknown }>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const path = ${JSON.stringify(notePath)};
				let f = app.vault.getAbstractFileByPath(path);
				const body = "---\\ndone: 0\\ntodo: 0\\ntotal: 0\\n---\\n- [ ] a\\n- [x] b\\n- [/] c\\n- [-] d\\n- [X] e\\n";
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				// Wait for the listItems/tasks cache to populate.
				for (let i = 0; i < 60; i++) {
					await new Promise(r => setTimeout(r, 50));
					const li = app.metadataCache.getFileCache(f)?.listItems?.filter(x => x.task);
					if (li && li.length === 5) break;
				}
				const prevEnabled = plugin.settings.ProgressProperties.enabled;
				plugin.settings.ProgressProperties.enabled = true;
				plugin.settings.ProgressProperties.properties = [
					{ name: "done", type: "Completed Tasks" },
					{ name: "todo", type: "Incomplete Tasks" },
					{ name: "total", type: "Total Tasks" },
				];
				try {
					const props = await plugin.controller.getPropertiesInFile(f);
					await plugin.controller.handleProgressProps(props, f);
					await new Promise(r => setTimeout(r, 300));
					const fm = app.metadataCache.getFileCache(f)?.frontmatter ?? {};
					return { done: fm.done, todo: fm.todo, total: fm.total };
				} finally {
					plugin.settings.ProgressProperties.enabled = prevEnabled;
					plugin.settings.ProgressProperties.properties = [];
				}
			})()
		`,
		);
		// [x] b and [X] e are complete (2); [ ] a, [/] c, [-] d are incomplete (3); total 5.
		expect(String(result.done)).toBe("2");
		expect(String(result.todo)).toBe("3");
		expect(String(result.total)).toBe("5");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("BULK-05: merge policy appends uniquely into a list and is idempotent", async () => {
		const { obsidian, sandbox } = getContext();
		const result = await evalJsonAsync<{ first: unknown; second: unknown }>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const dir = ${JSON.stringify(sandbox.path("bulk-merge"))};
				const path = dir + "/note.md";
				if (!app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir).catch(() => {});
				let f = app.vault.getAbstractFileByPath(path);
				const body = "---\\ntags: [a, b]\\n---\\nbody\\n";
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				await new Promise(r => setTimeout(r, 300));
				const files = [f];
				// merge "b" (dup) and "c" (new) into the existing list.
				await plugin.bulkEditor.apply(files, "tags", "b", "merge");
				await plugin.bulkEditor.apply(files, "tags", "c", "merge");
				await new Promise(r => setTimeout(r, 200));
				const first = app.metadataCache.getFileCache(f)?.frontmatter?.tags;
				// Re-run "c": should not duplicate (idempotent).
				await plugin.bulkEditor.apply(files, "tags", "c", "merge");
				await new Promise(r => setTimeout(r, 200));
				const second = app.metadataCache.getFileCache(f)?.frontmatter?.tags;
				return { first, second };
			})()
		`,
		);
		expect(result.first).toEqual(["a", "b", "c"]);
		expect(result.second).toEqual(["a", "b", "c"]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});
});
