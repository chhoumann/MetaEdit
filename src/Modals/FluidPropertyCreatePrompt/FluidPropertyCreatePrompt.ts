import {Menu, Modal, Notice, Setting, setIcon, setTooltip, type App, type ButtonComponent} from "obsidian";
import {
	CREATION_TYPE_CHOICES,
	emptyValueForType,
	getNativeWidgetForType,
	inferCreationTypeFromText,
	normalizeWidgetValue,
	resolveCreationType,
	seedFromRawText,
	type NativeValueSource,
	type StandardNativePropertyType,
} from "../../typedProperties/nativePropertyTypes";
import {isReservedFrontmatterKey} from "../../yamlPath";
import {NativeWidgetHost} from "../NativeWidgetHost";
import {GenericTextSuggester} from "../GenericPrompt/genericTextSuggester";

export type FluidPropertyCreateResult =
	| {
		kind: "submit";
		key: string;
		type: StandardNativePropertyType;
		value: unknown;
		valueSource: NativeValueSource;
	}
	| {kind: "autoProperty"; key: string}
	| {kind: "cancel"};

export interface FluidPropertyCreateOptions {
	sourcePath: string;
	suggestValues: string[];
	existingKeys: ReadonlySet<string>;
	hasAutoProperty: (key: string) => boolean;
}

// Reserved keys with a dedicated Obsidian widget lock the type picker (switching a
// `tags`/`aliases` property to Number is nonsense). `cssclasses` maps to the List
// widget and needs no lock.
const LOCKED_TYPES: ReadonlySet<StandardNativePropertyType> = new Set(["tags", "aliases"]);
const FALLBACK_ICONS: Record<StandardNativePropertyType, string> = {
	text: "text",
	multitext: "list",
	number: "binary",
	checkbox: "check-square",
	date: "calendar",
	datetime: "clock",
	tags: "tags",
	aliases: "text",
	cssclasses: "list",
};

/**
 * A single keyboard-first modal for creating a new YAML frontmatter property,
 * cloning the FEEL of Obsidian's own add-property row: a type pill, a key input
 * with known-name suggestions, and an adaptive value host that mounts Obsidian's
 * native widget for the current type. A key the vault already knows auto-adopts
 * its type; a brand-new key defaults to text and the user can switch fluidly.
 *
 * Resolves a discriminated result (never truthiness): `submit` with the typed
 * value, `autoProperty` to hand a key back to its Auto Property flow, or `cancel`.
 */
export default class FluidPropertyCreatePrompt extends Modal {
	private readonly opts: FluidPropertyCreateOptions;
	private resolvePromise: (result: FluidPropertyCreateResult) => void;

	private keyInputEl: HTMLInputElement;
	private hostEl: HTMLElement;
	private typePillEl: HTMLButtonElement;
	private typePillIconEl: HTMLElement;
	private typePillLabelEl: HTMLElement;
	private hintEl: HTMLElement;
	private warningEl: HTMLElement;
	private autoPropertyNoteEl: HTMLElement;
	private addButton: ButtonComponent | null = null;

	private host: NativeWidgetHost;
	private keySuggester: GenericTextSuggester | undefined;

	private pinnedType = false;
	private autoPropertyKey = false;
	private lastSettledKey: string | null = null;
	private inferredType: StandardNativePropertyType | null = null;

	private result: FluidPropertyCreateResult = {kind: "cancel"};
	private didFinish = false;
	private didResolve = false;

	public readonly waitForClose: Promise<FluidPropertyCreateResult>;

	public static Open(app: App, options: FluidPropertyCreateOptions): Promise<FluidPropertyCreateResult> {
		return new FluidPropertyCreatePrompt(app, options).waitForClose;
	}

	private constructor(app: App, options: FluidPropertyCreateOptions) {
		super(app);
		this.opts = options;
		this.waitForClose = new Promise((resolve) => {
			this.resolvePromise = resolve;
		});

		this.contentEl.addClass("metaedit-fluid-create");
		new Setting(this.contentEl).setHeading().setName("New property");

		const rowEl = this.contentEl.createDiv({cls: "metadata-property metaedit-fluid-create-row"});

		this.typePillEl = rowEl.createEl("button", {cls: "metaedit-fluid-create-type"});
		this.typePillEl.type = "button";
		this.typePillIconEl = this.typePillEl.createSpan({cls: "metaedit-fluid-create-type-icon"});
		this.typePillLabelEl = this.typePillEl.createSpan({cls: "metaedit-fluid-create-type-label"});
		this.typePillEl.addEventListener("click", (evt) => this.openTypeMenu(evt));

		this.keyInputEl = rowEl.createEl("input", {
			cls: "metadata-property-key-input metaedit-fluid-create-key",
			type: "text",
		});
		this.keyInputEl.placeholder = "Property name";

		this.hostEl = rowEl.createDiv({cls: "metadata-property-value metaedit-native-property-host metaedit-fluid-create-value"});
		this.autoPropertyNoteEl = rowEl.createDiv({cls: "metaedit-fluid-create-autoprop"});
		this.autoPropertyNoteEl.hide();

		this.hintEl = this.contentEl.createDiv({cls: "metaedit-fluid-create-hint"});
		this.hintEl.hide();
		this.warningEl = this.contentEl.createDiv({cls: "metaedit-fluid-create-warning"});
		this.warningEl.hide();

		this.host = new NativeWidgetHost({
			app,
			hostEl: this.hostEl,
			sourcePath: options.sourcePath,
			key: "",
		});
		this.host.mountNative("text", emptyValueForType("text"));
		this.updateTypePill();

		this.buildFooter();
		this.registerKeyInput();
		this.registerKeyboard();

		this.open();
	}

