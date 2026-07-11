import { PLUGIN_ID } from "./harness";

/**
 * In-app drivers for the NativePropertyPrompt (the modal `editMetaElement`
 * opens for eligible top-level YAML properties since PR #168): open the prompt,
 * drive Obsidian's own property widgets (contenteditable text, native inputs,
 * multi-select pills), and save/cancel through the real buttons. Interpolate
 * into an eval body; shared by native-properties.test.ts and
 * multi-value.test.ts so the two suites cannot drift apart. Real wall-clock
 * polling is required here: the code runs inside a live external Obsidian
 * process, which fake timers cannot drive.
 */
export const NATIVE_PROMPT_HELPERS_JS = String.raw`
const sleep = (ms) => {
	const {promise, resolve} = Promise.withResolvers();
	setTimeout(resolve, ms);
	return promise;
};

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
	const timeout = () => {
		const {promise: timer, resolve} = Promise.withResolvers();
		setTimeout(() => resolve("timeout"), 5000);
		return timer;
	};
	const result = await Promise.race([promise.then(() => "resolved"), timeout()]);
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

function pillTexts(host) {
	return Array.from(host.querySelectorAll(".multi-select-pill-content")).map((pill) => pill.textContent);
}

async function addPill(file, key, value) {
	const {promise, host} = await openNative(file, key);
	const pills = await addPillInHost(host, value);
	await saveOpenModal(promise);
	return pills;
}

// Typing into a multi-select opens a value/tag fuzzy-suggest popover whose
// scope owns Enter (it would commit the highlighted suggestion instead of the
// literal text). Escape closes just the popover - its scope sits above the
// modal's while open - so the following Enter commits what was typed.
async function dismissSuggestPopover(input) {
	await sleep(150);
	if (!document.querySelector(".suggestion-container")) return;
	input.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true}));
	await sleep(100);
}

async function addPillInHost(host, value) {
	const input = host.querySelector(".multi-select-input,[contenteditable='true']");
	if (!input) throw new Error("multi-select input not found");
	input.focus();
	document.execCommand("insertText", false, value);
	await dismissSuggestPopover(input);
	input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}));
	input.dispatchEvent(new KeyboardEvent("keyup", {key: "Enter", bubbles: true}));
	await sleep(200);
	return pillTexts(host);
}

// Edit an existing pill IN PLACE via Obsidian's real edit affordance: focus the
// pill, press Enter (the widget moves the pill's value into the multi-select
// input for editing), retype, press Enter to commit. Order is preserved, so
// callers can assert the exact resulting YAML list.
async function editPillByText(host, currentText, value) {
	// The widget renders its pills asynchronously after the host mounts.
	let pill = null;
	const start = Date.now();
	while (!pill && Date.now() - start < 5000) {
		pill = Array.from(host.querySelectorAll(".multi-select-pill"))
			.find((el) => el.querySelector(".multi-select-pill-content")?.textContent === currentText) ?? null;
		if (!pill) await sleep(80);
	}
	if (!pill) throw new Error("pill not found: " + currentText + " (have: " + JSON.stringify(pillTexts(host)) + "; host: " + host.outerHTML.slice(0, 400) + ")");
	pill.focus();
	pill.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}));
	await sleep(150);
	const input = document.activeElement;
	if (!input || input.getAttribute("contenteditable") !== "true") {
		throw new Error("pill edit did not focus the editable multi-select input");
	}
	document.execCommand("selectAll", false);
	document.execCommand("insertText", false, value);
	await dismissSuggestPopover(input);
	input.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}));
	input.dispatchEvent(new KeyboardEvent("keyup", {key: "Enter", bubbles: true}));
	await sleep(150);
	return pillTexts(host);
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
	const pills = pillTexts(host);
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
