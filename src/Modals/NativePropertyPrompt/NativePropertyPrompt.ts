import {Modal, Notice, Setting, type App, type ButtonComponent, type TFile} from "obsidian";
import type {Property} from "../../parser";
import {
	normalizeWidgetValue,
	resolveNativeProperty,
	type NativePropertyPromptResult,
	type NativePropertyWidget,
	type StandardNativePropertyType,
	type NativeValueSource,
} from "../../typedProperties/nativePropertyTypes";
import {NativeWikilinkSuggester} from "./nativeWikilinkSuggester";

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

export default class NativePropertyPrompt extends Modal {
	private readonly file: TFile;
	private readonly property: Property;
	private resolvePromise: (result: NativePropertyPromptResult) => void;
	private readonly initialBodyChildren: Set<Element>;
	private readonly cleanupCallbacks: Array<() => void> = [];
	private readonly valueSource: NativeValueSource;
	private readonly type: StandardNativePropertyType;
	private fallbackInputEl: HTMLInputElement | null = null;
	private hostEl: HTMLElement;
	private widgetInstance: unknown;
	private lastValue: unknown;
	private result: NativePropertyPromptResult = {kind: "cancel"};
	private didFinish = false;
	private didResolve = false;
	private didReceiveChange = false;
	private didEditDom = false;
	private renderFailed = false;
	private saveButton: ButtonComponent | null = null;

	public readonly waitForClose: Promise<NativePropertyPromptResult>;

	public static Prompt(app: App, file: TFile, property: Property): Promise<NativePropertyPromptResult> {
		const modal = new NativePropertyPrompt(app, file, property);
		return modal.waitForClose;
	}

	private constructor(app: App, file: TFile, property: Property) {
		super(app);
		this.file = file;
		this.property = property;
		this.lastValue = property.content;
		this.initialBodyChildren = new Set(Array.from(activeDocument.body.children));
		this.waitForClose = new Promise<NativePropertyPromptResult>((resolve) => {
			this.resolvePromise = resolve;
		});

		this.contentEl.addClass("metaedit-native-property-prompt");
		new Setting(this.contentEl)
			.setHeading()
			.setName(`Edit ${property.key}`);

		const rowEl = this.contentEl.createDiv({cls: "metadata-property metaedit-native-property-row"});
		this.hostEl = rowEl.createDiv({cls: "metadata-property-value metaedit-native-property-host"});

		const resolution = resolveNativeProperty(app, property);
		this.type = resolution.type;
		this.valueSource = resolution.kind === "native" ? "native" : "fallback";

		if (resolution.kind === "native") {
			this.mountNativeWidget(resolution.widget);
		} else {
			this.mountFallbackInput(resolution.reason);
		}

		new Setting(this.contentEl)
			.addButton(button => {
				this.saveButton = button;
				button
					.setButtonText("Save")
					.setCta()
					.setDisabled(this.renderFailed)
					.onClick(() => this.submit());
			})
			.addButton(button => {
				button
					.setButtonText("Cancel")
					.onClick(() => this.cancel());
			});

		this.open();
	}

	onOpen(): void {
		super.onOpen();
		this.focusInitialEditor();
	}

	onClose(): void {
		super.onClose();
		this.cleanup();
		if (!this.didFinish) this.result = {kind: "cancel"};
		this.resolveOnce();
	}

	private mountNativeWidget(widget: NativePropertyWidget): void {
		this.trackWidgetDomActivity();
		try {
			this.widgetInstance = widget.render?.(this.hostEl, this.property.content, {
				app: this.app,
				key: this.property.key,
				sourcePath: this.file.path,
				onChange: (value: unknown) => {
					this.lastValue = value;
					this.didReceiveChange = true;
				},
				blur: () => undefined,
			});
			this.installAliasesWikilinkFallback();
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			this.renderFailed = true;
			this.hostEl.empty();
			this.hostEl.createDiv({
				cls: "metaedit-native-property-error",
				text: `MetaEdit could not render Obsidian's native editor for '${this.property.key}'.`,
			});
			this.saveButton?.setDisabled(true);
			new Notice(`MetaEdit could not render Obsidian's native editor for '${this.property.key}': ${reason}`);
		}
	}

