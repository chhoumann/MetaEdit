import { describe, expect, test } from "vitest";
import { CLOSE_ALL_MODALS_JS, createMetaEditE2EHarness, evalJsonAsync, PLUGIN_ID } from "./harness";

const getContext = createMetaEditE2EHarness("audit-settings");

const HELPERS = `
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const openTab = async () => {
		app.setting.close();
		await sleep(120);
		app.setting.open();
		app.setting.openTabById("${PLUGIN_ID}");
		await sleep(500);
		return app.setting.activeTab.containerEl;
	};
	const itemByName = (root, name) => Array.from(root.querySelectorAll(".setting-item"))
		.find((el) => el.querySelector(".setting-item-name")?.textContent.trim() === name);
	const isShown = (el) => Boolean(el && el.offsetParent !== null);
	const openPage = async (root, name) => {
		itemByName(root, name).click();
		for (let i = 0; i < 50; i++) {
			await sleep(80);
			const title = document.querySelector(".setting-page-title");
			if (title?.textContent.trim() === name) return title.closest(".setting-page").querySelector(".setting-page-content");
		}
		throw new Error("Settings page did not open: " + name);
	};
	const answerPrompt = async (value) => {
		let input = null;
		for (let i = 0; i < 50 && !input; i++) { await sleep(80); input = document.querySelector(".metaEditPromptInput"); }
		if (!input) throw new Error("Prompt did not open");
		input.value = value;
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		await sleep(400);
	};
`;

