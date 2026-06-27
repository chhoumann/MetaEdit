import {type App, Modal} from "obsidian";
import type MetaEdit from "../../main";
import ProgressPropertiesModalContent from "./ProgressPropertiesModalContent.svelte";
import type {ProgressProperty} from "../../Types/progressProperty";
import {type MountedSvelteComponent, mountSvelteComponent, unmountSvelteComponent} from "../../svelteMount";

export default class ProgressPropertiesModal extends Modal {
    public waitForResolve: Promise<ProgressProperty[]>;
    private plugin: MetaEdit;
    private content: MountedSvelteComponent;
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

        this.content = mountSvelteComponent(
            ProgressPropertiesModalContent,
            this.contentEl,
            {
                properties: this.properties,
                save: (properties: ProgressProperty[]) => {
                    this.properties = properties;
                    this.close();
                }
            },
        );

        this.open();
    }

    onClose() {
        super.onClose();
        unmountSvelteComponent(this.content);
        this.resolvePromise(this.properties);
    }
}
