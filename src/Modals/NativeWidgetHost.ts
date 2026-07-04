import {Notice, type App} from "obsidian";
import {
	getNativeWidgetForType,
	type NativePropertyWidget,
	type NativeValueSource,
	type StandardNativePropertyType,
} from "../typedProperties/nativePropertyTypes";
import {NativeWikilinkSuggester} from "./NativePropertyPrompt/nativeWikilinkSuggester";

type WidgetLifecycleOwner = {
	close?: unknown;
	destroy?: unknown;
	unload?: unknown;
	multiselect?: unknown;
	suggest?: unknown;
	suggester?: unknown;
	suggestEl?: unknown;
	hoverPopover?: unknown;
	popover?: unknown;
};

const BODY_PORTAL_SELECTOR = ".suggestion-container, .popover, .hover-popover";
const EDITING_KEYS = new Set([
	"Backspace",
	"Delete",
	"Enter",
	"Spacebar",
	" ",
]);

export interface NativeWidgetHostOptions {
	app: App;
	hostEl: HTMLElement;
	sourcePath: string;
	key: string;
	onChange?: (value: unknown) => void;
}

/**
 * Owns the lifecycle of a single mounted Obsidian native property widget inside a
 * host element: mounting (or re-mounting) the widget for a given type + seed
 * value, tracking whether the user edited it and whether it reported a value,
 * cleaning up the widget instance and any body-level popovers it opened, and
 * focusing it. Extracted from NativePropertyPrompt (PR #168) so the edit prompt
 * and the fluid create modal share one battle-tested widget host instead of
 * duplicating its subtle teardown/portal logic.
 *
 * Re-mount safety: every mount snapshots the body's popover portals FIRST and, on
 * the next teardown, removes only portals that appeared during that widget's life
 * - so re-mounting on a type switch never deletes a sibling UI's popover (the key
 * suggester, the type menu) nor leaks the outgoing widget's own. Both edit-tracking
 * flags reset on every mount, so the fail-closed guard always reasons about the
 * CURRENT widget only.
 */
export class NativeWidgetHost {
	private readonly app: App;
	private readonly hostEl: HTMLElement;
	private readonly sourcePath: string;
	private readonly onChangeCallback?: (value: unknown) => void;

	/** The property key the widget is mounted for; update via {@link setKey} before a re-mount. */
	public key: string;

	private widgetInstance: unknown = null;
	private preMountBodyChildren: Set<Element> = new Set();
	private readonly perMountCleanup: Array<() => void> = [];

	private lastValueInternal: unknown;
	private typeInternal: StandardNativePropertyType = "text";
	private valueSourceInternal: NativeValueSource = "native";
	private didReceiveChangeInternal = false;
	private didEditDomInternal = false;
	private renderFailedInternal = false;

	constructor(options: NativeWidgetHostOptions) {
		this.app = options.app;
		this.hostEl = options.hostEl;
		this.sourcePath = options.sourcePath;
		this.key = options.key;
		this.onChangeCallback = options.onChange;
	}

	public get value(): unknown {
		return this.lastValueInternal;
	}

	public get type(): StandardNativePropertyType {
		return this.typeInternal;
	}

	public get valueSource(): NativeValueSource {
		return this.valueSourceInternal;
	}

	public get didReceiveChange(): boolean {
		return this.didReceiveChangeInternal;
	}

	public get didEditDom(): boolean {
		return this.didEditDomInternal;
	}

	public get renderFailed(): boolean {
		return this.renderFailedInternal;
	}

	public setKey(key: string): void {
		this.key = key;
	}

	/**
	 * Mount `type`'s native widget seeded with `value`, tearing down any currently
	 * mounted widget first. Falls back to a plain text input when the native widget
	 * is unavailable. `lastValue` starts at the seed so an untouched widget commits
	 * exactly what was mounted.
	 */
	public mountNative(type: StandardNativePropertyType, value: unknown): void {
		const widget = getNativeWidgetForType(this.app, type);
		if (!widget) {
			this.mountFallback(`Obsidian's native ${type} property widget is not available.`, value);
			this.typeInternal = type;
			return;
		}

		this.beginMount(type, value, "native");
		try {
			this.widgetInstance = widget.render?.(this.hostEl, value, {
				app: this.app,
				key: this.key,
				sourcePath: this.sourcePath,
				onChange: (changed: unknown) => {
					this.lastValueInternal = changed;
					this.didReceiveChangeInternal = true;
					this.onChangeCallback?.(changed);
				},
				blur: () => undefined,
			});
			this.installAliasesWikilinkFallback(type);
		} catch (error) {
			this.handleRenderFailure(type, error, widget);
		}
	}

