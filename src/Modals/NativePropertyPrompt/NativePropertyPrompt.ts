import {Modal, Notice, Setting, type App, type ButtonComponent, type TFile} from "obsidian";
import type {Property} from "../../parser";
import {
	LOCKED_NATIVE_TYPES,
	normalizeWidgetValue,
	resolveNativeProperty,
	seedFromRawText,
	type NativePropertyPromptResult,
	type StandardNativePropertyType,
} from "../../typedProperties/nativePropertyTypes";
import {NativeWidgetHost} from "../NativeWidgetHost";
import {TypePill} from "../TypePill";

// Reserved frontmatter keys whose type Obsidian fixes vault-wide; the pill shows
// the type but never offers a switch (matching Obsidian's own Properties view).
const RESERVED_TYPE_KEYS = new Set(["tags", "aliases", "cssclasses"]);

export default class NativePropertyPrompt extends Modal {
	private readonly file: TFile;
	private readonly property: Property;
	private resolvePromise: (result: NativePropertyPromptResult) => void;
	private readonly host: NativeWidgetHost;
	private hostEl: HTMLElement;
	private typePill: TypePill | null = null;
	// The type the property resolved to when the prompt opened; null when the
	// native widgets are unavailable (fallback editor), which also disables the
	// pill and therefore type switching.
	private originalType: StandardNativePropertyType | null = null;
	private result: NativePropertyPromptResult = {kind: "cancel"};
	private didFinish = false;
	private didResolve = false;
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
		this.waitForClose = new Promise<NativePropertyPromptResult>((resolve) => {
			this.resolvePromise = resolve;
		});

		this.contentEl.addClass("metaedit-native-property-prompt");
		new Setting(this.contentEl)
			.setHeading()
			.setName(`Edit ${property.key}`);

		const rowEl = this.contentEl.createDiv({cls: "metadata-property metaedit-native-property-row"});

		const resolution = resolveNativeProperty(app, property);
		if (resolution.kind === "native") {
			this.typePill = new TypePill({
				app,
				parentEl: rowEl,
				tooltip: "Change property type - applies vault-wide (⌘/Ctrl+Y)",
				onPick: (type) => this.pickType(type),
			});
		}

		this.hostEl = rowEl.createDiv({cls: "metadata-property-value metaedit-native-property-host"});

		this.host = new NativeWidgetHost({
			app,
			hostEl: this.hostEl,
			sourcePath: file.path,
			key: property.key,
		});

		if (resolution.kind === "native") {
			this.originalType = resolution.type;
			this.host.mountNative(resolution.type, property.content);
			this.updateTypePill();
			this.registerTypeSwitchAccelerator();
		} else {
			this.host.mountFallback(resolution.reason, property.content);
		}

		new Setting(this.contentEl)
			.addButton(button => {
				this.saveButton = button;
				button
					.setButtonText("Save")
					.setCta()
					.setDisabled(this.host.renderFailed)
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
		this.host.focus();
	}

	onClose(): void {
		super.onClose();
		this.host.destroy();
		this.hostEl.remove();
		if (!this.didFinish) this.result = {kind: "cancel"};
		this.resolveOnce();
	}

	private registerTypeSwitchAccelerator(): void {
		// Capture phase so the accelerator fires regardless of which native widget
		// owns focus, mirroring the fluid create modal.
		this.contentEl.addEventListener("keydown", (evt) => {
			if (evt.isComposing) return;
			if ((evt.metaKey || evt.ctrlKey) && (evt.key === "y" || evt.key === "Y")) {
				evt.preventDefault();
				this.typePill?.openMenu();
			}
		}, true);
	}

	private pickType(type: StandardNativePropertyType): void {
		if (type === this.host.type) return;
		// Re-mount Obsidian's widget for the picked type, carrying the current
		// value across the switch the same way the create modal does. Nothing is
		// written (neither the value nor the vault-wide type) until Save.
		this.host.mountNative(type, seedFromRawText(this.host.readRawText(), type));
		this.updateTypePill();
		this.saveButton?.setDisabled(this.host.renderFailed);
		this.host.focus();
	}

	private updateTypePill(): void {
		const locked = LOCKED_NATIVE_TYPES.has(this.host.type) ||
			RESERVED_TYPE_KEYS.has(this.property.key.toLowerCase());
		this.typePill?.setState(this.host.type, locked);
	}

	private submit(): void {
		this.host.flushFocus();

		if (this.host.valueSource === "native" && this.host.didEditDom && !this.host.didReceiveChange) {
			new Notice(`MetaEdit did not receive a value from Obsidian's native editor for '${this.property.key}'. Nothing was written.`);
			return;
		}

		const typeChanged = this.originalType !== null && this.host.type !== this.originalType;

		if (!this.host.didReceiveChange && !typeChanged) {
			this.finish({
				kind: "submit",
				changed: false,
				typeChanged: false,
				type: this.host.type,
				value: this.property.content,
				valueSource: this.host.valueSource,
			});
			return;
		}

		// On a type switch with the widget left untouched, host.value is the seed
		// carried across the switch, which is always a valid value for the type.
		const normalized = normalizeWidgetValue(this.host.type, this.host.value, this.host.valueSource);
		if (normalized.ok === false) {
			new Notice(`MetaEdit could not update '${this.property.key}': ${normalized.reason}`);
			return;
		}

		this.finish({
			kind: "submit",
			changed: true,
			typeChanged,
			type: this.host.type,
			value: normalized.value,
			valueSource: this.host.valueSource,
		});
	}

	private cancel(): void {
		this.finish({kind: "cancel"});
	}

	private finish(result: NativePropertyPromptResult): void {
		this.result = result;
		this.didFinish = true;
		this.close();
	}

	private resolveOnce(): void {
		if (this.didResolve) return;
		this.didResolve = true;
		this.resolvePromise(this.result);
	}
}
