import {describe, expect, test} from "vitest";
import {createMetaEditE2EHarness, evalJsonAsync, PLUGIN_ID} from "./harness";

const getContext = createMetaEditE2EHarness("native-properties");

describe("MetaEdit native Obsidian property widgets", () => {
	test("roundtrips standard scalar widgets through processFrontMatter", async () => {
		const {obsidian, sandbox} = getContext();
		const notePath = sandbox.path("native-scalars.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\nsummary: old\ncount: 5\ndone: true\ndue: 2026-01-01\nstamp: 2026-01-01T01:02:03\n---\nbody\n",
		);

		const result = await evalJsonAsync<{
			cache: Record<string, unknown>;
			content: string;
			modalCount: number;
			suggestionCount: number;
		}>(
			obsidian,
			`
			(async () => {
				${NATIVE_HELPERS}
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
				app.metadataTypeManager.setType("summary", "text");
				app.metadataTypeManager.setType("count", "number");
				app.metadataTypeManager.setType("done", "checkbox");
				app.metadataTypeManager.setType("due", "date");
				app.metadataTypeManager.setType("stamp", "datetime");
				await sleep(200);

				await editText(file, "summary", "changed");
				await editText(file, "summary", "");
				await editInput(file, "count", "0");
				await editInput(file, "count", "");
				await editCheckbox(file, "done", false);
				await editInput(file, "due", "2026-08-03");
				await editInput(file, "due", "");
				await editInput(file, "stamp", "2026-08-03T12:34:56");
				await editInput(file, "stamp", "");
				await waitForCache(file, "stamp");

				return {
					cache: {...app.metadataCache.getFileCache(file)?.frontmatter},
					content: await app.vault.read(file),
					modalCount: document.querySelectorAll(".modal-container").length,
					suggestionCount: document.querySelectorAll(".suggestion-container").length,
				};
			})()
			`,
		);

		expect(result.cache.summary).toBe("");
		expect(result.cache.count).toBeNull();
		expect(result.cache.done).toBe(false);
		expect(result.cache.due).toBe("");
		expect(result.cache.stamp).toBe("");
		expect(result.content).toContain("summary: \"\"");
		expect(result.content).toContain("count:");
		expect(result.content).toContain("done: false");
		expect(result.modalCount).toBe(0);
		expect(result.suggestionCount).toBe(0);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("roundtrips native list, tags, aliases, and cssclasses widgets", async () => {
		const {obsidian, sandbox} = getContext();
		const notePath = sandbox.path("native-lists.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\nrelated:\n  - alpha\ntags:\n  - area/test\naliases:\n  - Alias One\ncssclasses:\n  - wide\n---\nbody\n",
		);

		const result = await evalJsonAsync<{
			cache: Record<string, unknown>;
			content: string;
			relatedPills: string[];
			aliasesPills: string[];
			cleanup: {
				bodyDelta: number;
				documentListenerDelta: number;
				modalCount: number;
				suggestionCount: number;
			};
		}>(
			obsidian,
			`
			(async () => {
				${NATIVE_HELPERS}
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});

				const cleanupBefore = beginCleanupMeasurement();
				const relatedPills = await addPill(file, "related", "gamma");
				const aliasesPills = await addPill(file, "aliases", "Alias, Two");
				await addPill(file, "tags", "#area/next");
				await addPill(file, "cssclasses", "readable");
				const cleanup = cleanupBefore.finish();
				await waitForCache(file, "cssclasses");

				return {
					cache: {...app.metadataCache.getFileCache(file)?.frontmatter},
					content: await app.vault.read(file),
					relatedPills,
					aliasesPills,
					cleanup,
				};
			})()
			`,
		);

		expect(result.cache.related).toEqual(["alpha", "gamma"]);
		expect(result.cache.aliases).toEqual(["Alias One", "Alias, Two"]);
		expect(result.cache.tags).toEqual(["area/test", "#area/next"]);
		expect(result.cache.cssclasses).toEqual(["wide", "readable"]);
		expect(result.relatedPills).toContain("gamma");
		expect(result.aliasesPills).toContain("Alias, Two");
		expect(result.cleanup.bodyDelta).toBe(0);
		expect(result.cleanup.documentListenerDelta).toBeLessThanOrEqual(0);
		expect(result.cleanup.modalCount).toBe(0);
		expect(result.cleanup.suggestionCount).toBe(0);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	// SKIPPED: driving Obsidian's native link-suggest popover via synthetic DOM
	// events inside an `obsidian eval` consistently wedges the obsidian-e2e
	// transport (the popover's real keyboard/focus handling deadlocks the eval),
	// so this assertion cannot run headlessly. Native widgets carry Obsidian's
	// own `[[` autocomplete by construction; the aliases path adds a fallback
	// suggester. Wikilink suggestions must be verified MANUALLY in a live vault
	// until a non-popover-driving harness approach exists. See PR discussion.
	test.skip("native wikilink suggestions work mounted in text, multitext, and aliases widgets", async () => {
		const {obsidian, sandbox} = getContext();
		const notePath = sandbox.path("native-wikilinks.md");
		await writeLiveFile(
			obsidian,
			notePath,
			"---\nsummary: old\nrelated:\n  - alpha\naliases:\n  - Alias One\n---\nbody\n",
		);
		await writeLiveFile(obsidian, sandbox.path("A, B.md"), "# A, B\n");
		await writeLiveFile(obsidian, sandbox.path("Native Text Target.md"), "# Target\n");

		const text = await verifyWikilinkSuggestion(obsidian, notePath, "summary", "Native Text Target", "text");
		const multitext = await verifyWikilinkSuggestion(obsidian, notePath, "related", "A, B", "pill");
		const aliases = await verifyWikilinkSuggestion(obsidian, notePath, "aliases", "A, B", "pill");

		expect(text.suggestionText).toContain("Native Text Target");
		expect(text.cacheValue).toMatch(/^\[\[.*Native Text Target.*\]\]$/);
		expect(multitext.suggestionText).toContain("A, B");
		expect(multitext.cacheValue).toHaveLength(2);
		expect((multitext.cacheValue as string[])[1]).toMatch(/^\[\[.*A, B.*\]\]$/);
		expect(aliases.suggestionText).toContain("A, B");
		expect(aliases.cacheValue).toHaveLength(2);
		expect((aliases.cacheValue as string[])[1]).toMatch(/^\[\[.*A, B.*\]\]$/);
		expect(multitext.pills).toContain("A, B");
		expect(aliases.pills.some(pill => pill?.includes("A, B"))).toBe(true);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("refuses a stale native modal write when frontmatter changes before save", async () => {
		const {obsidian, sandbox} = getContext();
		const notePath = sandbox.path("native-stale.md");
		await writeLiveFile(obsidian, notePath, "---\ncount: 1\n---\nbody\n");

		const result = await evalJsonAsync<{content?: string; cacheValue?: unknown; error?: string; modalCount?: number}>(
			obsidian,
			`
			(async () => {
				try {
					${NATIVE_HELPERS}
					const plugin = app.plugins.plugins.${PLUGIN_ID};
					const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
					app.metadataTypeManager.setType("count", "number");
					await sleep(200);

					const {promise, host} = await openNative(file, "count");
					setNativeInput(host, "2");
					await sleep(150);
					await app.fileManager.processFrontMatter(file, (frontmatter) => {
						frontmatter.count = 3;
					});
					await saveOpenModal(promise);
					await waitForCacheValue(file, "count", 3);

					return {
						content: await app.vault.read(file),
						cacheValue: app.metadataCache.getFileCache(file)?.frontmatter?.count,
						modalCount: document.querySelectorAll(".modal-container").length,
					};
				} catch (error) {
					return {
						error: error instanceof Error ? error.message : String(error),
						content: await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(notePath)})),
						cacheValue: app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${JSON.stringify(notePath)}))?.frontmatter?.count,
						modalCount: document.querySelectorAll(".modal-container").length,
					};
				}
			})()
			`,
		);

		expect(result.error).toBeUndefined();
		expect(result.cacheValue).toBe(3);
		expect(result.content).toContain("count: 3");
		expect(result.modalCount).toBe(0);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	// The pill's dropdown is an Obsidian Menu, which does not render in the
	// headless e2e instance (document.hasFocus() is false), so the actual
	// switch-and-save flow is verified manually in a live vault; this covers the
	// construction: the pill mounts with the resolved type and reserved keys lock.
	test("edit modal shows a type pill, locked for reserved keys", async () => {
		const {obsidian, sandbox} = getContext();
		const notePath = sandbox.path("native-type-pill.md");
		await writeLiveFile(obsidian, notePath, "---\nsummary: old\ntags:\n  - area/test\ntag:\n  - legacy\n---\nbody\n");

		const result = await evalJsonAsync<{
			summaryPill: {present: boolean; label: string | null; disabled: boolean | null};
			tagsPill: {present: boolean; label: string | null; disabled: boolean | null};
			singularTagPill: {present: boolean; label: string | null; disabled: boolean | null};
			modalCount: number;
			content: string;
		}>(
			obsidian,
			`
			(async () => {
				${NATIVE_HELPERS}
				const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
				app.metadataTypeManager.setType("summary", "text");
				await sleep(200);

				const readPill = () => {
					const modal = document.querySelector(".metaedit-native-property-prompt");
					const pill = modal?.querySelector(".metaedit-type-pill");
					return {
						present: !!pill,
						label: pill?.querySelector(".metaedit-type-pill-label")?.textContent ?? null,
						disabled: pill?.disabled ?? null,
					};
				};
				const cancelOpenModal = async (promise) => {
					Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Cancel")?.click();
					await promise;
					await sleep(150);
				};

				const summaryOpen = await openNative(file, "summary");
				const summaryPill = readPill();
				await cancelOpenModal(summaryOpen.promise);

				const tagsOpen = await openNative(file, "tags");
				const tagsPill = readPill();
				await cancelOpenModal(tagsOpen.promise);

				// The singular "tag" key is tag metadata for the whole write path
				// (isTagsKey), so it resolves to the tags widget and its pill locks,
				// exactly like "tags".
				const singularOpen = await openNative(file, "tag");
				const singularTagPill = readPill();
				await cancelOpenModal(singularOpen.promise);

				return {
					summaryPill,
					tagsPill,
					singularTagPill,
					modalCount: document.querySelectorAll(".modal-container").length,
					content: await app.vault.read(file),
				};
			})()
			`,
		);

		expect(result.summaryPill).toEqual({present: true, label: "Text", disabled: false});
		expect(result.tagsPill).toEqual({present: true, label: "Tags", disabled: true});
		expect(result.singularTagPill).toEqual({present: true, label: "Tags", disabled: true});
		expect(result.modalCount).toBe(0);
		expect(result.content).toContain("summary: old");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});
});

const NATIVE_HELPERS = String.raw`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (selector, predicate = () => true, timeout = 5000) => {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		const el = Array.from(document.querySelectorAll(selector)).find(predicate);
		if (el) return el;
		await sleep(80);
	}
	throw new Error("Timed out waiting for " + selector);
};

const waitForCache = async (file, key) => {
	const start = Date.now();
	while (Date.now() - start < 5000) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (frontmatter && Object.prototype.hasOwnProperty.call(frontmatter, key)) return frontmatter[key];
		await sleep(80);
	}
	throw new Error("Timed out waiting for cache key " + key);
};

const waitForCacheValue = async (file, key, expected) => {
	const start = Date.now();
	while (Date.now() - start < 5000) {
		const value = app.metadataCache.getFileCache(file)?.frontmatter?.[key];
		if (value === expected) return value;
		await sleep(80);
	}
	throw new Error("Timed out waiting for cache value " + key);
};

async function openNative(file, key) {
	const plugin = app.plugins.plugins.${PLUGIN_ID};
	const props = await plugin.controller.getPropertiesInFile(file);
	const property = props.find((prop) => prop.key === key);
	if (!property) throw new Error("Property not found: " + key);
	const promise = plugin.controller.editMetaElement(property, props, file);
	const host = await waitFor(".metaedit-native-property-host");
	return {promise, host};
}

async function saveOpenModal(promise) {
	const save = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Save");
	if (!save) throw new Error("Save button not found");
	save.click();
	const result = await Promise.race([
		promise.then(() => "resolved"),
		new Promise((resolve) => setTimeout(() => resolve("timeout"), 5000)),
	]);
	if (result !== "resolved") {
		Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Cancel")?.click();
		throw new Error("Native property modal did not close after Save");
	}
	await sleep(250);
}

function setContenteditable(host, value) {
	const input = host.querySelector("[contenteditable='true']");
	if (!input) throw new Error("contenteditable input not found");
	input.focus();
	document.execCommand("selectAll", false);
	if (value === "") document.execCommand("delete", false);
	else document.execCommand("insertText", false, value);
	input.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText", data: value}));
	input.dispatchEvent(new Event("blur", {bubbles: true}));
}

function setNativeInput(host, value) {
	const input = host.querySelector("input");
	if (!input) throw new Error("input not found");
	input.focus();
	input.value = value;
	input.dispatchEvent(new Event("input", {bubbles: true}));
	input.dispatchEvent(new Event("change", {bubbles: true}));
	input.dispatchEvent(new Event("blur", {bubbles: true}));
}

async function editText(file, key, value) {
	const {promise, host} = await openNative(file, key);
	setContenteditable(host, value);
	await saveOpenModal(promise);
}

async function editInput(file, key, value) {
	const {promise, host} = await openNative(file, key);
	setNativeInput(host, value);
	await saveOpenModal(promise);
}

async function editCheckbox(file, key, checked) {
	const {promise, host} = await openNative(file, key);
	const input = host.querySelector("input[type='checkbox']");
	if (!input) throw new Error("checkbox input not found");
	input.focus();
	if (input.checked !== checked) input.click();
	else input.dispatchEvent(new Event("change", {bubbles: true}));
	await saveOpenModal(promise);
}

async function addPill(file, key, value) {
	const {promise, host} = await openNative(file, key);
	const input = host.querySelector(".multi-select-input,[contenteditable='true']");
	if (!input) throw new Error("multi-select input not found");
	input.focus();
	document.execCommand("insertText", false, value);
	input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}));
	input.dispatchEvent(new KeyboardEvent("keyup", {key: "Enter", bubbles: true}));
	await sleep(200);
	const pills = Array.from(host.querySelectorAll(".multi-select-pill-content")).map((pill) => pill.textContent);
	await saveOpenModal(promise);
	return pills;
}

async function editTextWithWikilinkSuggestion(file, key, targetText) {
	const {promise, host} = await openNative(file, key);
	const input = host.querySelector("[contenteditable='true']");
	if (!input) throw new Error("text input not found");
	input.focus();
	document.execCommand("selectAll", false);
	document.execCommand("insertText", false, "[[");
	input.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText", data: "[["}));
	input.dispatchEvent(new KeyboardEvent("keyup", {key: "[", bubbles: true}));
	const suggestion = await waitFor(".suggestion-item", (el) => (el.textContent || "").includes(targetText));
	const suggestionText = suggestion.textContent?.trim() ?? null;
	suggestion.dispatchEvent(new MouseEvent("mousedown", {bubbles: true}));
	suggestion.dispatchEvent(new MouseEvent("mouseup", {bubbles: true}));
	suggestion.dispatchEvent(new MouseEvent("click", {bubbles: true}));
	await sleep(250);
	await saveOpenModal(promise);
	return suggestionText;
}

async function addPillWithWikilinkSuggestion(file, key, targetText) {
	const {promise, host} = await openNative(file, key);
	const input = host.querySelector(".multi-select-input,[contenteditable='true']");
	if (!input) throw new Error("multi-select input not found");
	input.focus();
	document.execCommand("insertText", false, "[[");
	input.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText", data: "[["}));
	input.dispatchEvent(new KeyboardEvent("keyup", {key: "[", bubbles: true}));
	const suggestion = await waitFor(".suggestion-item", (el) => (el.textContent || "").includes(targetText));
	const suggestionText = suggestion.textContent?.trim() ?? null;
	suggestion.dispatchEvent(new MouseEvent("mousedown", {bubbles: true}));
	suggestion.dispatchEvent(new MouseEvent("mouseup", {bubbles: true}));
	suggestion.dispatchEvent(new MouseEvent("click", {bubbles: true}));
	await sleep(250);
	input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}));
	input.dispatchEvent(new KeyboardEvent("keyup", {key: "Enter", bubbles: true}));
	await sleep(200);
	const pills = Array.from(host.querySelectorAll(".multi-select-pill-content")).map((pill) => pill.textContent);
	await saveOpenModal(promise);
	return {suggestionText, pills};
}

function beginCleanupMeasurement() {
	const bodyBefore = document.body.children.length;
	let adds = 0;
	let removes = 0;
	const originalAdd = document.addEventListener;
	const originalRemove = document.removeEventListener;
	document.addEventListener = function(...args) {
		adds++;
		return originalAdd.apply(this, args);
	};
	document.removeEventListener = function(...args) {
		removes++;
		return originalRemove.apply(this, args);
	};
	return {
		finish() {
			document.addEventListener = originalAdd;
			document.removeEventListener = originalRemove;
			return {
				bodyDelta: document.body.children.length - bodyBefore,
				documentListenerDelta: adds - removes,
				modalCount: document.querySelectorAll(".modal-container").length,
				suggestionCount: document.querySelectorAll(".suggestion-container").length,
			};
		}
	};
}
`;

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
			for (let i = 0; i < 40; i++) {
				const cache = app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(path));
				if (cache) break;
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
		})()
		`,
	);
}

async function verifyWikilinkSuggestion(
	obsidian: Parameters<typeof evalJsonAsync>[0],
	notePath: string,
	key: string,
	targetText: string,
	mode: "text" | "pill",
): Promise<{suggestionText: string | null; cacheValue: unknown; pills: string[]}> {
	return await evalJsonAsync(
		obsidian,
		`
		(async () => {
			${NATIVE_HELPERS}
			const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
			app.metadataTypeManager.setType("summary", "text");
			await sleep(600);
			const result = ${JSON.stringify(mode)} === "text"
				? {
					suggestionText: await editTextWithWikilinkSuggestion(file, ${JSON.stringify(key)}, ${JSON.stringify(targetText)}),
					pills: [],
				}
				: await addPillWithWikilinkSuggestion(file, ${JSON.stringify(key)}, ${JSON.stringify(targetText)});
			await waitForCache(file, ${JSON.stringify(key)});
			return {
				suggestionText: result.suggestionText,
				cacheValue: app.metadataCache.getFileCache(file)?.frontmatter?.[${JSON.stringify(key)}],
				pills: result.pills ?? [],
			};
		})()
		`,
	);
}
