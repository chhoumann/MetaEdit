import { describe, expect, test } from "vitest";
import { createMetaEditE2EHarness, evalJsonAsync, PLUGIN_ID } from "./harness";

const getContext = createMetaEditE2EHarness("audit-suggester");

// Shared driver helpers, injected into each eval. Drives the REAL suggester and
// GenericPrompt DOM exactly as a user clicking/typing would.
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
	const itemText = (item) => ((item.querySelector(".suggestion-item-text") || item).textContent || "").trim();
	const clickItem = (item) => {
		item.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		item.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
		item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	};
	const typePrompt = async (value) => {
		const input = await waitFor(".metaEditPromptInput");
		input.value = value;
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
		return input;
	};
	const closeModals = () => {
		app.workspace.activeModal?.close?.();
		for (const b of Array.from(document.querySelectorAll(".modal-close-button"))) b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		for (const el of Array.from(document.querySelectorAll(".suggestion-container, .suggestion-item, .prompt"))) el.remove();
	};
`;

describe("MetaEdit Edit Meta suggester flows", () => {
	test("RUN-03: create a new YAML property through the suggester", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("suggester-new-yaml.md");
		const content = await evalJsonAsync<string>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				closeModals(); await sleep(150);
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const path = ${JSON.stringify(notePath)};
				let f = app.vault.getAbstractFileByPath(path);
				const body = "---\\nexisting: 1\\n---\\nbody\\n";
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				await sleep(300);

				await plugin.runMetaEditForFile(f);
				const option = await waitFor(".suggestion-item", (i) => itemText(i) === "New YAML property");
				clickItem(option);
				await typePrompt("freshKey");   // property name prompt
				await typePrompt("freshValue"); // property value prompt
				await waitFor("body", () => (app.metadataCache.getFileCache(f)?.frontmatter ?? {}).freshKey === "freshValue");
				closeModals();
				await sleep(100);
				return await app.vault.read(f);
			})()
		`,
		);
		expect(content).toContain("freshKey: freshValue");
		expect(content).toContain("existing: 1");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("RUN-03: duplicate-key Notice is well-formed (period outside the quoted name)", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("suggester-dup-notice.md");
		const noticeText = await evalJsonAsync<string>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				closeModals(); await sleep(150);
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const path = ${JSON.stringify(notePath)};
				let f = app.vault.getAbstractFileByPath(path);
				const body = "---\\nstatus: draft\\n---\\nbody\\n";
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				await sleep(300);
				// Adding an existing key triggers the duplicate Notice.
				await plugin.controller.addYamlProp("status", "x", f);
				const notice = await waitFor(".notice");
				return (notice.textContent || "").trim();
			})()
		`,
		);
		// The property name is quoted as 'status' with the period OUTSIDE the quote.
		expect(noticeText).toContain("already has property 'status'. Will not add.");
		expect(noticeText).not.toContain("'status. Will not add.'");
	});

	test("RUN-06: the X button deletes the property and closes the modal", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("suggester-delete.md");
		const result = await evalJsonAsync<{ content: string; modalOpen: boolean }>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				closeModals(); await sleep(150);
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const path = ${JSON.stringify(notePath)};
				let f = app.vault.getAbstractFileByPath(path);
				const body = "---\\ndeleteMe: yes\\nkeepMe: yes\\n---\\nbody\\n";
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				await sleep(300);

				await plugin.runMetaEditForFile(f);
				// Data rows carry the action buttons, so textContent is "deleteMe❌🔃";
				// match the key as a prefix.
				const row = await waitFor(".suggestion-item", (i) => itemText(i).startsWith("deleteMe"));
				const delBtn = Array.from(row.querySelectorAll("button")).find((b) => b.textContent === "❌");
				if (!delBtn) throw new Error("delete button not found");
				delBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
				await waitFor("body", () => !("deleteMe" in (app.metadataCache.getFileCache(f)?.frontmatter ?? {})));
				await sleep(200);
				const modalOpen = !!document.querySelector(".suggestion-container .suggestion-item");
				closeModals();
				return { content: await app.vault.read(f), modalOpen };
			})()
		`,
		);
		expect(result.content).not.toContain("deleteMe");
		expect(result.content).toContain("keepMe: yes");
		// Modal closed after the delete.
		expect(result.modalOpen).toBe(false);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("RUN-07: the transform button converts a YAML property to an inline Dataview field", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("suggester-transform.md");
		const content = await evalJsonAsync<string>(
			obsidian,
			`
			(async () => {
				${HELPERS}
				closeModals(); await sleep(150);
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const path = ${JSON.stringify(notePath)};
				let f = app.vault.getAbstractFileByPath(path);
				const body = "---\\nmover: here\\n---\\nbody\\n";
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				await sleep(300);

				await plugin.runMetaEditForFile(f);
				const row = await waitFor(".suggestion-item", (i) => itemText(i).startsWith("mover"));
				const xform = Array.from(row.querySelectorAll("button")).find((b) => b.textContent === "🔃");
				if (!xform) throw new Error("transform button not found");
				xform.dispatchEvent(new MouseEvent("click", { bubbles: true }));
				// Transform deletes the YAML key, then appends the inline field.
				await waitFor("body", () => !("mover" in (app.metadataCache.getFileCache(f)?.frontmatter ?? {})));
				await sleep(250);
				closeModals();
				await sleep(100);
				return await app.vault.read(f);
			})()
		`,
		);
		// Converted to an inline field; the YAML key is gone.
		expect(content).toContain("mover:: here");
		expect(content).not.toMatch(/^mover: here$/m);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});
});
