import {App, Modal} from "obsidian";
import type MetaEdit from "../../main";
import IgnoredPropertiesModalContent from "./IgnoredPropertiesModalContent.svelte";

export default class IgnoredPropertiesModal extends Modal{
    public waitForResolve: Promise<string[]>;
    private plugin: MetaEdit;
    private content: IgnoredPropertiesModalContent;
    private resolvePromise: (ignoredProperties: string[]) => void;
    private ignoredProperties: string[];

    constructor(app: App, plugin: MetaEdit, ignoredProperties: string[]) {
        super(app);
        this.plugin = plugin;
        this.ignoredProperties = ignoredProperties;

        this.waitForResolve = new Promise<string[]>(
            (resolve) => (this.resolvePromise = resolve)
        );

        this.content = new IgnoredPropertiesModalContent({
            target: this.contentEl,
            props: {
                ignoredProperties,
                save: (ignoredProperties: string[]) => {
                    this.ignoredProperties = ignoredProperties;
                    this.close();
                }
            },
        });

        this.open();
    }

    onClose() {
        super.onClose();
        this.content.$destroy();
        this.resolvePromise(this.ignoredProperties);
    }
}