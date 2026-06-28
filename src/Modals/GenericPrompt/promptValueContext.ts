import type {App} from "obsidian";
import type {MetaType} from "../../Types/metaType";
import type {TagEditMode} from "../../tagEditing";

export interface PromptValueContext {
    app: App;
    key: string;
    type: MetaType;
    // For a body-tag edit: which suggestions to source - full tag names for a
    // rename, leaf segments for a last-segment edit.
    tagMode?: TagEditMode;
}

let pending: PromptValueContext | null = null;

/**
 * Bridges the property being edited from the entry point (metaEditSuggester) to
 * the value prompt (GenericPrompt) without routing UI-suggestion concerns
 * through the controller's write/parse core, which is owned by other work and
 * changes often. metaEditSuggester sets the context inside a try/finally so it
 * never outlives one edit, and the prompt takes-and-clears it on mount so a
 * stale context can never bleed into a later, unrelated prompt.
 */
export function setPendingValueContext(context: PromptValueContext | null): void {
    pending = context;
}

export function consumePendingValueContext(): PromptValueContext | null {
    const context = pending;
    pending = null;
    return context;
}
