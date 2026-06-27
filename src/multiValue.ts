import {MetaType} from "./Types/metaType";
import {EditMode} from "./Types/editMode";

/**
 * Pure, Obsidian-free helpers for editing multi-value (list) properties. Kept
 * separate from `metaController` so the list-mutation logic - where array
 * corruption bugs live - can be unit-tested in the jsdom-free `node` env.
 */

export interface EditModeSettings {
    mode: EditMode;
    properties: string[];
}

interface PropertyLike {
    key?: string;
    type?: MetaType;
    content?: unknown;
}

/**
 * Whether a property's stored value is a real YAML list. Such a value is
 * inherently multi-value and must be edited as a list regardless of the global
 * EditMode - editing it through a single-line text field would flatten the list
 * and destroy element boundaries (commas, `[[wikilinks]]`, types).
 */
export function isMultiValueYamlProperty(property: PropertyLike): boolean {
    return property.type === MetaType.YAML && Array.isArray(property.content);
}

/**
 * Decide whether to open the element-aware list editor for a property.
 *
 * A real YAML list always uses the list editor; otherwise the global EditMode
 * decides (AllMulti, or SomeMulti when the property is opted in).
 */
export function shouldUseMultiValueEditor(property: PropertyLike, editMode: EditModeSettings): boolean {
    if (isMultiValueYamlProperty(property)) return true;
    if (editMode.mode === EditMode.AllMulti) return true;
    if (editMode.mode === EditMode.SomeMulti && !!property.key && editMode.properties.includes(property.key)) {
        return true;
    }
    return false;
}

export type MultiValueEdit =
    | {kind: "addFirst"; value: string}
    | {kind: "prepend"; value: string}
    | {kind: "append"; value: string}
    | {kind: "replace"; index: number; value: string};

/**
 * Apply a single add/replace edit to a list, returning a NEW list.
 *
 * `base` is the list being edited: the original (typed) array for a YAML list,
 * or the comma-split string elements for an inline field. Untouched elements are
 * carried over by reference, so a YAML list keeps the exact type, ordering, and
 * spelling of every element the user did not touch - numbers stay numbers, null
 * stays null, and a value containing a comma or `[[wikilink]]` is never
 * re-split. Only the one element the user actually edited becomes their typed
 * string. A `replace` whose index is out of range (no element matched) replaces
 * the whole list with the single new value, mirroring the prior behaviour.
 */
export function applyMultiValueEdit(base: readonly unknown[], edit: MultiValueEdit): unknown[] {
    switch (edit.kind) {
        case "addFirst":
            return [edit.value];
        case "prepend":
            return [edit.value, ...base];
        case "append":
            return [...base, edit.value];
        case "replace": {
            if (edit.index < 0 || edit.index >= base.length) return [edit.value];
            const next = [...base];
            next[edit.index] = edit.value;
            return next;
        }
    }
}
