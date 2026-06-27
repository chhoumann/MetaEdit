import {type App, Modal} from "obsidian";
import GenericPromptContent from "./GenericPromptContent.svelte"
import {type MountedSvelteComponent, mountSvelteComponent, unmountSvelteComponent} from "../../svelteMount";

export default class GenericPrompt extends Modal {
    private modalContent: MountedSvelteComponent;
    private resolvePromise: (input: string | null) => void;
    private input: string;
    public waitForClose: Promise<string | null>;
    private didSubmit: boolean = false;

    public static Prompt(app: App, header: string, placeholder?: string, value?: string, suggestValues?: string[]): Promise<string | null> {
        const newPromptModal = new GenericPrompt(app, header, placeholder, value, suggestValues);
        return newPromptModal.waitForClose;
    }

    private constructor(app: App, header: string, placeholder?: string, value?: string, suggestValues?: string[]) {
        super(app);

        this.modalContent = mountSvelteComponent(
            GenericPromptContent,
            this.contentEl,
            {
                app,
                header,
                placeholder,
                value,
                suggestValues,
                onSubmit: (input: string) => {
                    this.input = input;
                    this.didSubmit = true;
                    this.close();
                }
            }
        );

        this.waitForClose = new Promise<string | null>(
            (resolve) => {
                this.resolvePromise = resolve;
            }
        );

        this.open();
    }

    onOpen() {
        super.onOpen();

        const modalPrompt = document.querySelector('.metaEditPrompt');
        const modalInput = modalPrompt?.querySelector('.metaEditPromptInput') as HTMLInputElement | null;
        modalInput?.focus();
        // select() is only meaningful (and only safe) on text inputs - calling it
        // on a date/datetime input throws in some engines.
        if (modalInput?.type === "text") modalInput.select();
    }

    onClose() {
        super.onClose();
        unmountSvelteComponent(this.modalContent);

        // Cancelling (Escape/close without submitting) resolves to null rather than
        // rejecting, so a normal cancel never surfaces as an unhandled rejection.
        if (!this.didSubmit) this.resolvePromise(null);
        else this.resolvePromise(this.input);
    }
}
