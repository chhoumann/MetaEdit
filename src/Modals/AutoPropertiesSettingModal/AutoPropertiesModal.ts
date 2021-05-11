import {App, Modal} from "obsidian";
import type MetaEdit from "../../main";
import AutoPropertiesModalContent from "./AutoPropertiesModalContent.svelte";
import type {AutoProperty} from "../../Types/autoProperty";

export default class AutoPropertiesModal extends Modal {
    public waitForResolve: Promise<AutoProperty[]>;
    private plugin: MetaEdit;
    private content: AutoPropertiesModalContent;
    private resolvePromise: (autoProperties: AutoProperty[]) => void;
    private autoProperties: AutoProperty[];

    constructor(app: App, plugin: MetaEdit, autoProperties: AutoProperty[]) {
        super(app);
        this.plugin = plugin;
        this.autoProperties = autoProperties;

        this.waitForResolve = new Promise<AutoProperty[]>(
            (resolve) => (this.resolvePromise = resolve)
        );

        this.content = new AutoPropertiesModalContent({
            target: this.contentEl,
            props: {
                save: (autoProperties: AutoProperty[]) => this.save(autoProperties),
                autoProperties
            },
        });

        this.open();
    }

    save(autoProperties: AutoProperty[]) {
        this.autoProperties = autoProperties;
        this.close();
    }

    onClose() {
        super.onClose();
        this.content.$destroy();
        this.resolvePromise(this.autoProperties);
    }
}