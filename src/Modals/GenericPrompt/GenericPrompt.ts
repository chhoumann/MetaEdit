import { App, Modal } from 'obsidian';

export default class GenericPrompt extends Modal {
    private resolvePromise: ((input: string) => void) | undefined;
    private input: string | undefined;
    public waitForClose: Promise<string>;
    private rejectPromise: ((reason?: any) => void) | undefined;
    private didSubmit: boolean = false;

    public static Prompt(
        app: App,
    ): Promise<string> {
        const newPromptModal = new GenericPrompt(
            app,
        );
        return newPromptModal.waitForClose;
    }

    private constructor(
        app: App,
    ) {
        super(app);


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

        if (!this.rejectPromise || !this.resolvePromise) return;

        if (!this.didSubmit) this.rejectPromise('No input given.');

        if (this.input) this.resolvePromise(this.input);
        else this.rejectPromise();
    }
}
