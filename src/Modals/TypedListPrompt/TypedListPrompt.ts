import {type App, Modal} from "obsidian";
import TypedListPromptContent from "./TypedListPromptContent.svelte";
import {type MountedSvelteComponent, mountSvelteComponent, unmountSvelteComponent} from "../../svelteMount";
import {createTypedListItems, type TypedListPromptResult} from "../../typedList";

type TypedListPromptInput = {
	propertyKey: string;
	value: readonly unknown[];
};

export default class TypedListPrompt extends Modal {
	private modalContent: MountedSvelteComponent | null = null;
	private resolvePromise!: (result: TypedListPromptResult) => void;
	private result: TypedListPromptResult = {kind: "cancel"};
	private didResolve = false;
	private previousFocus: HTMLElement | null = null;
	public waitForClose: Promise<TypedListPromptResult>;

	public static open(app: App, input: TypedListPromptInput): Promise<TypedListPromptResult> {
		const modal = new TypedListPrompt(app, input);
		return modal.waitForClose;
	}

	private constructor(app: App, input: TypedListPromptInput) {
		super(app);

		this.waitForClose = new Promise<TypedListPromptResult>((resolve) => {
			this.resolvePromise = resolve;
		});

		this.modalEl.classList.add("metaedit-typed-list-modal");
		this.previousFocus = activeDocument.activeElement instanceof HTMLElement
			? activeDocument.activeElement
			: null;

		this.modalContent = mountSvelteComponent(
			TypedListPromptContent,
			this.contentEl,
			{
				items: createTypedListItems(input.value),
				propertyKey: input.propertyKey,
				onCancel: () => {
					this.result = {kind: "cancel"};
					this.close();
				},
				onSubmit: (value: unknown[]) => {
					this.result = {kind: "submit", value};
					this.close();
				},
			},
		);

		this.open();
	}

	onClose() {
		super.onClose();
		unmountSvelteComponent(this.modalContent);
		this.modalContent = null;

		if (this.previousFocus && activeDocument.body.contains(this.previousFocus)) {
			this.previousFocus.focus();
		}

		if (!this.didResolve) {
			this.didResolve = true;
			this.resolvePromise(this.result);
		}
	}
}