	/** Mount a plain text input (native widgets unavailable, or a render failure fallback). */
	public mountFallback(reason: string, value: unknown): void {
		this.beginMount("text", value, "fallback");

		this.hostEl.createDiv({
			cls: "metaedit-native-property-fallback-note",
			text: reason,
		});
		const inputEl = this.hostEl.createEl("input", {
			cls: "metadata-input metadata-input-text metaedit-native-property-fallback-input",
			type: "text",
		});
		inputEl.value = value === null || value === undefined ? "" : String(value);
		const onInput = () => {
			this.lastValueInternal = inputEl.value;
			this.didReceiveChangeInternal = true;
			this.onChangeCallback?.(inputEl.value);
		};
		inputEl.addEventListener("input", onInput);
		this.perMountCleanup.push(() => inputEl.removeEventListener("input", onInput));
	}

	public focus(): void {
		const focusable = this.hostEl.querySelector<HTMLElement>(
			"input, textarea, [contenteditable='true'], select, button",
		);
		if (!focusable) return;
		focusable.focus();
		if (focusable instanceof HTMLInputElement && focusable.type === "text") focusable.select();
	}

	/** Blur the focused editor if it lives in this host, so a pending edit flushes to onChange before submit. */
	public flushFocus(): void {
		const active = activeDocument.activeElement;
		if (active instanceof HTMLElement && this.hostEl.contains(active)) {
			active.blur();
		}
	}

	/**
	 * Whether the mounted editor is a genuinely single-line control (a real
	 * `<input>`/`<select>`, e.g. number/date/datetime) rather than a multi-line
	 * contenteditable (the text longtext editor) or a chip editor. Used to decide
	 * whether plain Enter should commit: in a single-line control it can, matching
	 * Obsidian; in a contenteditable/chip editor Enter belongs to the widget.
	 */
	public isSingleLineEditor(): boolean {
		if (this.hostEl.querySelector(".multi-select-container")) return false;
		if (this.hostEl.querySelector("[contenteditable='true']")) return false;
		const focusable = this.hostEl.querySelector("input, select, textarea");
		if (focusable instanceof HTMLTextAreaElement) return false;
		if (focusable instanceof HTMLInputElement) return focusable.type !== "checkbox";
		return focusable instanceof HTMLSelectElement;
	}

	/**
	 * The current value as raw text, for carrying across a type switch. Prefers a
	 * live editor's in-progress text; otherwise falls back to the last reported
	 * value stringified, so switching away from a checkbox/number/list still
	 * carries its state (a checkbox -> "true"/"false", a list -> its comma-joined
	 * items) rather than dropping to empty.
	 */
	public readRawText(): string {
		return carryTextFromEditor(this.readEditorText(), this.lastValueInternal);
	}

	/**
	 * The live text of the mounted editor, or null when there is no text editor at
	 * all (e.g. a checkbox). An EXISTING but empty editor returns "" (not null), so a
	 * cleared value is carried as empty rather than resurrecting the stale lastValue.
	 */
	private readEditorText(): string | null {
		// A chip editor's contenteditable is only the in-progress ENTRY field; the
		// committed chips live in lastValue. Report "no text editor" so the carry
		// falls back to the chip list (comma-joined) instead of reading the usually
		// empty entry field and dropping every chip on a type switch.
		if (this.hostEl.querySelector(".multi-select-container")) return null;
		const input = this.hostEl.querySelector<HTMLInputElement>("input:not([type='checkbox']), textarea");
		if (input) return input.value ?? "";
		const editable = this.hostEl.querySelector<HTMLElement>("[contenteditable='true']");
		if (editable) return editable.textContent ?? "";
		return null;
	}

	public destroy(): void {
		this.teardownCurrent();
	}

