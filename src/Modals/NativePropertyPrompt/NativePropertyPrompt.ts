import {Modal, Notice, Setting, type App, type ButtonComponent, type TFile} from "obsidian";
import type {Property} from "../../parser";
import {
	normalizeWidgetValue,
	resolveNativeProperty,
	type NativePropertyPromptResult,
} from "../../typedProperties/nativePropertyTypes";
import {NativeWidgetHost} from "../NativeWidgetHost";

export default class NativePropertyPrompt extends Modal {
	private readonly file: TFile;
	private readonly property: Property;
	private resolvePromise: (result: NativePropertyPromptResult) => void;
	private readonly host: NativeWidgetHost;
	private hostEl: HTMLElement;
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
		this.hostEl = rowEl.createDiv({cls: "metadata-property-value metaedit-native-property-host"});

		this.host = new NativeWidgetHost({
			app,
			hostEl: this.hostEl,
			sourcePath: file.path,
			key: property.key,
		});

		const resolution = resolveNativeProperty(app, property);
		if (resolution.kind === "native") {
			this.host.mountNative(resolution.type, property.content);
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

	private submit(): void {
		this.host.flushFocus();

		if (this.host.valueSource === "native" && this.host.didEditDom && !this.host.didReceiveChange) {
			new Notice(`MetaEdit did not receive a value from Obsidian's native editor for '${this.property.key}'. Nothing was written.`);
			return;
		}

		if (!this.host.didReceiveChange) {
			this.finish({
				kind: "submit",
				changed: false,
				type: this.host.type,
				value: this.property.content,
				valueSource: this.host.valueSource,
			});
			return;
		}

		const normalized = normalizeWidgetValue(this.host.type, this.host.value, this.host.valueSource);
		if (normalized.ok === false) {
			new Notice(`MetaEdit could not update '${this.property.key}': ${normalized.reason}`);
			return;
		}

		this.finish({
			kind: "submit",
			changed: true,
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