	private installAliasesWikilinkFallback(): void {
		if (this.type !== "aliases") return;

		const inputEl = this.hostEl.querySelector<HTMLElement>(".multi-select-input[contenteditable='true']");
		if (!inputEl) return;

		const suggester = new NativeWikilinkSuggester(this.app, inputEl, this.file.path);
		this.cleanupCallbacks.push(() => suggester.destroy());
	}

	private mountFallbackInput(reason: string): void {
		this.hostEl.createDiv({
			cls: "metaedit-native-property-fallback-note",
			text: reason,
		});
		const inputEl = this.hostEl.createEl("input", {
			cls: "metadata-input metadata-input-text metaedit-native-property-fallback-input",
			type: "text",
		});
		inputEl.value = this.property.content === null || this.property.content === undefined
			? ""
			: String(this.property.content);
		inputEl.addEventListener("input", () => {
			this.lastValue = inputEl.value;
			this.didReceiveChange = true;
		});
		this.fallbackInputEl = inputEl;
	}

	private trackWidgetDomActivity(): void {
		const markEdited = (evt: Event) => {
			if (evt instanceof KeyboardEvent && !isEditingKey(evt)) return;
			this.didEditDom = true;
		};
		const events: Array<keyof HTMLElementEventMap> = ["input", "change", "paste", "compositionend", "keydown"];
		for (const eventName of events) {
			this.hostEl.addEventListener(eventName, markEdited, true);
			this.cleanupCallbacks.push(() => this.hostEl.removeEventListener(eventName, markEdited, true));
		}
	}

	private submit(): void {
		this.flushFocusedWidget();

		if (this.valueSource === "native" && this.didEditDom && !this.didReceiveChange) {
			new Notice(`MetaEdit did not receive a value from Obsidian's native editor for '${this.property.key}'. Nothing was written.`);
			return;
		}

		if (!this.didReceiveChange) {
			this.finish({
				kind: "submit",
				changed: false,
				type: this.type,
				value: this.property.content,
				valueSource: this.valueSource,
			});
			return;
		}

		const normalized = normalizeWidgetValue(this.type, this.lastValue, this.valueSource);
		if (normalized.ok === false) {
			new Notice(`MetaEdit could not update '${this.property.key}': ${normalized.reason}`);
			return;
		}

		this.finish({
			kind: "submit",
			changed: true,
			type: this.type,
			value: normalized.value,
			valueSource: this.valueSource,
		});
	}

	private cancel(): void {
		this.finish({kind: "cancel"});
	}

	private finish(result: NativePropertyPromptResult, closeModal: boolean = true): void {
		this.result = result;
		this.didFinish = true;
		if (closeModal) this.close();
		else this.resolveOnce();
	}

	private resolveOnce(): void {
		if (this.didResolve) return;
		this.didResolve = true;
		this.resolvePromise(this.result);
	}

	private focusInitialEditor(): void {
		const fallbackInput = this.fallbackInputEl;
		if (fallbackInput) {
			fallbackInput.focus();
			fallbackInput.select();
			return;
		}

		const focusable = this.hostEl.querySelector<HTMLElement>(
			"input, textarea, [contenteditable='true'], button, select",
		);
		focusable?.focus();
	}

	private flushFocusedWidget(): void {
		const active = activeDocument.activeElement;
		if (active instanceof HTMLElement && this.hostEl.contains(active)) {
			active.blur();
		}
	}

	private cleanup(): void {
		for (const callback of this.cleanupCallbacks.splice(0)) {
			try {
				callback();
			} catch {
				// Best-effort cleanup only.
			}
		}

		this.closeWidgetLifecycle(this.widgetInstance);
		this.removeBodyPortalsCreatedByWidget();
		this.hostEl.remove();
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
			if (this.initialBodyChildren.has(el)) continue;
			el.remove();
		}
	}
}

function isEditingKey(evt: KeyboardEvent): boolean {
	if (evt.metaKey || evt.ctrlKey || evt.altKey) return false;
	if (evt.key.length === 1) return true;
	return EDITING_KEYS.has(evt.key);
}
