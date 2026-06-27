import type {App} from "obsidian";
import type {MetaType} from "../../Types/metaType";

export interface PromptValueContext {
    app: App;
    key: string;
    type: MetaType;
}

let pending: PromptValueContext | null = null;

/**
 * Bridges the property being edited from the entry point (metaEditSuggester) to
 * the value prompt (GenericPrompt).
 *
 * The controller orchestrates the edit and opens the prompt, but it does not
 * carry UI-suggestion context. Rather than threading that context through the
 * write/parse core (intentionally left untouched), the suggester stashes it here
 * for the next prompt to pick up. The suggester always sets it inside a
 * try/finally so it never outlives a single edit, and consumers take-and-clear
 * it on read so a stale context can never bleed into an unrelated later prompt.
 */
export function setPendingValueContext(context: PromptValueContext | null): void {
    pending = context;
}

export function consumePendingValueContext(): PromptValueContext | null {
    const context = pending;
    pending = null;
    return context;
}
