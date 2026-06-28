import { describe, expect, test } from "vitest";
import { createMetaEditE2EHarness, evalJsonAsync, PLUGIN_ID } from "./harness";

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
`;

describe("MetaEdit settings tab", () => {
	test("SET-03/SET-05: feature toggles flip settings, persist to disk, and survive reopen", async () => {
		const { obsidian } = getContext();
		// Toggle Auto Properties and UI Elements (their onChange does not call
		// toggleAutomators, which logs and would break evalJsonAsync).
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
				await toggle("Auto Properties");
				const autoAfter = plugin.settings.AutoProperties.enabled;
				const autoPersisted = (await plugin.loadData()).AutoProperties.enabled === autoAfter;

				const uiBefore = plugin.settings.UIElements.enabled;
				await toggle("UI Elements");
				const uiAfter = plugin.settings.UIElements.enabled;
				const uiPersisted = (await plugin.loadData()).UIElements.enabled === uiAfter;

				// Restore both to their original state via the same UI path.
				if (plugin.settings.AutoProperties.enabled !== autoBefore) await toggle("Auto Properties");
				if (plugin.settings.UIElements.enabled !== uiBefore) await toggle("UI Elements");
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

	test("SET-04: the gear button expands and collapses a sub-settings panel", async () => {
		const { obsidian } = getContext();
		const result = await evalJsonAsync<{ expanded: boolean; collapsed: boolean }>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				const root = await openTab();
				const item = itemByName(root, "Auto Properties");
				const gear = item.querySelector(".extra-setting-button");
				// The collapsible panel is the div the Svelte content mounts into; it
				// carries the 'metaedit-hidden' class which the gear toggles.
				const detail = item.querySelector(".metaedit-auto-properties").parentElement;
				const startsHidden = detail.classList.contains("metaedit-hidden");
				gear.click(); await sleep(200);
				const expanded = !detail.classList.contains("metaedit-hidden");
				gear.click(); await sleep(200);
				const collapsed = detail.classList.contains("metaedit-hidden");
				app.setting.close();
				return { expanded: startsHidden && expanded, collapsed };
			})()
		`,
		);
		expect(result.expanded).toBe(true);
		expect(result.collapsed).toBe(true);
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
				const root = await openTab();
				const item = itemByName(root, "Auto Properties");
				// Expand the panel.
				item.querySelector(".extra-setting-button").click();
				await sleep(200);
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
				return { afterAdd, afterRemove };
			})()
		`,
		);
		expect(result.afterAdd).toContain("auditUiProp");
		expect(result.afterRemove).not.toContain("auditUiProp");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("MENU-04: UIElements toggle registers and unregisters the Edit Meta file menu", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("menu-toggle.md");
		const result = await evalJsonAsync<{ whenOn: boolean; whenOff: boolean }>(
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

				// Ensure enabled.
				if (!plugin.settings.UIElements.enabled) { plugin.linkMenu.registerEvent(); plugin.settings.UIElements.enabled = true; }
				await sleep(100);
				const whenOn = menuHasEditMeta();

				// Disable via the real handler path.
				plugin.linkMenu.unregisterEvent();
				plugin.settings.UIElements.enabled = false;
				await sleep(100);
				const whenOff = menuHasEditMeta();

				// Restore enabled for other tests.
				plugin.linkMenu.registerEvent();
				plugin.settings.UIElements.enabled = true;
				return { whenOn, whenOff };
			})()
		`,
		);
		expect(result.whenOn).toBe(true);
		expect(result.whenOff).toBe(false);
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
				// Spy on createNewProperty to capture the suggestValues the suggester
				// computed, then cancel (return null) so nothing is written.
				const orig = plugin.controller.createNewProperty.bind(plugin.controller);
				let captured = null;
				plugin.controller.createNewProperty = async (sv) => { captured = sv ? [...sv] : []; return null; };
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
					app.workspace.activeModal?.close?.();
					for (const el of Array.from(document.querySelectorAll(".suggestion-container, .suggestion-item, .prompt"))) el.remove();
					return { suggestValues: captured ?? [], captured: captured !== null };
				} finally {
					plugin.controller.createNewProperty = orig;
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
