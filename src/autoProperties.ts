import type {AutoProperty, AutoPropertyType} from "./Types/autoProperty";
import {EditMode} from "./Types/editMode";

/**
 * Pure, Obsidian-free helpers for the Auto Properties feature. Kept separate from
 * `metaController` and the Svelte modals so the logic can be unit-tested in the
 * jsdom-free `node` test environment.
 */

export interface EditModeSettings {
    mode: EditMode;
    properties: string[];
}

/** Find the auto property whose name matches `propertyName` (first match wins). */
export function findAutoProperty(
    properties: AutoProperty[] | undefined,
    propertyName: string,
): AutoProperty | undefined {
    return properties?.find((a) => a.name === propertyName);
}

/** The effective selection type, treating a missing `type` as "Single". */
export function autoPropertyType(autoProp: AutoProperty): AutoPropertyType {
    return autoProp.type === "Multi" ? "Multi" : "Single";
}

/**
 * Whether an auto property should offer multi-select.
 *
 * An explicit `type` is authoritative: "Multi" is always multi, "Single" is
 * always single - so the per-property choice wins over the global EditMode in
 * both directions. When `type` is absent (data from before this field existed)
 * the property inherits the global EditMode (AllMulti, or SomeMulti and the
 * property is in the list), preserving prior behaviour on upgrade.
 */
export function isMultiAutoProperty(
    autoProp: AutoProperty,
    editMode: EditModeSettings,
    propertyName: string,
): boolean {
    if (autoProp.type === "Multi") return true;
    if (autoProp.type === "Single") return false;
    // No explicit type: inherit the global EditMode.
    if (editMode.mode === EditMode.AllMulti) return true;
    if (editMode.mode === EditMode.SomeMulti && editMode.properties.includes(propertyName)) {
        return true;
    }
    return false;
}

/** Trimmed, de-duplicated, non-empty choices - what the prompt should display. */
export function normalizeChoices(choices: string[] | undefined): string[] {
    if (!choices) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of choices) {
        const choice = (raw ?? "").trim();
        if (choice === "" || seen.has(choice)) continue;
        seen.add(choice);
        out.push(choice);
    }
    return out;
}

/**
 * Split pasted text into individual choice tokens so a whole list can be added at
 * once (issue #47).
 *
 * Newline-primary: when the text contains any line break, split on lines only -
 * this keeps a single value that happens to contain a comma (e.g. "Doe, Jane" on
 * its own line) intact. Only when there is no line break at all do we fall back to
 * splitting on commas, since then a comma is the only plausible separator. (The
 * trade-off: a lone, newline-free value that contains a comma - "Doe, Jane",
 * "1,000" - is read as two tokens, since nothing distinguishes it from a CSV pair.)
 *
 * Tokens are trimmed and blank-dropped but NOT de-duped: the count tells a caller
 * whether the paste was structurally a list (>= 2 tokens, even if all equal) versus
 * a single value, so an all-duplicate paste is still treated as a list. De-duping
 * happens later, when the tokens are merged into the existing choices.
 */
export function splitPastedChoices(text: string): string[] {
    if (!text) return [];
    const parts = /[\r\n]/.test(text) ? text.split(/\r\n|\r|\n/) : text.split(",");
    return parts.map((p) => p.trim()).filter((p) => p !== "");
}

/**
 * Apply a pasted list of choice `tokens` to the value at `index`: the pasted row is
 * replaced by the tokens, expanding one box into several (issue #47). Tokens that
 * duplicate a choice in another row, or an earlier token in the same paste, are
 * dropped (trim-insensitive); every other row - including blanks the user left
 * elsewhere - is preserved in place.
 */
export function withChoicesPasted(choices: string[], index: number, tokens: string[]): string[] {
    const before = choices.slice(0, index);
    const after = choices.slice(index + 1);
    const taken = new Set(
        [...before, ...after].map((c) => (c ?? "").trim()).filter((c) => c !== ""),
    );
    const inserted: string[] = [];
    for (const raw of tokens) {
        const choice = (raw ?? "").trim();
        if (choice === "" || taken.has(choice)) continue;
        taken.add(choice);
        inserted.push(choice);
    }
    return [...before, ...inserted, ...after];
}

// Historical string values are loose comma lists, not parsed YAML/JSON. Keep the
// coercion narrow: only commas outside Obsidian wikilinks divide elements.
function splitCommaSeparatedValues(value: string): string[] {
    const parts: string[] = [];
    let start = 0;
    let wikilinkDepth = 0;

    for (let i = 0; i < value.length; i++) {
        if (value.startsWith("[[", i)) {
            wikilinkDepth++;
            i++;
            continue;
        }
        if (wikilinkDepth > 0 && value.startsWith("]]", i)) {
            wikilinkDepth--;
            i++;
            continue;
        }
        if (value[i] === "," && wikilinkDepth === 0) {
            parts.push(value.slice(start, i));
            start = i + 1;
        }
    }

    parts.push(value.slice(start));
    return parts;
}

function matchingOuterBracketIndex(value: string): number | null {
    let depth = 0;

    for (let i = 0; i < value.length; i++) {
        const char = value[i];
        if (char === "[") {
            depth++;
        } else if (char === "]") {
            depth--;
            if (depth === 0) return i;
            if (depth < 0) return null;
        }
    }

    return null;
}

function shouldUnwrapBracketedList(value: string): boolean {
    if (!value.startsWith("[") || !value.endsWith("]")) return false;
    if (value.startsWith("[[")) return false;
    if (matchingOuterBracketIndex(value) !== value.length - 1) return false;

    const innerValue = value.slice(1, -1);
    if (innerValue.trim() === "") return true;

    return splitCommaSeparatedValues(innerValue).length > 1;
}

/** Coerce a stored property value (string, CSV, YAML array, or list) into values. */
export function toValueArray(content: unknown): string[] {
    if (content === null || content === undefined) return [];
    if (Array.isArray(content)) {
        return content.map((v) => (v ?? "").toString().trim()).filter(Boolean);
    }

    const value = content.toString().trim();
    const splitValue = shouldUnwrapBracketedList(value) ? value.slice(1, -1) : value;

    return splitCommaSeparatedValues(splitValue)
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * The option list for a multi prompt: the current values first, in their existing
 * order, then the defined choices that are not already set. Current-first keeps a
 * user's existing list order stable - newly checked choices append at the end
 * rather than reshuffling what was already there - and never drops a value the
 * user already had, even if it is not a defined choice.
 */
export function multiSelectOptions(autoProp: AutoProperty, currentValue: unknown): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const value of [...toValueArray(currentValue), ...normalizeChoices(autoProp.choices)]) {
        if (!seen.has(value)) {
            seen.add(value);
            out.push(value);
        }
    }
    return out;
}

/** True when `value` is a non-empty value not already among the defined choices. */
export function isNewChoice(autoProp: AutoProperty, value: string): boolean {
    const trimmed = value.trim();
    if (trimmed === "") return false;
    return !(autoProp.choices ?? []).some((c) => (c ?? "").trim() === trimmed);
}

/**
 * Immutably append `value` to an auto property's choices, trimming and de-duping.
 * Returns the same reference when nothing changes so callers can skip a save.
 */
export function withChoiceAdded(autoProp: AutoProperty, value: string): AutoProperty {
    if (!isNewChoice(autoProp, value)) return autoProp;
    return {...autoProp, choices: [...(autoProp.choices ?? []), value.trim()]};
}
