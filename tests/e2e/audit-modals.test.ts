import { describe, expect, test } from "vitest";
import { createMetaEditE2EHarness, evalJsonAsync, PLUGIN_ID } from "./harness";

const getContext = createMetaEditE2EHarness("audit-modals");

const HELPERS = `
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const waitFor = async (selector, predicate = () => true) => {
		const start = Date.now();
		while (Date.now() - start < 6000) {
			const found = Array.from(document.querySelectorAll(selector)).find(predicate);
			if (found) return found;
			await sleep(80);
		}
		throw new Error("Timed out waiting for " + selector);
	};
	const openTab = async () => {
		app.setting.close(); await sleep(200);
		app.setting.open(); app.setting.openTabById("${PLUGIN_ID}");
		for (let i = 0; i < 50; i++) {
			await sleep(80);
			if (app.setting.activeTab?.id === "${PLUGIN_ID}" && app.setting.activeTab.containerEl?.querySelector(".setting-item")) break;
		}
		return app.setting.activeTab.containerEl;
	};
	const itemByName = (root, name) => Array.from(root.querySelectorAll(".setting-item"))
		.find((el) => el.querySelector(".setting-item-name")?.textContent.trim() === name);
	const closeAll = async () => {
		app.setting?.close?.();
		document.querySelectorAll(".modal-container .modal-close-button").forEach((b) => b.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		document.querySelectorAll(".modal-container, .suggestion-container, .prompt").forEach((el) => el.remove());
		await sleep(120);
	};
`;

