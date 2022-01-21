import {App, ButtonComponent, Modal, TextAreaComponent} from "obsidian";
import type {Property} from "../../Parser/parser";
import {MetaDataType} from "../../Types/MetaDataType";

export default class PropertyListEditorModal extends Modal {
    private resolvePromise: (value?: any) => void;
    private rejectPromise: (reason?: any) => void;
    private didSubmit: boolean = false;
    private serializedList: string;

    public waitForClose: Promise<string[]>;

    public static Prompt(app: App, list: Property[]): Promise<string[]> {
        const modal = new PropertyListEditorModal(app, list);
        return modal.waitForClose;
    }

    constructor(app: App, private list: Property[], private header?: string) {
        super(app);

        this.serializedList = this.serializeList(list);

        this.waitForClose = new Promise<string[]>(
            (resolve, reject) => {
                this.resolvePromise = resolve;
                this.rejectPromise = reject;
            }
        );

        this.open();
        this.display();
    }

    private serializeList(list: Property[]): string {
        return list.map(property => property.content).join("\n");
    }

    private deserializeList(serializedList: string): Property[] {
        const list = serializedList
            .split("\n");

        list.slice(0, this.list.length - 1)
            .forEach((propValue, index) => this.list[index].content = propValue);

        list.slice(this.list.length).forEach((propValue, index) => {
            if (propValue) {
                this.list.push({
                    content: propValue,
                    key: null,
                    type: null,
                    dataType: MetaDataType.ArrayItem
                });
            }
        });

        return this.list;
    }

    private display() {
        this.contentEl.empty();

        this.titleEl.textContent = this.header;

        const textArea: TextAreaComponent = new TextAreaComponent(this.contentEl)
            .setPlaceholder("Enter a list of items separated by new lines")
            .setValue(this.serializedList)
            .onChange((value) => {
                this.serializedList = value;
            });

        Object.assign(textArea.inputEl.style, {
            width: "100%",
            height: "25rem",
            resize: "none",
            overflow: "auto",
            outline: "none",
            border: "none",
            padding: "0",
            margin: "0",
        });

        textArea.inputEl.focus();

        const submitButton: ButtonComponent = new ButtonComponent(this.contentEl)
            .setCta()
            .setButtonText("Submit")
            .onClick(() => {
                this.didSubmit = true;
                this.close();
            });
    }

    public onClose() {
        if (this.didSubmit) {
            this.resolvePromise(this.deserializeList(this.serializedList));
        } else {
            this.rejectPromise("Cancelled.");
        }
    }


}