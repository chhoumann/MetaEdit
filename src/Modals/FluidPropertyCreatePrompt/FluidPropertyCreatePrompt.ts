import {Modal, Notice, Setting, type App, type ButtonComponent} from "obsidian";
import {
	LOCKED_NATIVE_TYPES,
	NATIVE_TYPE_CHOICES,
	emptyValueForType,
	inferCreationTypeFromText,
	normalizeWidgetValue,
	resolveCreationType,
	seedFromRawText,
	type NativeValueSource,
	type StandardNativePropertyType,
} from "../../typedProperties/nativePropertyTypes";
import {isReservedFrontmatterKey} from "../../yamlPath";
import {NativeWidgetHost} from "../NativeWidgetHost";
import {TypePill} from "../TypePill";
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
	private typePill: TypePill;
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

		this.modalEl.addClass("metaedit-fluid-create-modal");
		this.contentEl.addClass("metaedit-fluid-create");
		new Setting(this.contentEl).setHeading().setName("New property");

		const rowEl = this.contentEl.createDiv({cls: "metadata-property metaedit-fluid-create-row"});

		this.typePill = new TypePill({
			app,
			parentEl: rowEl,
			tooltip: "Change type (⌘/Ctrl+Y)",
			onPick: (type) => this.pickType(type),
			// Settle first so a reserved key locks its type before the menu opens (you
			// can't pick a type for tags/aliases), and so the adopted type is checked.
			beforeOpen: () => {
				this.settleKey();
				return !this.autoPropertyKey;
			},
		});

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
			this.keySuggester = new FluidKeyNameSuggester(this.app, this.keyInputEl, this.opts.suggestValues);
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
				this.typePill.openMenu();
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

		const type = resolveCreationType(this.app, key);
		// A reserved key (tags/aliases) forces its widget and overrides any pinned
		// choice - you can never make `tags` a Number - so this check runs BEFORE the
		// pinned short-circuit and clears the pin.
		if (LOCKED_NATIVE_TYPES.has(type)) {
			this.pinnedType = false;
			if (type !== this.host.type) this.remountAs(type);
			return;
		}

		if (this.pinnedType) return;
		if (type !== this.host.type) this.remountAs(type);
	}

	private enterAutoPropertyState(key: string): void {
		this.autoPropertyKey = true;
		this.host.destroy();
		this.hostEl.hide();
		this.typePill.hide();
		this.hideInferenceHint();
		this.autoPropertyNoteEl.setText(`"${key}" uses an Auto Property – press ⌘/Ctrl+↵ to choose its value.`);
		this.autoPropertyNoteEl.show();
		this.updateValidity();
	}

	private exitAutoPropertyState(): void {
		this.autoPropertyKey = false;
		this.autoPropertyNoteEl.hide();
		this.hostEl.show();
		this.typePill.show();
		this.host.mountNative("text", emptyValueForType("text"));
		this.pinnedType = false;
		this.updateTypePill();
	}

	private remountAs(type: StandardNativePropertyType): void {
		// Close the key dropdown first so the host's portal teardown can't remove a
		// live sibling suggestion popover during the re-mount.
		this.keySuggester?.close();
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

	private updateTypePill(): void {
		this.typePill.setState(this.host.type, LOCKED_NATIVE_TYPES.has(this.host.type));
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
		const label = NATIVE_TYPE_CHOICES.find(choice => choice.type === inferred)?.label ?? inferred;
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

		// Fail closed if the native editor never rendered (no editor to take a value
		// from), matching the edit prompt - never write the bare seed in that case.
		if (this.host.renderFailed) {
			new Notice(`MetaEdit could not render an editor for '${key}'. Nothing was written.`);
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
}

/**
 * The key-name suggester for the create modal. It tags its dropdown so the scoped
 * CSS cap applies (a fixed max-height + scroll, sized to sit above the action
 * buttons within the reserved modal height), so the list never spills below the
 * modal or covers the buttons.
 */
class FluidKeyNameSuggester extends GenericTextSuggester {
	renderSuggestion(value: string, el: HTMLElement): void {
		super.renderSuggestion(value, el);
		el.closest(".suggestion-container")?.addClass("metaedit-fluid-create-suggest");
	}
}