describe("MetaEdit modal + kanban flows", () => {
	test("API-01: autoprop opens the value picker and resolves the chosen value", async () => {
		const { obsidian } = getContext();
		const result = await evalJsonAsync<{ title: string; chosen: unknown }>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				await closeAll();
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const prevEnabled = plugin.settings.AutoProperties.enabled;
				const prevProps = plugin.settings.AutoProperties.properties;
				plugin.settings.AutoProperties.enabled = true;
				plugin.settings.AutoProperties.properties = [{ name: "mood", choices: ["good", "bad"], type: "Single" }];
				try {
					const p = plugin.api.autoprop("mood");
					const title = (await waitFor(".metaedit-ap-prompt-title")).textContent.trim();
					// Click the "good" choice row.
					const row = await waitFor(".metaedit-ap-prompt-row", (el) => el.textContent.trim() === "good");
					row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
					const chosen = await p;
					return { title, chosen };
				} finally {
					plugin.settings.AutoProperties.enabled = prevEnabled;
					plugin.settings.AutoProperties.properties = prevProps;
				}
			})()
		`,
		);
		expect(result.title).toBe("mood");
		expect(result.chosen).toBe("good");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("AUTO-07: cancelling the value picker resolves null and changes nothing", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("auto-cancel.md");
		const result = await evalJsonAsync<{ resolved: unknown; content: string; before: string }>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				await closeAll();
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const path = ${JSON.stringify(notePath)};
				let f = app.vault.getAbstractFileByPath(path);
				const body = "---\\nmood: ok\\n---\\nbody\\n";
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				await sleep(300);
				const before = await app.vault.read(f);

				const prevEnabled = plugin.settings.AutoProperties.enabled;
				const prevProps = plugin.settings.AutoProperties.properties;
				plugin.settings.AutoProperties.enabled = true;
				plugin.settings.AutoProperties.properties = [{ name: "mood", choices: ["good", "bad"], type: "Single" }];
				try {
					const p = plugin.api.autoprop("mood");
					const titleEl = await waitFor(".metaedit-ap-prompt-title");
					// Cancel by clicking the modal's close button (the X).
					const modalEl = titleEl.closest(".modal-container") || document;
					const closeBtn = modalEl.querySelector(".modal-close-button");
					if (closeBtn) closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
					else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
					const resolved = await p;
					await sleep(150);
					return { resolved, content: await app.vault.read(f), before };
				} finally {
					plugin.settings.AutoProperties.enabled = prevEnabled;
					plugin.settings.AutoProperties.properties = prevProps;
				}
			})()
		`,
		);
		expect(result.resolved).toBeNull();
		expect(result.content).toBe(result.before);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("PROG-02: add, name, type, and remove a progress rule through the settings panel", async () => {
		const { obsidian } = getContext();
		const result = await evalJsonAsync<{ afterAdd: { name: string; type: string }[]; afterRemove: number }>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				await closeAll();
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				// Clear any stray board mapping so the Kanban panel render does not log a
				// 'file not found' warning (which would pollute evalJsonAsync).
				plugin.settings.KanbanHelper.boards = [];
				const root = await openTab();
				const item = itemByName(root, "Progress Properties");
				item.querySelector(".extra-setting-button").click();
				await sleep(200);
				const before = plugin.settings.ProgressProperties.properties.length;
				const addBtn = Array.from(item.querySelectorAll("button")).find(b => b.textContent.trim() === "Add");
				addBtn.click();
				await sleep(200);
				// Name the new row + pick a type.
				const rows = item.querySelectorAll("tbody tr");
				const row = rows[rows.length - 1];
				const nameInput = row.querySelector("input[type=text]");
				nameInput.value = "auditProg";
				nameInput.dispatchEvent(new Event("input", { bubbles: true }));
				nameInput.dispatchEvent(new Event("change", { bubbles: true }));
				const select = row.querySelector("select");
				select.value = "Completed Tasks";
				select.dispatchEvent(new Event("change", { bubbles: true }));
				await sleep(200);
				const afterAdd = plugin.settings.ProgressProperties.properties.map(p => ({ name: p.name, type: p.type }));

				// Remove it.
				const delBtn = row.querySelector("input[type=button]");
				delBtn.click();
				await sleep(200);
				const afterRemove = plugin.settings.ProgressProperties.properties.length;
				app.setting.close();
				return { afterAdd, afterRemove };
			})()
		`,
		);
		expect(result.afterAdd).toContainEqual({ name: "auditProg", type: "Completed Tasks" });
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("PROMPT-02: a date-typed YAML property opens a native date picker in the prompt", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("date-prop.md");
		const result = await evalJsonAsync<{ inputType: string; hasDateClass: boolean }>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				const itemText = (item) => ((item.querySelector(".suggestion-item-text") || item).textContent || "").trim();
				await closeAll();
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const path = ${JSON.stringify(notePath)};
				let f = app.vault.getAbstractFileByPath(path);
				const body = "---\\ndue: 2026-01-01\\n---\\nbody\\n";
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				await sleep(300);
				// Assign Obsidian's "date" property type so getDateInputType returns "date".
				app.metadataTypeManager.setType("due", "date");
				await sleep(200);

				await plugin.runMetaEditForFile(f);
				const row = await waitFor(".suggestion-item", (i) => itemText(i).startsWith("due"));
				row.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
				row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
				const input = await waitFor(".metaEditPromptInput");
				const inputType = input.getAttribute("type");
				const hasDateClass = input.classList.contains("mod-date");
				await closeAll();
				return { inputType, hasDateClass };
			})()
		`,
		);
		expect(result.inputType).toBe("date");
		expect(result.hasDateClass).toBe(true);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("KAN-02/KAN-03: configure a board mapping and display its lane headings", async () => {
		const { obsidian, sandbox } = getContext();
		const boardPath = sandbox.path("board.md");
		const result = await evalJsonAsync<{ boardsListed: boolean; lanes: string; mapped: boolean }>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				await closeAll();
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const path = ${JSON.stringify(boardPath)};
				let f = app.vault.getAbstractFileByPath(path);
				const body = "---\\nkanban-plugin: basic\\n---\\n\\n## To Do\\n\\n## Doing\\n\\n## Done\\n";
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				// Wait for the board's headings + kanban-plugin key to index.
				for (let i = 0; i < 60; i++) {
					await sleep(80);
					const c = app.metadataCache.getFileCache(f);
					if (c?.frontmatter?.["kanban-plugin"] && (c.headings?.length ?? 0) >= 3) break;
				}
				const prevBoards = plugin.settings.KanbanHelper.boards;
				plugin.settings.KanbanHelper.enabled = true;
				try {
					const root = await openTab();
					const item = itemByName(root, "Kanban Board Helper");
					item.querySelector(".extra-setting-button").click();
					await sleep(250);
					// The board file should be offered (getFilesWithProperty kanban-plugin).
					const boardsListed = plugin.getFilesWithProperty("kanban-plugin").some(b => b.path === path);
					// Type the board name into the suggester input and click Add.
					const input = item.querySelector("input[type=text]");
					input.value = "board";
					input.dispatchEvent(new Event("input", { bubbles: true }));
					const addBtn = Array.from(item.querySelectorAll("button")).find(b => b.textContent.trim() === "Add");
					addBtn.click();
					await sleep(300);
					const mapped = plugin.settings.KanbanHelper.boards.some(b => b.boardName === "board");
					// The lane headings render in the panel (getHeadingsInBoard, null-safe).
					const lanes = item.textContent;
					app.setting.close();
					return { boardsListed, lanes, mapped };
				} finally {
					plugin.settings.KanbanHelper.boards = prevBoards;
					plugin.settings.KanbanHelper.enabled = false;
					await plugin.saveSettings();
				}
			})()
		`,
		);
		expect(result.boardsListed).toBe(true);
		expect(result.mapped).toBe(true);
		// KAN-03: lane headings are displayed (null-safe getFileCache).
		expect(result.lanes).toContain("To Do");
		expect(result.lanes).toContain("Done");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});
});
