import {type App, Modal} from "obsidian";
import AutoPropertyValueModalContent from "./AutoPropertyValueModalContent.svelte";
import type {AutoProperty} from "../../Types/autoProperty";
import {type MountedSvelteComponent, mountSvelteComponent, unmountSvelteComponent} from "../../svelteMount";

export interface AutoPropertyValueModalOptions {
    isMulti: boolean;
    currentValue?: unknown;
    /** Persist new values into the auto property's choice list (issue #43). */
    onSaveChoices: (values: string[]) => void | Promise<void>;
}

/**
 * The value-entry experience for an Auto Property. Returns a string for a Single
 * property, a string[] for a Multi property, or null when the user cancels.
 *
 * This is deliberately its own modal (rather than the generic prompt/suggester)
 * so Auto Properties own their selection UX end to end: description display
 * (#59), pick-or-create with explicit "save as choice" (#43), multi-select
 * (#40), placeholder text and single-Enter confirm (#30). The small amount of
 * filter/keyboard logic is intentionally self-contained here rather than reusing
 * the generic suggester, whose concerns (free-text autocomplete) differ.
 */
export default class AutoPropertyValueModal extends Modal {
    private content: MountedSvelteComponent;
    private resolvePromise: (value: string | string[] | null) => void;
    private result: string | string[] | null = null;
    private didSubmit = false;
    public readonly waitForClose: Promise<string | string[] | null>;

    public static Show(
        app: App,
        autoProperty: AutoProperty,
        options: AutoPropertyValueModalOptions,
    ): Promise<string | string[] | null> {
        return new AutoPropertyValueModal(app, autoProperty, options).waitForClose;
    }

    private constructor(app: App, autoProperty: AutoProperty, options: AutoPropertyValueModalOptions) {
        super(app);

        this.waitForClose = new Promise((resolve) => (this.resolvePromise = resolve));

        this.content = mountSvelteComponent(
            AutoPropertyValueModalContent,
            this.contentEl,
            {
                autoProperty,
                isMulti: options.isMulti,
                currentValue: options.currentValue ?? null,
                onSaveChoices: options.onSaveChoices,
                onSubmit: (value: string | string[]) => {
                    this.result = value;
                    this.didSubmit = true;
                    this.close();
                },
            },
        );

        this.open();
    }

    onClose() {
        super.onClose();
        unmountSvelteComponent(this.content);
        this.resolvePromise(this.didSubmit ? this.result : null);
    }
}
