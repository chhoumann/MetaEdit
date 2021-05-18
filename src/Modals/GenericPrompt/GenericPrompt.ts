import {App, Modal} from "obsidian";
import GenericPromptContent from "./GenericPromptContent.svelte"

export default class GenericPrompt extends Modal {
    private modalContent: GenericPromptContent;
    private resolvePromise: (input: string) => void;
    private input: string;
    public waitForClose: Promise<string>;

    public static Prompt(app: App, header: string, placeholder?: string, value?: string): Promise<string> {
        const newPromptModal = new GenericPrompt(app, header, placeholder, value);
        return newPromptModal.waitForClose;
    }

    private constructor(app: App, header: string, placeholder?: string, value?: string) {
        super(app);

        this.modalContent = new GenericPromptContent({
            target: this.contentEl,
            props: {
                header,
                placeholder,
                value,
                onSubmit: (input: string) => {
                    this.input = input;
                    this.close();
                }
            }
        });

        this.waitForClose = new Promise<string>(
            (resolve) => (this.resolvePromise = resolve)
        );

        this.open();
    }

    onOpen() {
        super.onOpen();

        const modalPrompt: HTMLElement = document.querySelector('.metaEditPrompt');
        const modalInput: any = modalPrompt.querySelector('.metaEditPromptInput');
        modalInput.focus();
        modalInput.select();
    }

    onClose() {
        super.onClose();
        this.modalContent.$destroy();
        this.resolvePromise(this.input);
    }
}