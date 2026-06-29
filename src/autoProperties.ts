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

export interface AutoPropertyOperationTarget {
    name: string;
    index: number;
}

export type AutoPropertySettingsOperation =
    | {kind: "addProperty"; index: number; property: AutoProperty}
    | {kind: "removeProperty"; target: AutoPropertyOperationTarget}
    | {kind: "setName"; target: AutoPropertyOperationTarget; value: string}
    | {kind: "setDescription"; target: AutoPropertyOperationTarget; value: string}
    | {kind: "setType"; target: AutoPropertyOperationTarget; value: AutoPropertyType}
    | {kind: "addChoice"; target: AutoPropertyOperationTarget; index: number; value: string}
    | {kind: "removeChoice"; target: AutoPropertyOperationTarget; index: number; value: string}
    | {kind: "setChoice"; target: AutoPropertyOperationTarget; index: number; previousValue: string; value: string}
    | {kind: "replaceChoiceWithChoices"; target: AutoPropertyOperationTarget; index: number; previousValue: string; values: string[]};

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

export function cloneAutoProperty(property: AutoProperty): AutoProperty {
    const clone: AutoProperty = {
        name: property.name,
        choices: Array.isArray(property.choices) ? [...property.choices] : [],
    };

    if (property.description !== undefined) clone.description = property.description;
    if (property.type !== undefined) clone.type = property.type;
    return clone;
}

export function cloneAutoProperties(properties: AutoProperty[] | undefined): AutoProperty[] {
    if (!Array.isArray(properties)) return [];
    return properties.map(cloneAutoProperty);
}

export function applyAutoPropertySettingsOperation(
    properties: AutoProperty[],
    operation: AutoPropertySettingsOperation,
): AutoProperty[] | false {
    const next = cloneAutoProperties(properties);

    switch (operation.kind) {
        case "addProperty": {
            const index = boundedInsertIndex(operation.index, next.length);
            next.splice(index, 0, cloneAutoProperty(operation.property));
            return next;
        }
        case "removeProperty": {
            const index = findAutoPropertyOperationTargetIndex(next, operation.target);
            if (index === -1) return false;
            next.splice(index, 1);
            return next;
        }
        case "setName":
        case "setDescription":
        case "setType": {
            const index = findAutoPropertyOperationTargetIndex(next, operation.target);
            if (index === -1) return false;
            const current = next[index];
            if (operation.kind === "setName") {
                if (current.name === operation.value) return false;
                current.name = operation.value;
            } else if (operation.kind === "setDescription") {
                if ((current.description ?? "") === operation.value) return false;
                current.description = operation.value;
            } else {
                if ((current.type ?? "Single") === operation.value) return false;
                current.type = operation.value;
            }
            return next;
        }
        case "addChoice": {
            const property = findAutoPropertyOperationTarget(next, operation.target);
            if (!property) return false;
            property.choices.splice(boundedInsertIndex(operation.index, property.choices.length), 0, operation.value);
            return next;
        }
        case "removeChoice": {
            const property = findAutoPropertyOperationTarget(next, operation.target);
            if (!property) return false;
            const choiceIndex = findExistingChoiceIndex(property.choices, operation.index, operation.value);
            if (choiceIndex === -1) return false;
            property.choices.splice(choiceIndex, 1);
            return next;
        }
        case "setChoice": {
            const property = findAutoPropertyOperationTarget(next, operation.target);
            if (!property) return false;
            if (operation.previousValue === operation.value) return false;
            const choiceIndex = findWritableChoiceIndex(property.choices, operation.index, operation.previousValue);
            property.choices.splice(choiceIndex, choiceIndex < property.choices.length ? 1 : 0, operation.value);
            return next;
        }
        case "replaceChoiceWithChoices": {
            const property = findAutoPropertyOperationTarget(next, operation.target);
            if (!property) return false;
            const choiceIndex = findExistingChoiceIndex(property.choices, operation.index, operation.previousValue);
            if (choiceIndex === -1) {
                property.choices = withChoicesInserted(property.choices, operation.index, operation.values);
            } else {
                property.choices = withChoicesPasted(property.choices, choiceIndex, operation.values);
            }
            return next;
        }
    }
}

function boundedInsertIndex(index: number, length: number): number {
    if (!Number.isFinite(index)) return length;
    return Math.max(0, Math.min(index, length));
}

function findAutoPropertyOperationTarget(properties: AutoProperty[], target: AutoPropertyOperationTarget): AutoProperty | undefined {
    const index = findAutoPropertyOperationTargetIndex(properties, target);
    return index === -1 ? undefined : properties[index];
}

function findAutoPropertyOperationTargetIndex(properties: AutoProperty[], target: AutoPropertyOperationTarget): number {
    if (isValidIndex(target.index, properties.length) && properties[target.index].name === target.name) {
        return target.index;
    }

    if (target.name !== "") {
        const namedIndex = properties.findIndex(property => property.name === target.name);
        if (namedIndex !== -1) return namedIndex;
    }

    if (target.name === "" && isValidIndex(target.index, properties.length)) return target.index;

    return -1;
}

function findExistingChoiceIndex(choices: string[], index: number, value: string): number {
    if (isValidIndex(index, choices.length) && choices[index] === value) return index;

    return choices.findIndex(choice => choice === value);
}

function findWritableChoiceIndex(choices: string[], index: number, value: string): number {
    const existingIndex = findExistingChoiceIndex(choices, index, value);
    if (existingIndex !== -1) return existingIndex;
    return boundedInsertIndex(index, choices.length);
}

function withChoicesInserted(choices: string[], index: number, tokens: string[]): string[] {
    const next = [...choices];
    const taken = new Set(next.map((c) => (c ?? "").trim()).filter((c) => c !== ""));
    const inserted: string[] = [];

    for (const raw of tokens) {
        const choice = (raw ?? "").trim();
        if (choice === "" || taken.has(choice)) continue;
        taken.add(choice);
        inserted.push(choice);
    }

    next.splice(boundedInsertIndex(index, next.length), 0, ...inserted);
    return next;
}

function isValidIndex(index: number, length: number): boolean {
    return Number.isInteger(index) && index >= 0 && index < length;
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
