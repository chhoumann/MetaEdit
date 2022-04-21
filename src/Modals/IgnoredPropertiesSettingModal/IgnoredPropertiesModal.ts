import { App, Modal } from 'obsidian';
import IgnoredPropertiesModalContent from './IgnoredPropertiesModalContent.svelte';

export default class IgnoredPropertiesModal extends Modal {
    public waitForResolve: Promise<string[]>;
    private content: IgnoredPropertiesModalContent;
    private resolvePromise: ((ignoredProperties: string[]) => void) | undefined;
    private ignoredProperties: string[];

    constructor(app: App, ignoredProperties: string[]) {
        super(app);
        this.ignoredProperties = ignoredProperties;

        this.waitForResolve = new Promise<string[]>(
            (resolve) => (this.resolvePromise = resolve),
        );

        this.content = new IgnoredPropertiesModalContent({
            target: this.contentEl,
            props: {
                ignoredProperties,
                save: (ignoredProperties: string[]) => {
                    this.ignoredProperties = ignoredProperties;
                    this.close();
                },
            },
        });

        this.open();
    }

    onClose() {
        super.onClose();
        this.content.$destroy();
        if (this.resolvePromise) {
            this.resolvePromise(this.ignoredProperties);
        }
    }
}