	onOpen(): void {
		super.onOpen();
		this.keyInputEl.focus();
		this.updateValidity();
	}

	onClose(): void {
		super.onClose();
		this.keySuggester?.close();
		this.keySuggester = undefined;
		this.host.destroy();
		if (!this.didFinish) this.result = {kind: "cancel"};
		this.resolveOnce();
	}

	private buildFooter(): void {
		new Setting(this.contentEl)
			.addExtraButton(button => button
				.setIcon("info")
				.setDisabled(true)
				.setTooltip("⌘/Ctrl+↵ to add · ⌘/Ctrl+Y to change type"))
			.addButton(button => {
				this.addButton = button;
				button
					.setButtonText("Add")
					.setCta()
					.onClick(() => this.commit());
			})
			.addButton(button => button
				.setButtonText("Cancel")
				.onClick(() => this.cancel()));
	}

	private registerKeyInput(): void {
		if (this.opts.suggestValues.length > 0) {
			this.keySuggester = new GenericTextSuggester(this.app, this.keyInputEl, this.opts.suggestValues);
		}
		this.keyInputEl.addEventListener("input", () => this.updateValidity());
		this.keyInputEl.addEventListener("blur", () => this.settleKey());
		this.keyInputEl.addEventListener("keydown", (evt) => {
			if (evt.isComposing) return;
			if ((evt.key === "Enter" || evt.key === "Tab") && !evt.shiftKey && !this.isSuggestionOpen()) {
				evt.preventDefault();
				this.settleAndAdvance();
			}
		});
	}

	private registerKeyboard(): void {
		// Universal commit + type-switch accelerators, in the capture phase so they
		// fire regardless of which native widget owns focus.
		this.contentEl.addEventListener("keydown", (evt) => {
			if (evt.isComposing) return;
			if ((evt.metaKey || evt.ctrlKey) && evt.key === "Enter") {
				evt.preventDefault();
				this.commit();
				return;
			}
			if ((evt.metaKey || evt.ctrlKey) && (evt.key === "y" || evt.key === "Y")) {
				evt.preventDefault();
				this.openTypeMenu();
			}
		}, true);

		// Plain Enter commits only from a genuinely single-line value editor
		// (number/date/datetime); in the text longtext or a chip editor Enter
		// belongs to the widget.
		this.hostEl.addEventListener("keydown", (evt) => {
			if (evt.isComposing) return;
			if (evt.key !== "Enter" || evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.altKey) return;
			if (!this.host.isSingleLineEditor()) return;
			evt.preventDefault();
			this.commit();
		});
		this.hostEl.addEventListener("input", () => this.updateInferenceHint());
	}

	private settleAndAdvance(): void {
		this.settleKey();
		if (this.autoPropertyKey) return;
		this.host.focus();
	}

	private settleKey(): void {
		const key = this.keyInputEl.value.trim();
		this.updateValidity();

		if (key === "" || isReservedFrontmatterKey(key) || this.opts.existingKeys.has(key)) {
			// Not a creatable key: keep the default text host, adopt nothing.
			if (this.autoPropertyKey) this.exitAutoPropertyState();
			this.lastSettledKey = key;
			return;
		}

		if (key === this.lastSettledKey) return;
		this.lastSettledKey = key;
		this.host.setKey(key);

		if (this.opts.hasAutoProperty(key)) {
			this.enterAutoPropertyState(key);
			return;
		}
		if (this.autoPropertyKey) this.exitAutoPropertyState();

		if (this.pinnedType) return;
		const type = resolveCreationType(this.app, key);
		if (type !== this.host.type) this.remountAs(type);
	}

	private enterAutoPropertyState(key: string): void {
		this.autoPropertyKey = true;
		this.host.destroy();
		this.hostEl.hide();
		this.typePillEl.hide();
		this.hideInferenceHint();
		this.autoPropertyNoteEl.setText(`"${key}" uses an Auto Property – press ⌘/Ctrl+↵ to choose its value.`);
		this.autoPropertyNoteEl.show();
		this.updateValidity();
	}

	private exitAutoPropertyState(): void {
		this.autoPropertyKey = false;
		this.autoPropertyNoteEl.hide();
		this.hostEl.show();
		this.typePillEl.show();
		this.host.mountNative("text", emptyValueForType("text"));
		this.pinnedType = false;
		this.updateTypePill();
	}

