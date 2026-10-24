import { describe, expect, test } from "vitest";
import { CLOSE_ALL_MODALS_JS, createMetaEditE2EHarness, evalJsonAsync, PLUGIN_ID } from "./harness";

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
	const openPage = async (root, name) => {
		itemByName(root, name).click();
		const title = await waitFor(".setting-page-title", (el) => el.textContent.trim() === name);
		return title.closest(".setting-page").querySelector(".setting-page-content");
	};
	${CLOSE_ALL_MODALS_JS}
`;

describe("MetaEdit modal + kanban flows", () => {
	test("API-01: autoprop opens the value picker and resolves the chosen value", async () => {
		const { obsidian } = getContext();
		const result = await evalJsonAsync<{ title: string; chosen: unknown }>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				await closeAllModals();
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
				await closeAllModals();
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
					// Cancel the way a user does: Escape through Obsidian's keymap
					// scope (1.13 removed the .modal-close-button affordance).
					document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true }));
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
				await closeAllModals();
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const snapshot = JSON.parse(JSON.stringify(plugin.settings.ProgressProperties));
				plugin.settings.ProgressProperties = { enabled: true, properties: [] };
				await plugin.saveSettings();
				let afterAdd;
				let afterRemove;
				try {
					const root = await openTab();
					const page = await openPage(root, "Tracked task counts");
					page.querySelector("[aria-label='Add property']").click();
					const input = await waitFor(".metaEditPromptInput");
					input.value = "auditProg";
					input.dispatchEvent(new Event("input", { bubbles: true }));
					input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
					const row = await waitFor(".setting-page-content .setting-item", (el) => el.querySelector(".setting-item-name")?.textContent.trim() === "auditProg");
					const select = row.querySelector("select");
					select.value = "Completed Tasks";
					select.dispatchEvent(new Event("change", { bubbles: true }));
					await sleep(300);
					afterAdd = plugin.settings.ProgressProperties.properties.map(p => ({ name: p.name, type: p.type }));

					row.querySelector("[aria-label='Delete']").click();
					await sleep(300);
					afterRemove = plugin.settings.ProgressProperties.properties.length;
					app.setting.close();
				} finally {
					plugin.settings.ProgressProperties = snapshot;
					await plugin.saveSettings();
				}
				return { afterAdd, afterRemove };
			})()
		`,
		);
		expect(result.afterAdd).toEqual([{ name: "auditProg", type: "Completed Tasks" }]);
		expect(result.afterRemove).toBe(0);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	// PROMPT-02: a date-typed YAML property opens Obsidian's native date widget.
	// Since PR #168 a top-level YAML property is edited in the
	// NativePropertyPrompt, so the date affordance is the native widget's
	// input[type=date] - the legacy .metaEditPromptInput date picker no longer
	// participates in this flow.
	test("PROMPT-02: a date-typed YAML property opens a native date input in the edit prompt", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("date-prop.md");
		const result = await evalJsonAsync<{
			inputType: string | null;
			hasDateClass: boolean;
			legacyPromptOpened: boolean;
			modalsAfter: number;
		}>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				const itemText = (item) => ((item.querySelector(".suggestion-item-text") || item).textContent || "").trim();
				await closeAllModals();
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const path = ${JSON.stringify(notePath)};
				let f = app.vault.getAbstractFileByPath(path);
				const body = "---\\ndue: 2026-01-01\\n---\\nbody\\n";
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				await sleep(300);
				// Assign Obsidian's "date" property type so the native prompt mounts the date widget.
				app.metadataTypeManager.setType("due", "date");
				await sleep(200);

				await plugin.runMetaEditForFile(f);
				const row = await waitFor(".suggestion-item", (i) => itemText(i).startsWith("due"));
				row.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
				row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
				const host = await waitFor(".metaedit-native-property-host");
				const input = host.querySelector("input");
				const inputType = input?.getAttribute("type") ?? null;
				const hasDateClass = input?.classList.contains("mod-date") ?? false;
				const legacyPromptOpened = Boolean(document.querySelector(".metaEditPromptInput"));
				await closeAllModals();
				return {
					inputType,
					hasDateClass,
					legacyPromptOpened,
					modalsAfter: document.querySelectorAll(".modal-container").length,
				};
			})()
		`,
		);
		expect(result.inputType).toBe("date");
		expect(result.hasDateClass).toBe(true);
		expect(result.legacyPromptOpened).toBe(false);
		expect(result.modalsAfter).toBe(0);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("KAN-02/KAN-03: configure a board mapping and display its lane headings", async () => {
		const { obsidian, sandbox } = getContext();
		const boardPath = sandbox.path("board.md");
		const result = await evalJsonAsync<{ boardsListed: boolean; lanes: string; mapped: boolean; property: string; persistedProperty: string }>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				await closeAllModals();
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
					plugin.settings.KanbanHelper.boards = [];
					const root = await openTab();
					const page = await openPage(root, "Boards");
					page.querySelector("[aria-label='Add board']").click();
					// The board file is offered (getFilesWithProperty kanban-plugin).
					const option = await waitFor(".suggestion-item", (el) => el.textContent.trim() === "board");
					const boardsListed = Boolean(option);
					option.click();
					const row = await waitFor(".setting-page-content .setting-item", (el) => el.querySelector(".setting-item-name")?.textContent.trim() === "board");
					const mapped = plugin.settings.KanbanHelper.boards.some(b => b.boardName === "board");
					// The lane headings render as the row description.
					const lanes = row.querySelector(".setting-item-description").textContent;
					const input = row.querySelector("input[type=text]");
					input.value = "status";
					input.dispatchEvent(new Event("input", { bubbles: true }));
					await sleep(300);
					const property = plugin.settings.KanbanHelper.boards.find(b => b.boardName === "board")?.property;
					const persistedProperty = (await plugin.loadData()).KanbanHelper.boards.find(b => b.boardName === "board")?.property;
					app.setting.close();
					return { boardsListed, lanes, mapped, property, persistedProperty };
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
		expect(result.property).toBe("status");
		expect(result.persistedProperty).toBe("status");
		// KAN-03: lane headings are displayed (null-safe getFileCache).
		expect(result.lanes).toContain("To Do");
		expect(result.lanes).toContain("Done");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});
});
