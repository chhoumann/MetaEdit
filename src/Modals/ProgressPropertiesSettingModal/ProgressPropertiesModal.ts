import {App, Modal} from "obsidian";
import type MetaEdit from "../../main";
import ProgressPropertiesModalContent from "./ProgressPropertiesModalContent.svelte";
import type {ProgressProperty} from "../../Types/progressProperty";

export default class ProgressPropertiesModal extends Modal {
    public waitForResolve: Promise<ProgressProperty[]>;
    private plugin: MetaEdit;
    private content: ProgressPropertiesModalContent;
    private resolvePromise: (properties: ProgressProperty[]) => void;
    private properties: ProgressProperty[];

    constructor(app: App, plugin: MetaEdit, properties: ProgressProperty[]) {
        super(app);
        this.plugin = plugin;
        if (properties.length > 0)
            this.properties = properties;
        else
            this.properties = [];

        this.waitForResolve = new Promise<ProgressProperty[]>(
            (resolve) => (this.resolvePromise = resolve)
        );

        this.content = new ProgressPropertiesModalContent({
            target: this.contentEl,
            props: {
                properties: this.properties,
                save: (properties: ProgressProperty[]) => {
                    this.properties = properties;
                    this.close();
                }
            },
        });

        this.open();
    }

    onClose() {
        super.onClose();
        this.content.$destroy();
        this.resolvePromise(this.properties);
    }
}