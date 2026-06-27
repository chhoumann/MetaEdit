import {describe, expect, it} from "vitest";
import {
    autoPropertyType,
    findAutoProperty,
    isMultiAutoProperty,
    isNewChoice,
    multiSelectOptions,
    normalizeChoices,
    toValueArray,
    withChoiceAdded,
} from "./autoProperties";
import type {AutoProperty} from "./Types/autoProperty";
import {EditMode} from "./Types/editMode";

const single: AutoProperty = {name: "status", choices: ["todo", "done"], type: "Single"};
const multi: AutoProperty = {name: "tags", choices: ["a", "b"], type: "Multi"};

describe("findAutoProperty", () => {
    it("returns the first match by name", () => {
        expect(findAutoProperty([single, multi], "tags")).toBe(multi);
    });

    it("returns undefined when absent or list missing", () => {
        expect(findAutoProperty([single], "nope")).toBeUndefined();
        expect(findAutoProperty(undefined, "status")).toBeUndefined();
    });
});

describe("autoPropertyType", () => {
    it("treats a missing type as Single (back-compat with old data.json)", () => {
        expect(autoPropertyType({name: "x", choices: []})).toBe("Single");
        expect(autoPropertyType(multi)).toBe("Multi");
    });
});

describe("isMultiAutoProperty", () => {
    const allSingle = {mode: EditMode.AllSingle, properties: []};

    it("is multi when the property declares type Multi, regardless of EditMode", () => {
        expect(isMultiAutoProperty(multi, allSingle, "tags")).toBe(true);
        expect(isMultiAutoProperty(multi, {mode: EditMode.AllSingle, properties: []}, "tags")).toBe(true);
    });

    it("is single for an explicit Single property under AllSingle", () => {
        expect(isMultiAutoProperty(single, allSingle, "status")).toBe(false);
    });

    it("an explicit Single property overrides AllMulti (type is authoritative)", () => {
        expect(isMultiAutoProperty(single, {mode: EditMode.AllMulti, properties: []}, "status")).toBe(false);
    });

    it("a type-less property inherits the global EditMode", () => {
        const legacy: AutoProperty = {name: "status", choices: ["todo"]};
        expect(isMultiAutoProperty(legacy, allSingle, "status")).toBe(false);
        expect(isMultiAutoProperty(legacy, {mode: EditMode.AllMulti, properties: []}, "status")).toBe(true);
    });

    it("a type-less property under SomeMulti is multi only when listed", () => {
        const legacy: AutoProperty = {name: "status", choices: ["todo"]};
        const some = {mode: EditMode.SomeMulti, properties: ["status"]};
        expect(isMultiAutoProperty(legacy, some, "status")).toBe(true);
        expect(isMultiAutoProperty(legacy, some, "other")).toBe(false);
    });
});

describe("normalizeChoices", () => {
    it("trims, drops empties, and de-dupes while preserving order", () => {
        expect(normalizeChoices([" todo ", "todo", "", "done", "  "])).toEqual(["todo", "done"]);
    });

    it("handles undefined", () => {
        expect(normalizeChoices(undefined)).toEqual([]);
    });
});

describe("toValueArray", () => {
    it("returns [] for null/undefined", () => {
        expect(toValueArray(null)).toEqual([]);
        expect(toValueArray(undefined)).toEqual([]);
    });

    it("splits CSV strings", () => {
        expect(toValueArray("a, b ,c")).toEqual(["a", "b", "c"]);
    });

    it("strips YAML inline-array brackets", () => {
        expect(toValueArray("[a, b]")).toEqual(["a", "b"]);
    });

    it("passes through arrays", () => {
        expect(toValueArray(["a", " b ", "", "c"])).toEqual(["a", "b", "c"]);
    });
});

describe("multiSelectOptions", () => {
    it("lists current values first (preserving order) then remaining choices", () => {
        expect(multiSelectOptions(multi, ["b", "custom"])).toEqual(["b", "custom", "a"]);
    });

    it("never drops a pre-existing value that is not a defined choice", () => {
        expect(multiSelectOptions({name: "x", choices: []}, ["kept"])).toEqual(["kept"]);
    });

    it("returns the defined choices when there is no current value", () => {
        expect(multiSelectOptions(multi, null)).toEqual(["a", "b"]);
    });
});

describe("isNewChoice / withChoiceAdded", () => {
    it("detects values not already in choices (trim-insensitive)", () => {
        expect(isNewChoice(single, "todo")).toBe(false);
        expect(isNewChoice(single, " todo ")).toBe(false);
        expect(isNewChoice(single, "blocked")).toBe(true);
        expect(isNewChoice(single, "  ")).toBe(false);
    });

    it("appends a trimmed new choice immutably", () => {
        const next = withChoiceAdded(single, " blocked ");
        expect(next).not.toBe(single);
        expect(next.choices).toEqual(["todo", "done", "blocked"]);
        expect(single.choices).toEqual(["todo", "done"]);
    });

    it("returns the same reference when nothing is added", () => {
        expect(withChoiceAdded(single, "todo")).toBe(single);
        expect(withChoiceAdded(single, "  ")).toBe(single);
    });
});
