import { App, Modal } from 'obsidian';
import GenericPromptContent from './GenericPromptContent.svelte';

export default class GenericPrompt extends Modal {
    private modalContent: GenericPromptContent;
    private resolvePromise: ((input: string) => void) | undefined;
    private input: string | undefined;
    public waitForClose: Promise<string>;
    private rejectPromise: ((reason?: any) => void) | undefined;
    private didSubmit: boolean = false;

    public static Prompt(
        app: App,
        header: string,
        placeholder?: string,
        value?: string,
        suggestValues?: string[],
    ): Promise<string> {
        const newPromptModal = new GenericPrompt(
            app,
            header,
            placeholder,
            value,
            suggestValues,
        );
        return newPromptModal.waitForClose;
    }

    private constructor(
        app: App,
        header: string,
        placeholder?: string,
        value?: string,
        suggestValues?: string[],
    ) {
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
                },
            },
        });

        this.waitForClose = new Promise<string>((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;
        });

        this.open();
    }

    onOpen() {
        super.onOpen();

        const modalPrompt: HTMLElement | null =
            document.querySelector('.metaEditPrompt');

        if (!modalPrompt) return;

        const modalInput: any = modalPrompt.querySelector(
            '.metaEditPromptInput',
        );

        modalInput.focus();
        modalInput.select();
    }

    onClose() {
        super.onClose();
        this.modalContent.$destroy();

        if (!this.rejectPromise || !this.resolvePromise) return;

        if (!this.didSubmit) this.rejectPromise('No input given.');

        if (this.input) this.resolvePromise(this.input);
        else this.rejectPromise();
    }
}
