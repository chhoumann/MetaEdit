import {type App, Modal} from "obsidian";
import type MetaEdit from "../../main";
import SingleValueTableEditorContent from "../shared/SingleValueTableEditorContent.svelte";
import {type MountedSvelteComponent, mountSvelteComponent, unmountSvelteComponent} from "../../svelteMount";

export default class IgnoredPropertiesModal extends Modal{
    public waitForResolve: Promise<string[]>;
    private plugin: MetaEdit;
    private content: MountedSvelteComponent;
    private resolvePromise: (ignoredProperties: string[]) => void;
    private ignoredProperties: string[];

    constructor(app: App, plugin: MetaEdit, ignoredProperties: string[]) {
        super(app);
        this.plugin = plugin;
        this.ignoredProperties = ignoredProperties;

        this.waitForResolve = new Promise<string[]>(
            (resolve) => (this.resolvePromise = resolve)
        );

        this.content = mountSvelteComponent(
            SingleValueTableEditorContent,
            this.contentEl,
            {
                properties: ignoredProperties,
                save: (ignoredProperties: string[]) => {
                    this.ignoredProperties = ignoredProperties;
                    this.close();
                }
            },
        );

        this.open();
    }

    onClose() {
        super.onClose();
        unmountSvelteComponent(this.content);
        this.resolvePromise(this.ignoredProperties);
    }
}
