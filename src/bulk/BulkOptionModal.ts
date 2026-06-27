import { type App, Modal } from "obsidian";

export interface BulkOption {
	/** Stable value returned when this option is chosen. */
	key: string;
	label: string;
	description?: string;
}

export interface BulkChoiceConfig {
	title: string;
	description?: string;
	options: BulkOption[];
	/** Render the options as warning-styled buttons for destructive choices. */
	danger?: boolean;
}

/**
 * A small button-list modal for picking a bulk conflict policy or confirming a
 * destructive action. Unlike the shared GenericSuggester, it resolves to `null`
 * when dismissed (Escape / click-away), so callers can cleanly abort instead of
 * hanging on a never-settled promise.
 */
export class BulkOptionModal extends Modal {
	private resolvePromise!: (value: string | null) => void;
	private didChoose = false;

	private constructor(app: App, private config: BulkChoiceConfig) {
		super(app);
	}

	public static Choose(app: App, config: BulkChoiceConfig): Promise<string | null> {
		const modal = new BulkOptionModal(app, config);
		const promise = new Promise<string | null>((resolve) => {
			modal.resolvePromise = resolve;
		});
		modal.open();
		return promise;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("metaedit-bulk-modal");
		contentEl.createEl("h3", { text: this.config.title });

		if (this.config.description) {
			contentEl.createEl("p", {
				text: this.config.description,
				cls: "metaedit-bulk-modal-description",
			});
		}

		const list = contentEl.createDiv({ cls: "metaedit-bulk-options" });
		for (const option of this.config.options) {
			const button = list.createEl("button", { cls: "metaedit-bulk-option" });
			if (this.config.danger) button.addClass("mod-warning");

			button.createDiv({ cls: "metaedit-bulk-option-label", text: option.label });
			if (option.description) {
				button.createDiv({ cls: "metaedit-bulk-option-description", text: option.description });
			}

			button.addEventListener("click", () => this.choose(option.key));
		}
	}

	private choose(key: string): void {
		this.didChoose = true;
		this.resolvePromise(key);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.didChoose) this.resolvePromise(null);
	}
}