describe("MetaEdit settings tab", () => {
	test("SET-03/SET-05: feature toggles flip settings, persist to disk, and survive reopen", async () => {
		const { obsidian } = getContext();
		// Toggle Auto properties and the right-click menu through the rendered settings tab.
		const result = await evalJsonAsync<{
			autoFlipped: boolean;
			autoPersisted: boolean;
			uiFlipped: boolean;
			uiPersisted: boolean;
		}>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const root = await openTab();

				const toggle = async (name) => {
					const item = itemByName(root, name);
					item.querySelector(".checkbox-container").click();
					await sleep(250);
				};

				const autoBefore = plugin.settings.AutoProperties.enabled;
				await toggle("Auto properties");
				const autoAfter = plugin.settings.AutoProperties.enabled;
				const autoPersisted = (await plugin.loadData()).AutoProperties.enabled === autoAfter;

				const uiBefore = plugin.settings.UIElements.enabled;
				await toggle("Right-click menu");
				const uiAfter = plugin.settings.UIElements.enabled;
				const uiPersisted = (await plugin.loadData()).UIElements.enabled === uiAfter;

				// Restore both to their original state via the same UI path.
				if (plugin.settings.AutoProperties.enabled !== autoBefore) await toggle("Auto properties");
				if (plugin.settings.UIElements.enabled !== uiBefore) await toggle("Right-click menu");
				app.setting.close();

				return {
					autoFlipped: autoAfter !== autoBefore,
					autoPersisted,
					uiFlipped: uiAfter !== uiBefore,
					uiPersisted,
				};
			})()
		`,
		);
		expect(result.autoFlipped).toBe(true);
		expect(result.autoPersisted).toBe(true);
		expect(result.uiFlipped).toBe(true);
		expect(result.uiPersisted).toBe(true);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("SET-04: a feature's sub-page shows only while the feature is on, and opens as a settings page", async () => {
		const { obsidian } = getContext();
		const result = await evalJsonAsync<{ hiddenWhenOff: boolean; shownWhenOn: boolean; editorMounted: boolean }>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const before = plugin.settings.AutoProperties.enabled;
				plugin.settings.AutoProperties.enabled = false;
				await plugin.saveSettings();
				try {
					const root = await openTab();
					const hiddenWhenOff = !isShown(itemByName(root, "Preset values"));
					itemByName(root, "Auto properties").querySelector(".checkbox-container").click();
					await sleep(250);
					const shownWhenOn = isShown(itemByName(root, "Preset values"));
					const page = await openPage(root, "Preset values");
					const editorMounted = Boolean(page.querySelector(".metaedit-auto-properties"));
					app.setting.close();
					return { hiddenWhenOff, shownWhenOn, editorMounted };
				} finally {
					plugin.settings.AutoProperties.enabled = before;
					await plugin.saveSettings();
				}
			})()
		`,
		);
		expect(result.hiddenWhenOff).toBe(true);
		expect(result.shownWhenOn).toBe(true);
		expect(result.editorMounted).toBe(true);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("SET-06: List properties follows the edit mode and edits EditMode.properties", async () => {
		const { obsidian } = getContext();
		const result = await evalJsonAsync<{
			hiddenInSingle: boolean;
			shownInSomeMulti: boolean;
			afterAdd: string[];
			persisted: string[];
			afterDelete: string[];
		}>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const snapshot = JSON.parse(JSON.stringify(plugin.settings.EditMode));
				plugin.settings.EditMode = { mode: "All Single", properties: [] };
				await plugin.saveSettings();
				try {
					const root = await openTab();
					const hiddenInSingle = !isShown(itemByName(root, "List properties"));
					const select = itemByName(root, "Edit mode").querySelector("select");
					select.value = "Some Multi";
					select.dispatchEvent(new Event("change", { bubbles: true }));
					await sleep(300);
					const shownInSomeMulti = isShown(itemByName(root, "List properties"));

					let page = await openPage(root, "List properties");
					page.querySelector("[aria-label='Add property']").click();
					await answerPrompt("auditList");
					const afterAdd = plugin.settings.EditMode.properties.slice();
					const persisted = (await plugin.loadData()).EditMode.properties;

					page = document.querySelector(".setting-page-content");
					itemByName(page, "auditList").querySelector("[aria-label='Delete']").click();
					await sleep(400);
					const afterDelete = plugin.settings.EditMode.properties.slice();
					app.setting.close();
					return { hiddenInSingle, shownInSomeMulti, afterAdd, persisted, afterDelete };
				} finally {
					plugin.settings.EditMode = snapshot;
					await plugin.saveSettings();
				}
			})()
		`,
		);
		expect(result.hiddenInSingle).toBe(true);
		expect(result.shownInSomeMulti).toBe(true);
		expect(result.afterAdd).toEqual(["auditList"]);
		expect(result.persisted).toEqual(["auditList"]);
		expect(result.afterDelete).toEqual([]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("SET-07: Hidden properties edits IgnoredProperties.properties, ignores duplicates, and deletes the clicked rows", async () => {
		const { obsidian } = getContext();
		const result = await evalJsonAsync<{ afterAdds: string[]; rows: string[]; afterDeletes: string[]; persisted: string[] }>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const snapshot = JSON.parse(JSON.stringify(plugin.settings.IgnoredProperties));
				plugin.settings.IgnoredProperties = { enabled: true, properties: [], hideFileTags: false };
				await plugin.saveSettings();
				try {
					const root = await openTab();
					await openPage(root, "Hidden properties");
					for (const name of ["secret", "  secret  ", "draft", "keep"]) {
						document.querySelector(".setting-page-content [aria-label='Add property']").click();
						await answerPrompt(name);
					}
					const rows = Array.from(document.querySelectorAll(".setting-page-content .setting-item-name"))
						.map((el) => el.textContent.trim())
						.filter(Boolean);
					const afterAdds = plugin.settings.IgnoredProperties.properties.slice();

					// Both deletes are queued before the first one saves and re-renders.
					const page = document.querySelector(".setting-page-content");
					const deleteButtons = ["secret", "draft"].map((name) => itemByName(page, name).querySelector("[aria-label='Delete']"));
					deleteButtons.forEach((button) => button.click());
					await sleep(500);
					const afterDeletes = plugin.settings.IgnoredProperties.properties.slice();
					const persisted = (await plugin.loadData()).IgnoredProperties.properties;
					app.setting.close();
					return { afterAdds, rows, afterDeletes, persisted };
				} finally {
					plugin.settings.IgnoredProperties = snapshot;
					await plugin.saveSettings();
				}
			})()
		`,
		);
		expect(result.afterAdds).toEqual(["secret", "draft", "keep"]);
		expect(result.rows).toEqual(["secret", "draft", "keep"]);
		expect(result.afterDeletes).toEqual(["keep"]);
		expect(result.persisted).toEqual(["keep"]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("SET-08: the Progress properties and Kanban board helper toggles attach and detach their automators", async () => {
		const { obsidian } = getContext();
		const result = await evalJsonAsync<{ on: string[]; off: string[] }>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const snapshot = {
					progress: plugin.settings.ProgressProperties.enabled,
					kanban: plugin.settings.KanbanHelper.enabled,
				};
				plugin.settings.ProgressProperties.enabled = false;
				plugin.settings.KanbanHelper.enabled = false;
				plugin.toggleAutomators();
				await plugin.saveSettings();
				const attached = () => plugin.automatorManager.automators.map((a) => a.type).sort();
				try {
					const root = await openTab();
					const toggle = async (name) => {
						itemByName(root, name).querySelector(".checkbox-container").click();
						await sleep(250);
					};
					await toggle("Progress properties");
					await toggle("Kanban board helper");
					const on = attached();
					await toggle("Progress properties");
					await toggle("Kanban board helper");
					const off = attached();
					app.setting.close();
					return { on, off };
				} finally {
					plugin.settings.ProgressProperties.enabled = snapshot.progress;
					plugin.settings.KanbanHelper.enabled = snapshot.kanban;
					plugin.toggleAutomators();
					await plugin.saveSettings();
				}
			})()
		`,
		);
		expect(result.on).toEqual(["KanbanHelper", "ProgressProperties"]);
		expect(result.off).toEqual([]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("AUTO-02: add, name, and remove an Auto Property through the settings panel", async () => {
		const { obsidian } = getContext();
		const result = await evalJsonAsync<{ afterAdd: string[]; afterRemove: string[] }>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const wasEnabled = plugin.settings.AutoProperties.enabled;
				plugin.settings.AutoProperties.enabled = true;
				const root = await openTab();
				const item = await openPage(root, "Preset values");
				const before = plugin.settings.AutoProperties.properties.length;
				// Click "Add auto property".
				const addBtn = Array.from(item.querySelectorAll("button")).find(b => b.textContent.trim().includes("Add auto property"));
				addBtn.click();
				await sleep(200);
				// Name the new (last) card.
				const names = item.querySelectorAll(".metaedit-ap-name");
				const nameInput = names[names.length - 1];
				nameInput.value = "auditUiProp";
				nameInput.dispatchEvent(new Event("input", { bubbles: true }));
				nameInput.dispatchEvent(new Event("change", { bubbles: true }));
				await sleep(200);
				const afterAdd = plugin.settings.AutoProperties.properties.map(a => a.name);

				// Remove it via its trash button.
				const cards = item.querySelectorAll(".metaedit-ap-card");
				const lastCard = cards[cards.length - 1];
				lastCard.querySelector(".metaedit-ap-header button").click();
				await sleep(200);
				const afterRemove = plugin.settings.AutoProperties.properties.map(a => a.name);
				app.setting.close();
				plugin.settings.AutoProperties.enabled = wasEnabled;
				await plugin.saveSettings();
				return { afterAdd, afterRemove };
			})()
		`,
		);
		expect(result.afterAdd).toContain("auditUiProp");
		expect(result.afterRemove).not.toContain("auditUiProp");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("AUTO-03: settings tab saves do not clobber choices added elsewhere while open", async () => {
		const { obsidian } = getContext();
		const result = await evalJsonAsync<{
			afterExternal: string[];
			afterTabSave: { choices: string[]; description?: string };
			persisted: { choices: string[]; description?: string };
		}>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const snapshot = {
					auto: JSON.parse(JSON.stringify(plugin.settings.AutoProperties)),
				};

				plugin.settings.AutoProperties.enabled = true;
				plugin.settings.AutoProperties.properties = [{ name: "status", choices: ["todo"], type: "Single" }];
				await plugin.saveSettings();

				const root = await openTab();
				const item = await openPage(root, "Preset values");

				await plugin.api.setAutoProperties([{ name: "status", choices: ["todo", "external"], type: "Single" }]);
				const afterExternal = plugin.settings.AutoProperties.properties[0].choices.slice();

				const desc = item.querySelector(".metaedit-ap-description");
				desc.value = "tab edit";
				desc.dispatchEvent(new Event("input", { bubbles: true }));
				desc.dispatchEvent(new Event("change", { bubbles: true }));
				await sleep(500);

				const afterTabSave = JSON.parse(JSON.stringify(plugin.settings.AutoProperties.properties[0]));
				const persisted = (await plugin.loadData()).AutoProperties.properties[0];

				app.setting.close();
				plugin.settings.AutoProperties = snapshot.auto;
				await plugin.saveSettings();

				return { afterExternal, afterTabSave, persisted };
			})()
		`,
		);

		expect(result.afterExternal).toEqual(["todo", "external"]);
		expect(result.afterTabSave.choices).toEqual(["todo", "external"]);
		expect(result.afterTabSave.description).toBe("tab edit");
		expect(result.persisted.choices).toEqual(["todo", "external"]);
		expect(result.persisted.description).toBe("tab edit");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("MENU-04: the Right-click menu toggle registers and unregisters the Edit Meta file menu", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("menu-toggle.md");
		const result = await evalJsonAsync<{ whenOn: boolean; whenOff: boolean; storedOff: boolean; whenBackOn: boolean }>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const path = ${JSON.stringify(notePath)};
				let f = app.vault.getAbstractFileByPath(path);
				if (!f) f = await app.vault.create(path, "# note\\n");
				await sleep(200);

				// A Proxy menu absorbs every method other file-menu handlers (core,
				// other plugins) call, recording only item titles, so triggering the
				// global event does not throw on an incomplete stub.
				const makeMenu = (sink) => {
					const item = new Proxy({}, { get: (_t, p) =>
						p === "setTitle" ? (t) => { sink.push(typeof t === "string" ? t : (t?.textContent ?? "")); return item; } : () => item });
					const menu = new Proxy({}, { get: (_t, p) =>
						p === "addItem" ? (cb) => { cb(item); return menu; } : () => menu });
					return menu;
				};
				const menuHasEditMeta = () => {
					const sink = [];
					app.workspace.trigger("file-menu", makeMenu(sink), f, "file-explorer-context-menu");
					return sink.some((t) => /Edit Meta/.test(t));
				};

				const root = await openTab();
				const toggle = async () => {
					itemByName(root, "Right-click menu").querySelector(".checkbox-container").click();
					await sleep(250);
				};
				if (!plugin.settings.UIElements.enabled) await toggle();
				const whenOn = menuHasEditMeta();

				await toggle();
				const whenOff = menuHasEditMeta();
				const storedOff = plugin.settings.UIElements.enabled;

				await toggle();
				const whenBackOn = menuHasEditMeta();
				app.setting.close();
				return { whenOn, whenOff, storedOff, whenBackOn };
			})()
		`,
		);
		expect(result.whenOn).toBe(true);
		expect(result.whenOff).toBe(false);
		expect(result.storedOff).toBe(false);
		expect(result.whenBackOn).toBe(true);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("RUN-05: a property present but hidden by IgnoredProperties is not offered as a new-property name", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("ignored-suggest.md");
		const result = await evalJsonAsync<{ suggestValues: string[]; captured: boolean }>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				const itemText = (item) => ((item.querySelector(".suggestion-item-text") || item).textContent || "").trim();
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const path = ${JSON.stringify(notePath)};
				let f = app.vault.getAbstractFileByPath(path);
				const body = "---\\nsecretKey: v\\nvisibleKey: v\\n---\\nbody\\n";
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				await sleep(300);

				const prevIgnored = JSON.parse(JSON.stringify(plugin.settings.IgnoredProperties));
				plugin.settings.IgnoredProperties.enabled = true;
				plugin.settings.IgnoredProperties.properties = ["secretKey"];
				// Spy on the fluid YAML-creation entry point to capture the suggestValues
				// the suggester computed (its 2nd arg), then return without opening the
				// modal so nothing is written.
				const orig = plugin.controller.createNewYamlPropertyFluid.bind(plugin.controller);
				let captured = null;
				plugin.controller.createNewYamlPropertyFluid = async (_file, sv) => { captured = sv ? [...sv] : []; };
				try {
					await plugin.runMetaEditForFile(f);
					const waitForItem = async () => {
						for (let i = 0; i < 60; i++) {
							await sleep(80);
							const el = Array.from(document.querySelectorAll(".suggestion-item")).find(x => itemText(x) === "New YAML property");
							if (el) return el;
						}
						return null;
					};
					const opt = await waitForItem();
					if (opt) {
						opt.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
						opt.dispatchEvent(new MouseEvent("click", { bubbles: true }));
					}
					await sleep(300);
					${CLOSE_ALL_MODALS_JS}
					await closeAllModals();
					return { suggestValues: captured ?? [], captured: captured !== null };
				} finally {
					plugin.controller.createNewYamlPropertyFluid = orig;
					plugin.settings.IgnoredProperties = prevIgnored;
				}
			})()
		`,
		);
		expect(result.captured).toBe(true);
		// Both present keys (visible AND ignored) are excluded from new-property name suggestions.
		expect(result.suggestValues).not.toContain("secretKey");
		expect(result.suggestValues).not.toContain("visibleKey");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});
});
