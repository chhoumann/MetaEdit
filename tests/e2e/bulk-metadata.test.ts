import { describe, expect, test } from "vitest";
import { CLOSE_ALL_MODALS_JS, createMetaEditE2EHarness, evalJsonAsync, PLUGIN_ID, WAIT_OPTS } from "./harness";

const getContext = createMetaEditE2EHarness("bulk-metadata");

type BulkSummary = {
	total: number;
	added: number;
	merged: number;
	overwritten: number;
	skipped: number;
	unchanged: number;
	failed: number;
};

describe("MetaEdit bulk metadata edit", () => {
	test("adds a property to every note in a folder and is idempotent on re-run", async () => {
		const { obsidian, sandbox } = getContext();
		const dir = "skip-folder";
		await seed(obsidian, sandbox.path(dir), {
			"a.md": "# A\n\nbody\n",
			"b.md": "---\nstatus: draft\n---\n\nbody\n",
			"sub/c.md": "no frontmatter\n",
		});

		const first = await applyBulk(obsidian, sandbox.path(dir), "project", "Alpha", "skip");
		expect(first.added).toBe(3);
		expect(first.total).toBe(3);

		for (const rel of [`${dir}/a.md`, `${dir}/b.md`, `${dir}/sub/c.md`]) {
			expect(await sandbox.waitForContent(rel, (c) => c.includes("project: Alpha"), WAIT_OPTS)).toContain(
				"project: Alpha",
			);
		}
		// The pre-existing status on b.md must survive an additive bulk add.
		expect(await sandbox.read(`${dir}/b.md`)).toContain("status: draft");

		// Re-running with a different value must change nothing: skip is idempotent.
		const second = await applyBulk(obsidian, sandbox.path(dir), "project", "Beta", "skip");
		expect(second.skipped).toBe(3);
		expect(second.added).toBe(0);

		const a = await sandbox.read(`${dir}/a.md`);
		expect(a).toContain("project: Alpha");
		expect(a).not.toContain("Beta");
		expect((a.match(/project:/g) ?? []).length).toBe(1);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("shows conflict options from live frontmatter when the metadata cache is stale", async () => {
		const { obsidian, sandbox } = getContext();
		const dir = "stale-cache-folder";
		await seed(obsidian, sandbox.path(dir), {
			"existing.md": "---\nstatus: old\n---\n\nbody\n",
		});

		const result = await evalJsonAsync<{ content: string; conflictTitle: string | null }>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
				const waitFor = async (selector, predicate = () => true) => {
					const start = Date.now();
					while (Date.now() - start < 5000) {
						const found = Array.from(document.querySelectorAll(selector)).find(predicate);
						if (found) return found;
						await sleep(80);
					}
					throw new Error("Timed out waiting for " + selector);
				};

				const path = ${JSON.stringify(sandbox.path(`${dir}/existing.md`))};
				const file = app.vault.getAbstractFileByPath(path);
				const originalGetFileCache = app.metadataCache.getFileCache.bind(app.metadataCache);
				app.metadataCache.getFileCache = (candidate) =>
					candidate?.path === path ? {} : originalGetFileCache(candidate);

				try {
					const runPromise = plugin.bulkEditor.run([file], "stale cache").then(() => "resolved");

					const keyInput = await waitFor(".metaEditPromptInput");
					keyInput.value = "status";
					keyInput.dispatchEvent(new Event("input", { bubbles: true }));
					keyInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

					const valueInput = await waitFor(".metaEditPromptInput");
					valueInput.value = "new";
					valueInput.dispatchEvent(new Event("input", { bubbles: true }));
					valueInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

					const conflictTitle = (await waitFor(".metaedit-bulk-modal h3")).textContent;
					const overwrite = await waitFor(
						".metaedit-bulk-option",
						(el) => el.textContent.includes("Overwrite existing values"),
					);
					overwrite.dispatchEvent(new MouseEvent("click", { bubbles: true }));

					const confirm = await waitFor(
						".metaedit-bulk-option",
						(el) => el.textContent.trim() === "Overwrite",
					);
					confirm.dispatchEvent(new MouseEvent("click", { bubbles: true }));

					await runPromise;
					await sleep(400);
					return { content: await app.vault.read(file), conflictTitle };
				} finally {
					app.metadataCache.getFileCache = originalGetFileCache;
					${CLOSE_ALL_MODALS_JS}
					await closeAllModals();
				}
			})()
		`,
		);

		expect(result.conflictTitle).toBe('1 note already has "status"');
		expect(result.content).toContain("status: new");
		expect(result.content).not.toContain("status: old");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("does not abort conflict preflight on malformed frontmatter", async () => {
		const { obsidian, sandbox } = getContext();
		const dir = "malformed-frontmatter-folder";
		await seed(obsidian, sandbox.path(dir), {
			"bad.md": "---\nstatus: : :\n---\n\nbody\n",
		});

		const conflicts = await evalJsonAsync<number>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const file = app.vault.getAbstractFileByPath(${JSON.stringify(sandbox.path(`${dir}/bad.md`))});
				return await plugin.bulkEditor.countExisting([file], "status");
			})()
		`,
		);

		expect(conflicts).toBe(0);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("merge appends into a list without duplicating and converges on re-run", async () => {
		const { obsidian, sandbox } = getContext();
		const dir = "merge-folder";
		await seed(obsidian, sandbox.path(dir), {
			"has-list.md": "---\ntags:\n  - x\n  - y\n---\n\nbody\n",
			"no-fm.md": "# fresh\n",
		});

		const first = await applyBulk(obsidian, sandbox.path(dir), "tags", "z", "merge");
		expect(first.merged).toBe(1); // has-list.md
		expect(first.added).toBe(1); // no-fm.md seeded as a list

		const list = await sandbox.waitForContent(
			`${dir}/has-list.md`,
			(c) => c.includes("- z"),
			WAIT_OPTS,
		);
		expect(list).toContain("- x");
		expect(list).toContain("- y");
		expect(list).toContain("- z");

		// no-fm.md should be list-shaped, matching the merged note (not a scalar).
		const fresh = await sandbox.read(`${dir}/no-fm.md`);
		expect(fresh).toMatch(/tags:\s*\n\s*- z/);

		// Re-merging the same value is a no-op and never duplicates.
		const second = await applyBulk(obsidian, sandbox.path(dir), "tags", "z", "merge");
		expect(second.unchanged).toBe(2);
		expect(second.merged).toBe(0);
		const after = await sandbox.read(`${dir}/has-list.md`);
		expect((after.match(/- z/g) ?? []).length).toBe(1);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("overwrite replaces existing values and is idempotent", async () => {
		const { obsidian, sandbox } = getContext();
		const dir = "overwrite-folder";
		await seed(obsidian, sandbox.path(dir), {
			"one.md": "---\nstatus: draft\n---\n\nbody\n",
			"two.md": "---\nstatus: review\n---\n\nbody\n",
		});

		const first = await applyBulk(obsidian, sandbox.path(dir), "status", "final", "overwrite");
		expect(first.overwritten).toBe(2);

		for (const rel of [`${dir}/one.md`, `${dir}/two.md`]) {
			const content = await sandbox.waitForContent(rel, (c) => c.includes("status: final"), WAIT_OPTS);
			expect(content).toContain("status: final");
			expect(content).not.toMatch(/status: (draft|review)/);
		}

		const second = await applyBulk(obsidian, sandbox.path(dir), "status", "final", "overwrite");
		expect(second.unchanged).toBe(2);
		expect(second.overwritten).toBe(0);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("collects a multi-selection without duplicates and wires the files-menu item", async () => {
		const { obsidian, sandbox } = getContext();
		const dir = "selection-folder";
		await seed(obsidian, sandbox.path(dir), {
			"a.md": "# A\n",
			"b.md": "# B\n",
			"notes.txt": "not markdown\n",
		});

		const result = await evalJsonAsync<{
			collected: string[];
			menuTitles: string[];
			ignoredSource: number;
		}>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const dir = ${JSON.stringify(sandbox.path(dir))};
				const folder = app.vault.getAbstractFileByPath(dir);
				const aFile = app.vault.getAbstractFileByPath(dir + "/a.md");

				// Folder + a file already inside it: the file must not be collected twice.
				const collected = plugin.bulkEditor
					.collectFromSelection([folder, aFile])
					.map((f) => f.path)
					.sort();

				// Drive the real registered handler directly (not workspace.trigger,
				// which would fan out to unrelated core listeners with a fake menu).
				const makeMenu = (sink) => ({
					addItem(cb) {
						const item = {
							setIcon: () => item,
							setTitle: (t) => { item._t = t; return item; },
							onClick: () => item,
						};
						cb(item);
						sink.push(item._t);
						return this;
					},
				});

				const menuTitles = [];
				plugin.linkMenu.onFilesMenuOpenCallback(
					makeMenu(menuTitles),
					[aFile, app.vault.getAbstractFileByPath(dir + "/b.md")],
					"file-explorer-context-menu",
				);

				const ignored = [];
				plugin.linkMenu.onFilesMenuOpenCallback(makeMenu(ignored), [aFile], "search-context-menu");

				return { collected, menuTitles, ignoredSource: ignored.length };
			})()
		`,
		);

		expect(result.collected).toEqual([`${sandbox.path(dir)}/a.md`, `${sandbox.path(dir)}/b.md`]);
		expect(result.menuTitles).toContain("Bulk edit metadata in selected notes");
		expect(result.ignoredSource).toBe(0);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("offers the folder bulk item when markdown lives only in a subfolder", async () => {
		const { obsidian, sandbox } = getContext();
		const dir = "nested-only-folder";
		await seed(obsidian, sandbox.path(dir), {
			"deep/note.md": "# nested\n",
			"side/readme.txt": "not markdown\n",
		});

		const result = await evalJsonAsync<{ nestedFolder: string[]; noMarkdown: string[] }>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const base = ${JSON.stringify(sandbox.path(dir))};
				const makeMenu = (sink) => ({
					addItem(cb) {
						const item = { setIcon: () => item, setTitle: (t) => { item._t = t; return item; }, onClick: () => item };
						cb(item);
						sink.push(item._t);
						return this;
					},
				});

				// Folder whose only markdown is nested two levels down.
				const nestedFolder = [];
				plugin.linkMenu.onMenuOpenCallback(
					makeMenu(nestedFolder),
					app.vault.getAbstractFileByPath(base),
					"file-explorer-context-menu",
				);

				// Folder containing no markdown at any depth.
				const noMarkdown = [];
				plugin.linkMenu.onMenuOpenCallback(
					makeMenu(noMarkdown),
					app.vault.getAbstractFileByPath(base + "/side"),
					"file-explorer-context-menu",
				);

				return { nestedFolder, noMarkdown };
			})()
		`,
		);

		expect(result.nestedFolder).toContain("Bulk edit metadata in this folder (and subfolders)");
		expect(result.noMarkdown).not.toContain("Bulk edit metadata in this folder (and subfolders)");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});
});

// Seed a set of notes (relative paths under `baseVaultPath`) in the live vault,
// creating parent folders as needed, then let the metadata cache settle.
async function seed(
	obsidian: Parameters<typeof evalJsonAsync>[0],
	baseVaultPath: string,
	notes: Record<string, string>,
): Promise<void> {
	await evalJsonAsync<void>(
		obsidian,
		`
		(async () => {
			const base = ${JSON.stringify(baseVaultPath)};
			const notes = ${JSON.stringify(notes)};
			const ensureFolder = async (folder) => {
				const parts = folder.split("/");
				let current = "";
				for (const part of parts) {
					current = current ? current + "/" + part : part;
					if (!app.vault.getAbstractFileByPath(current)) await app.vault.createFolder(current);
				}
			};
			await ensureFolder(base);
			for (const [rel, content] of Object.entries(notes)) {
				const full = base + "/" + rel;
				const folder = full.split("/").slice(0, -1).join("/");
				await ensureFolder(folder);
				const existing = app.vault.getAbstractFileByPath(full);
				if (existing) await app.vault.delete(existing);
				await app.vault.create(full, content);
			}
			await new Promise((resolve) => setTimeout(resolve, 600));
		})()
	`,
	);
}

// Run the bulk apply over every markdown file under `folderVaultPath`.
async function applyBulk(
	obsidian: Parameters<typeof evalJsonAsync>[0],
	folderVaultPath: string,
	key: string,
	value: string,
	policy: "skip" | "merge" | "overwrite",
): Promise<BulkSummary> {
	return await evalJsonAsync<BulkSummary>(
		obsidian,
		`
		(async () => {
			const plugin = app.plugins.plugins.${PLUGIN_ID};
			const folder = app.vault.getAbstractFileByPath(${JSON.stringify(folderVaultPath)});
			const files = plugin.bulkEditor.collectFromFolder(folder);
			const summary = await plugin.bulkEditor.apply(files, ${JSON.stringify(key)}, ${JSON.stringify(value)}, ${JSON.stringify(policy)});
			await new Promise((resolve) => setTimeout(resolve, 400));
			return summary;
		})()
	`,
	);
}
