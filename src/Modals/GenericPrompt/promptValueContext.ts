import type {MetaType} from "../../Types/metaType";

/**
 * The property a value prompt is editing. The controller passes this into
 * GenericPrompt.Prompt so the prompt can self-source value suggestions and
 * detect a date/datetime type. It carries only what the prompt needs (the
 * app comes in separately) and never the value itself.
 */
export interface PromptValueContext {
    key: string;
    type: MetaType;
}