	private remountAs(type: StandardNativePropertyType): void {
		const seed = seedFromRawText(this.host.readRawText(), type);
		this.host.mountNative(type, seed);
		this.updateTypePill();
		this.updateInferenceHint();
	}

	private pickType(type: StandardNativePropertyType): void {
		this.pinnedType = true;
		this.remountAs(type);
		this.host.focus();
	}

	private openTypeMenu(evt?: MouseEvent): void {
		if (this.autoPropertyKey || LOCKED_TYPES.has(this.host.type)) return;

		const menu = new Menu();
		for (const choice of CREATION_TYPE_CHOICES) {
			menu.addItem(item => {
				item.setTitle(choice.label);
				item.setIcon(this.iconIdFor(choice.type));
				item.setChecked(choice.type === this.host.type);
				item.onClick(() => this.pickType(choice.type));
			});
		}
		if (evt instanceof MouseEvent) {
			menu.showAtMouseEvent(evt);
		} else {
			const rect = this.typePillEl.getBoundingClientRect();
			menu.showAtPosition({x: rect.left, y: rect.bottom});
		}
	}

	private updateTypePill(): void {
		const type = this.host.type;
		const label = CREATION_TYPE_CHOICES.find(choice => choice.type === type)?.label ?? this.capitalize(type);
		setIcon(this.typePillIconEl, this.iconIdFor(type));
		this.typePillLabelEl.setText(label);
		const locked = LOCKED_TYPES.has(type);
		this.typePillEl.toggleClass("is-locked", locked);
		this.typePillEl.disabled = locked;
		setTooltip(this.typePillEl, locked ? `${label} (fixed for this property)` : "Change type (⌘/Ctrl+Y)");
	}

	private updateInferenceHint(): void {
		if (this.autoPropertyKey || this.pinnedType) {
			this.hideInferenceHint();
			return;
		}
		const inferred = inferCreationTypeFromText(this.host.readRawText(), this.host.type);
		if (!inferred) {
			this.hideInferenceHint();
			return;
		}
		this.inferredType = inferred;
		const label = CREATION_TYPE_CHOICES.find(choice => choice.type === inferred)?.label ?? inferred;
		this.hintEl.empty();
		this.hintEl.createSpan({text: `Looks like a ${label.toLowerCase()}. `});
		const acceptEl = this.hintEl.createEl("a", {cls: "metaedit-fluid-create-hint-accept", text: `Change to ${label}`});
		acceptEl.addEventListener("click", (evt) => {
			evt.preventDefault();
			if (this.inferredType) this.pickType(this.inferredType);
		});
		this.hintEl.show();
	}

	private hideInferenceHint(): void {
		this.inferredType = null;
		this.hintEl.hide();
		this.hintEl.empty();
	}

	private updateValidity(): void {
		const key = this.keyInputEl.value.trim();
		let warning = "";
		if (key !== "" && isReservedFrontmatterKey(key)) {
			warning = `"${key}" is a reserved property name and can't be used.`;
		} else if (key !== "" && this.opts.existingKeys.has(key)) {
			warning = `This note already has a property named "${key}".`;
		}
		this.warningEl.setText(warning);
		this.warningEl.toggle(warning !== "");
		this.addButton?.setDisabled(key === "" || warning !== "");
	}

	private commit(): void {
		this.settleKey();

		const key = this.keyInputEl.value.trim();
		if (key === "" || isReservedFrontmatterKey(key) || this.opts.existingKeys.has(key)) {
			this.updateValidity();
			this.keyInputEl.focus();
			return;
		}

		if (this.autoPropertyKey) {
			this.finish({kind: "autoProperty", key});
			return;
		}

		this.host.flushFocus();

		if (this.host.valueSource === "native" && this.host.didEditDom && !this.host.didReceiveChange) {
			new Notice(`MetaEdit did not receive a value from Obsidian's native editor for '${key}'. Nothing was written.`);
			return;
		}

		const normalized = normalizeWidgetValue(this.host.type, this.host.value, this.host.valueSource);
		if (normalized.ok === false) {
			new Notice(`MetaEdit could not create '${key}': ${normalized.reason}`);
			return;
		}

		this.finish({
			kind: "submit",
			key,
			type: this.host.type,
			value: normalized.value,
			valueSource: this.host.valueSource,
		});
	}

	private cancel(): void {
		this.finish({kind: "cancel"});
	}

	private finish(result: FluidPropertyCreateResult): void {
		this.result = result;
		this.didFinish = true;
		this.close();
	}

	private resolveOnce(): void {
		if (this.didResolve) return;
		this.didResolve = true;
		this.resolvePromise(this.result);
	}

	private isSuggestionOpen(): boolean {
		return activeDocument.querySelector(".suggestion-container") !== null;
	}

	private iconIdFor(type: StandardNativePropertyType): string {
		const raw = getNativeWidgetForType(this.app, type)?.icon;
		const id = typeof raw === "string" ? raw.replace(/^lucide-/, "") : "";
		return id || FALLBACK_ICONS[type];
	}

	private capitalize(text: string): string {
		return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
	}
}
