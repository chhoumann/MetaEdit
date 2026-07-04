import {Modal, Notice, Setting, type App, type ButtonComponent, type TFile} from "obsidian";
import type {Property} from "../../parser";
import {
	LOCKED_NATIVE_TYPES,
	canAssignVaultPropertyType,
	frontmatterValuesEqual,
	normalizeWidgetValue,
	resolveNativeProperty,
	seedFromRawText,
	type NativePropertyPromptResult,
	type StandardNativePropertyType,
} from "../../typedProperties/nativePropertyTypes";
import {NativeWidgetHost} from "../NativeWidgetHost";
import {TypePill} from "../TypePill";
import {isTagsKey} from "../../tagEditing";

// Reserved frontmatter keys whose type Obsidian fixes vault-wide; the pill shows
// the type but never offers a switch (matching Obsidian's own Properties view).
// Tag keys are checked via isTagsKey so the singular `tag` - which the whole
// write path treats as tag metadata - locks exactly like `tags`.
const RESERVED_TYPE_KEYS = new Set(["aliases", "cssclasses"]);

function isReservedTypeKey(key: string): boolean {
	return isTagsKey(key) || RESERVED_TYPE_KEYS.has(key.toLowerCase());
}

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
	// True once the user switched the widget's type at least once, even back to
	// the original. Every re-mount resets the host's didReceiveChange flag, so
	// after any switch the untouched fast path is no longer trustworthy and the
	// submit decision falls through to a value comparison instead.
	private didSwitchType = false;
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
		// The pill exists only when a switch can COMPLETE: native widgets resolve
		// AND this Obsidian build can persist the vault-wide type. Otherwise
		// offering the menu would guarantee a partial result (value reshaped,
		// type memory unchanged).
		const canSwitchType = resolution.kind === "native" && canAssignVaultPropertyType(app);
		if (canSwitchType) {
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
			if (canSwitchType) {
				this.updateTypePill();
				this.registerTypeSwitchAccelerator();
			}
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
		this.didSwitchType = true;
		this.host.mountNative(type, seedFromRawText(this.host.readRawText(), type));
		this.updateTypePill();
		this.saveButton?.setDisabled(this.host.renderFailed);
		this.host.focus();
	}

	private updateTypePill(): void {
		const locked = LOCKED_NATIVE_TYPES.has(this.host.type) ||
			isReservedTypeKey(this.property.key);
		this.typePill?.setState(this.host.type, locked);
	}

	private submit(): void {
		this.host.flushFocus();

		if (this.host.valueSource === "native" && this.host.didEditDom && !this.host.didReceiveChange) {
			new Notice(`MetaEdit did not receive a value from Obsidian's native editor for '${this.property.key}'. Nothing was written.`);
			return;
		}

		const typeChanged = this.originalType !== null && this.host.type !== this.originalType;

		// The truly untouched case: never switched type, widget never reported a
		// value. Skip normalization entirely - the raw stored value (e.g. a YAML
		// Date object) need not fit the widget's value shape.
		if (!this.host.didReceiveChange && !typeChanged && !this.didSwitchType) {
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

		// After any type switch, host.value is the carried seed (always valid for
		// the current type), so normalization cannot spuriously fail here.
		const normalized = normalizeWidgetValue(this.host.type, this.host.value, this.host.valueSource);
		if (normalized.ok === false) {
			new Notice(`MetaEdit could not update '${this.property.key}': ${normalized.reason}`);
			return;
		}

		// `changed` means "the VALUE differs" - decided by comparison, not by
		// per-widget dirty flags, which every re-mount resets (an edit carried
		// across a switch-away-and-back must still save). A pure type change with
		// an equal value keeps changed=false: the controller then skips the file
		// write and only assigns the vault-wide type, like Obsidian itself.
		const changed = !frontmatterValuesEqual(normalized.value, this.property.content);

		this.finish({
			kind: "submit",
			changed,
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
