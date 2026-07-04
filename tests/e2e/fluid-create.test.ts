import {describe, expect, test} from "vitest";
import {createMetaEditE2EHarness, evalJsonAsync, PLUGIN_ID} from "./harness";

const getContext = createMetaEditE2EHarness("fluid-create");

// CI E2E is deliberately WEDGE-SAFE and light. Driving the modal with synthetic
// KEYBOARD events (Enter to settle the key) or driving a native suggest/value
// POPOVER deadlocks the obsidian-e2e package transport (it works via the CLI, but
// not here). So the CI test drives the modal only with `input` events + button
// clicks: it asserts the modal renders the default native widget, the type pill,
// and the validity/reserved-key guards, then the write path directly (no modal).
// The keyboard-driven behaviors - vault-known type auto-adopt, value round-trips
// through each widget, the inference hint + accept, and the type-menu pick - are
// proven by live CLI DOM-state verification recorded in the PR, and their pure
// logic (resolveCreationType/inferCreationTypeFromText/seedFromRawText/
// emptyValueForType) is exhaustively unit-tested.
describe("MetaEdit fluid property creation", () => {
	test("the create modal renders the default native widget and enforces the key guards", async () => {
		const {obsidian, sandbox} = getContext();
		const notePath = sandbox.path("fluid-create-modal.md");
		await writeLiveFile(obsidian, notePath, "---\ntaken: 1\n---\nbody\n");

		const result = await evalJsonAsync<{
			defaultWidget: string;
			defaultPill: string | null;
			addDisabledEmpty: boolean;
			reservedAddDisabled: boolean;
			reservedWarned: boolean;
			duplicateAddDisabled: boolean;
			validAddEnabled: boolean;
			modalCount: number;
			cacheKeys: string[];
		}>(
			obsidian,
			`
			(async () => {
				${FLUID_HELPERS}
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
				const out = {};

				const {promise, modal} = await openCreate(file, ["taken"]);
				const host = valueHost(modal);
				out.defaultWidget = host.querySelector("[contenteditable='true']") ? "contenteditable" : host.innerHTML.slice(0, 40);
				out.defaultPill = pillLabel(modal);
				out.addDisabledEmpty = addButton(modal).disabled;

				setKeyText(modal, "__proto__");
				await sleep(90);
				out.reservedAddDisabled = addButton(modal).disabled;
				const warn = modal.querySelector(".metaedit-fluid-create-warning");
				out.reservedWarned = warn && warn.style.display !== "none" && warn.textContent.length > 0;

				setKeyText(modal, "taken");
				await sleep(90);
				out.duplicateAddDisabled = addButton(modal).disabled;

				setKeyText(modal, "brandnew");
				await sleep(90);
				out.validAddEnabled = !addButton(modal).disabled;

				cancel(modal);
				await promise;

				out.modalCount = document.querySelectorAll(".modal-container").length;
				out.cacheKeys = Object.keys(app.metadataCache.getFileCache(file)?.frontmatter ?? {});
				return out;
			})()
			`,
		);

		expect(result.defaultWidget).toBe("contenteditable");
		expect(result.defaultPill).toBe("Text");
		expect(result.addDisabledEmpty).toBe(true);
		expect(result.reservedAddDisabled).toBe(true);
		expect(result.reservedWarned).toBe(true);
		expect(result.duplicateAddDisabled).toBe(true);
		expect(result.validAddEnabled).toBe(true);
		expect(result.modalCount).toBe(0);
		expect(result.cacheKeys).toEqual(["taken"]); // cancelled: nothing written
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("layout: no horizontal overflow, compact height, and the floating dropdown never covers the buttons", async () => {
		const {obsidian, sandbox} = getContext();
		const notePath = sandbox.path("fluid-create-layout.md");
		await writeLiveFile(obsidian, notePath, "---\n---\nbody\n");

		const result = await evalJsonAsync<{
			modalOverflowX: boolean;
			rowOverflowX: boolean;
			hostRightWithinModal: boolean;
			gapRowToButtons: number;
			dropdownItems: number;
			dropdownHeight: number;
			coversAdd: boolean;
			coversCancel: boolean;
		}>(
			obsidian,
			`
			(async () => {
				${FLUID_HELPERS}
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
				const names = Array.from({length: 30}, (_, i) => "layoutProbeKey" + i);
				const promise = plugin.controller.createNewYamlPropertyFluid(file, names, new Set());
				const modal = await waitFor(".metaedit-fluid-create");
				const row = modal.querySelector(".metaedit-fluid-create-row");
				const host = modal.querySelector(".metaedit-fluid-create-value");
				const modalBox = modal.closest(".modal");
				const add = Array.from(modal.querySelectorAll("button")).find(b => b.textContent.trim() === "Add");
				const cancelBtn = Array.from(modal.querySelectorAll("button")).find(b => b.textContent.trim() === "Cancel");
				const intersects = (a, c) => a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top;
				const out = {
					modalOverflowX: modal.scrollWidth > modal.clientWidth,
					rowOverflowX: row.scrollWidth > row.clientWidth,
					hostRightWithinModal: Math.round(host.getBoundingClientRect().right) <= Math.round(modalBox.getBoundingClientRect().right),
					// Compact: only a little breathing room between the row and the buttons (no reserved dead space).
					gapRowToButtons: Math.round(add.getBoundingClientRect().top - row.getBoundingClientRect().bottom),
				};
				// Open the key dropdown with an input event only (no keyboard-to-selection).
				const key = modal.querySelector(".metaedit-fluid-create-key");
				key.focus();
				key.value = "layoutProbeKey";
				key.dispatchEvent(new Event("input", {bubbles: true}));
				await sleep(350);
				const dd = document.querySelector(".suggestion-container.metaedit-fluid-create-suggest");
				out.dropdownItems = dd ? dd.querySelectorAll(".suggestion-item").length : 0;
				out.dropdownHeight = dd ? Math.round(dd.getBoundingClientRect().height) : 0;
				// 2D intersection: the floating dropdown must not visually cover either button.
				out.coversAdd = dd ? intersects(dd.getBoundingClientRect(), add.getBoundingClientRect()) : true;
				out.coversCancel = dd ? intersects(dd.getBoundingClientRect(), cancelBtn.getBoundingClientRect()) : true;
				cancel(modal);
				await promise;
				document.querySelectorAll(".suggestion-container").forEach(e => e.remove());
				return out;
			})()
			`,
		);

		expect(result.modalOverflowX).toBe(false);
		expect(result.rowOverflowX).toBe(false);
		expect(result.hostRightWithinModal).toBe(true);
		expect(result.gapRowToButtons).toBeLessThan(80); // compact: no big reserved gap
		expect(result.dropdownItems).toBeGreaterThan(0); // dropdown actually opened
		expect(result.dropdownHeight).toBeLessThanOrEqual(200); // capped (~6-7 rows + scroll)
		expect(result.coversAdd).toBe(false); // floating dropdown never covers the buttons
		expect(result.coversCancel).toBe(false);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("the write path: chosen native type wins over EditMode, tags stay as-is, create-guard holds", async () => {
		const {obsidian, sandbox} = getContext();
		const notePath = sandbox.path("fluid-create-writepath.md");
		await writeLiveFile(obsidian, notePath, "---\nexisting: 1\n---\nbody\n");

		const result = await evalJsonAsync<{cache: Record<string, unknown>; content: string}>(
			obsidian,
			`
			(async () => {
				${FLUID_HELPERS}
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});

				// A chosen native SCALAR type must NOT be list-wrapped, even under AllMulti.
				const prevMode = plugin.settings.EditMode.mode;
				plugin.settings.EditMode.mode = "All Multi";
				await plugin.controller.createNativeYamlProperty("estimate", 5, file);
				await plugin.controller.createNativeYamlProperty("done", false, file);
				plugin.settings.EditMode.mode = prevMode;

				// A list value writes as-is; tags are NOT canonicalized (matches native edit).
				await plugin.controller.createNativeYamlProperty("related", ["alpha", "beta"], file);
				await plugin.controller.createNativeYamlProperty("tags", ["#area/next", "area/test"], file);

				// Create-guard: never clobber a key that already exists.
				await plugin.controller.createNativeYamlProperty("existing", 999, file);

				await waitCache(file, "tags");
				return {
					cache: {...app.metadataCache.getFileCache(file)?.frontmatter},
					content: await app.vault.read(file),
				};
			})()
			`,
		);

		expect(result.cache.estimate).toBe(5);
		expect(result.cache.done).toBe(false);
		expect(result.content).toContain("estimate: 5");
		expect(result.cache.related).toEqual(["alpha", "beta"]);
		expect(result.cache.tags).toEqual(["#area/next", "area/test"]);
		expect(result.cache.existing).toBe(1); // create-guard preserved the original
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});
});

const FLUID_HELPERS = String.raw`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (selector, timeout = 5000) => {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		const el = document.querySelector(selector);
		if (el) return el;
		await sleep(70);
	}
	throw new Error("Timed out waiting for " + selector);
};

const waitCache = async (file, key) => {
	const start = Date.now();
	while (Date.now() - start < 5000) {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter;
		if (fm && Object.prototype.hasOwnProperty.call(fm, key)) return fm[key];
		await sleep(70);
	}
	throw new Error("Timed out waiting for cache key " + key);
};

async function openCreate(file, existingKeys = []) {
	const plugin = app.plugins.plugins.${PLUGIN_ID};
	// No key suggestions: keeps the key-name suggester popover out of the transport.
	// existingKeys mirrors what the suggester passes (the note's current keys).
	const promise = plugin.controller.createNewYamlPropertyFluid(file, [], new Set(existingKeys));
	const modal = await waitFor(".metaedit-fluid-create");
	return {promise, modal};
}

function valueHost(modal) {
	return modal.querySelector(".metaedit-fluid-create-value");
}

function pillLabel(modal) {
	return modal.querySelector(".metaedit-type-pill-label")?.textContent ?? null;
}

function addButton(modal) {
	return Array.from(modal.querySelectorAll("button")).find((b) => b.textContent.trim() === "Add");
}

// Set the key via an input event only (no keyboard events, which would wedge the
// transport). This exercises the validity/guard logic without settling the type.
function setKeyText(modal, key) {
	const input = modal.querySelector(".metaedit-fluid-create-key");
	input.value = key;
	input.dispatchEvent(new Event("input", {bubbles: true}));
}

function cancel(modal) {
	Array.from(modal.querySelectorAll("button")).find((b) => b.textContent.trim() === "Cancel").click();
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
