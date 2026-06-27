import {type App, Modal} from "obsidian";
import GenericPromptContent from "./GenericPromptContent.svelte"

export default class GenericPrompt extends Modal {
    private modalContent: GenericPromptContent;
    private resolvePromise: (input: string) => void;
    private input: string;
    public waitForClose: Promise<string>;
    private rejectPromise: (reason?: any) => void;
    private didSubmit: boolean = false;

    public static Prompt(app: App, header: string, placeholder?: string, value?: string, suggestValues?: string[]): Promise<string> {
        const newPromptModal = new GenericPrompt(app, header, placeholder, value, suggestValues);
        return newPromptModal.waitForClose;
    }

    private constructor(app: App, header: string, placeholder?: string, value?: string, suggestValues?: string[]) {
        super(app);

        this.modalContent = new GenericPromptContent({
            target: this.contentEl,
            props: {
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
        });

        this.waitForClose = new Promise<string>(
            (resolve, reject) => {
                this.resolvePromise = resolve;
                this.rejectPromise = reject;
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
        this.modalContent.$destroy();

        if(!this.didSubmit) this.rejectPromise("No input given.");
        else this.resolvePromise(this.input);
    }
}