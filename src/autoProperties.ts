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
 * Whether an auto property should offer multi-select. This is the UNION of two
 * independent signals, so the per-property declaration never fights the global
 * EditMode - the more permissive one wins:
 *   - the auto property is explicitly declared "Multi", or
 *   - EditMode already treats this property as multi (AllMulti, or SomeMulti and
 *     the property is in the list).
 */
export function isMultiAutoProperty(
    autoProp: AutoProperty,
    editMode: EditModeSettings,
    propertyName: string,
): boolean {
    if (autoPropertyType(autoProp) === "Multi") return true;
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

/** Coerce a stored property value (string, CSV, YAML array, or list) into values. */
export function toValueArray(content: unknown): string[] {
    if (content === null || content === undefined) return [];
    if (Array.isArray(content)) {
        return content.map((v) => (v ?? "").toString().trim()).filter(Boolean);
    }
    return content
        .toString()
        .replace(/^\s*\[/, "")
        .replace(/\]\s*$/, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * The pre-checked option list for a multi prompt: the defined choices first, then
 * any current values that are not already a choice (so editing never silently
 * drops a value the user already had).
 */
export function multiSelectOptions(autoProp: AutoProperty, currentValue: unknown): string[] {
    const choices = normalizeChoices(autoProp.choices);
    const seen = new Set(choices);
    const out = [...choices];
    for (const value of toValueArray(currentValue)) {
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