	private beginMount(type: StandardNativePropertyType, value: unknown, valueSource: NativeValueSource): void {
		this.teardownCurrent();
		this.preMountBodyChildren = new Set(Array.from(activeDocument.body.children));
		this.typeInternal = type;
		this.valueSourceInternal = valueSource;
		this.lastValueInternal = value;
		this.didReceiveChangeInternal = false;
		this.didEditDomInternal = false;
		this.renderFailedInternal = false;
		this.trackDomActivity();
	}

	private handleRenderFailure(type: StandardNativePropertyType, error: unknown, widget: NativePropertyWidget): void {
		const reason = error instanceof Error ? error.message : String(error);
		this.renderFailedInternal = true;
		this.hostEl.empty();
		this.hostEl.createDiv({
			cls: "metaedit-native-property-error",
			text: `MetaEdit could not render Obsidian's native editor for '${this.key}'.`,
		});
		new Notice(`MetaEdit could not render Obsidian's native editor for '${this.key}': ${reason}`);
		void widget;
	}

	private installAliasesWikilinkFallback(type: StandardNativePropertyType): void {
		// Only aliases needs the manual `[[` suggester; the other list/text widgets
		// carry Obsidian's own link autocomplete (verified in #168).
		if (type !== "aliases") return;

		const inputEl = this.hostEl.querySelector<HTMLElement>(".multi-select-input[contenteditable='true']");
		if (!inputEl) return;

		const suggester = new NativeWikilinkSuggester(this.app, inputEl, this.sourcePath);
		this.perMountCleanup.push(() => suggester.destroy());
	}

	private trackDomActivity(): void {
		const markEdited = (evt: Event) => {
			if (evt instanceof KeyboardEvent && !isEditingKey(evt)) return;
			this.didEditDomInternal = true;
		};
		const events: Array<keyof HTMLElementEventMap> = ["input", "change", "paste", "compositionend", "keydown"];
		for (const eventName of events) {
			this.hostEl.addEventListener(eventName, markEdited, true);
			this.perMountCleanup.push(() => this.hostEl.removeEventListener(eventName, markEdited, true));
		}
	}

	private teardownCurrent(): void {
		for (const callback of this.perMountCleanup.splice(0)) {
			try {
				callback();
			} catch {
				// Best-effort cleanup only.
			}
		}

		this.closeWidgetLifecycle(this.widgetInstance);
		this.widgetInstance = null;
		this.removeBodyPortalsCreatedByWidget();
		this.hostEl.empty();
	}

	private closeWidgetLifecycle(value: unknown): void {
		const seen = new Set<unknown>();
		const visit = (candidate: unknown) => {
			if (!candidate || seen.has(candidate)) return;
			seen.add(candidate);

			const owner = candidate as WidgetLifecycleOwner;
			for (const method of ["close", "destroy", "unload"] as const) {
				const fn = owner[method];
				if (typeof fn !== "function") continue;
				try {
					fn.call(candidate);
				} catch {
					// Private widget cleanup is best-effort.
				}
			}

			for (const key of ["multiselect", "suggest", "suggester", "suggestEl", "hoverPopover", "popover"] as const) {
				visit(owner[key]);
			}
		};

		visit(value);
	}

	private removeBodyPortalsCreatedByWidget(): void {
		for (const el of Array.from(activeDocument.querySelectorAll(BODY_PORTAL_SELECTOR))) {
			if (this.preMountBodyChildren.has(el)) continue;
			el.remove();
		}
	}
}

/**
 * Decide the text to carry across a type switch: the live editor text when a text
 * editor exists (even when empty, so a cleared value stays cleared), otherwise the
 * last reported value stringified (so a checkbox/number with no text editor still
 * carries). `editorText === null` means "no text editor"; "" means "empty editor".
 */
export function carryTextFromEditor(editorText: string | null, lastValue: unknown): string {
	return editorText === null ? stringifyForCarry(lastValue) : editorText;
}

export function stringifyForCarry(value: unknown): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.map(item => String(item ?? "")).filter(Boolean).join(", ");
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	// Both boolean values are real data (an existing `done: false` switched to
	// Text must carry "false", not silently become empty); only null/undefined
	// carry as empty.
	if (typeof value === "boolean") return String(value);
	return "";
}

function isEditingKey(evt: KeyboardEvent): boolean {
	if (evt.metaKey || evt.ctrlKey || evt.altKey) return false;
	if (evt.key.length === 1) return true;
	return EDITING_KEYS.has(evt.key);
}
