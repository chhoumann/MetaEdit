import { App, Modal } from 'obsidian';
import type { ProgressProperty } from '../../Types/progressProperty';
import ProgressPropertiesModalContent from './ProgressPropertiesModalContent.svelte';

export default class ProgressPropertiesModal extends Modal {
    public waitForResolve: Promise<ProgressProperty[]>;
    private content: ProgressPropertiesModalContent;
    private resolvePromise:
        | ((properties: ProgressProperty[]) => void)
        | undefined;
    private properties: ProgressProperty[];

    constructor(app: App, properties: ProgressProperty[]) {
        super(app);
        if (properties.length > 0) this.properties = properties;
        else this.properties = [];

        this.waitForResolve = new Promise<ProgressProperty[]>(
            (resolve) => (this.resolvePromise = resolve),
        );

        this.content = new ProgressPropertiesModalContent({
            target: this.contentEl,
            props: {
                properties: this.properties,
                save: (properties: ProgressProperty[]) => {
                    this.properties = properties;
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
            this.resolvePromise(this.properties);
        }
    }
}
