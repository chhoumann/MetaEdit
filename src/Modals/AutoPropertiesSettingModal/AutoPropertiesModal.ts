import { App, Modal } from 'obsidian';
import type { AutoProperty } from '../../types/autoProperty';
import AutoPropertiesModalContent from './AutoPropertiesModalContent.svelte';

export default class AutoPropertiesModal extends Modal {
    public waitForResolve: Promise<AutoProperty[]>;
    private content: AutoPropertiesModalContent;
    private resolvePromise:
        | ((autoProperties: AutoProperty[]) => void)
        | undefined;
    private autoProperties: AutoProperty[];

    constructor(app: App, autoProperties: AutoProperty[]) {
        super(app);
        this.autoProperties = autoProperties;

        this.waitForResolve = new Promise<AutoProperty[]>(
            (resolve) => (this.resolvePromise = resolve),
        );

        this.content = new AutoPropertiesModalContent({
            target: this.contentEl,
            props: {
                save: (autoProperties: AutoProperty[]) =>
                    this.save(autoProperties),
                autoProperties,
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
        if (this.resolvePromise) {
            this.resolvePromise(this.autoProperties);
        }
    }
}
