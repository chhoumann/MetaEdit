import {describe, expect, it} from "vitest";
import {MetaType} from "./Types/metaType";
import {EditMode} from "./Types/editMode";
import {
    applyMultiValueEdit,
    isMultiValueYamlProperty,
    shouldUseMultiValueEditor,
} from "./multiValue";

describe("isMultiValueYamlProperty", () => {
    it("is true only for a YAML property whose value is a real array", () => {
        expect(isMultiValueYamlProperty({type: MetaType.YAML, content: ["a", "b"]})).toBe(true);
        expect(isMultiValueYamlProperty({type: MetaType.YAML, content: []})).toBe(true);
    });

    it("is false for YAML scalars, non-YAML types, and empty content", () => {
        expect(isMultiValueYamlProperty({type: MetaType.YAML, content: "a, b"})).toBe(false);
        expect(isMultiValueYamlProperty({type: MetaType.YAML, content: null})).toBe(false);
        expect(isMultiValueYamlProperty({type: MetaType.YAML, content: 5})).toBe(false);
        expect(isMultiValueYamlProperty({type: MetaType.Dataview, content: ["a", "b"]})).toBe(false);
        expect(isMultiValueYamlProperty({type: MetaType.Tag, content: "#a"})).toBe(false);
    });
});

describe("shouldUseMultiValueEditor", () => {
    const allSingle = {mode: EditMode.AllSingle, properties: [] as string[]};
    const allMulti = {mode: EditMode.AllMulti, properties: [] as string[]};

    it("always routes a real YAML list to the list editor, even in AllSingle (#94)", () => {
        expect(shouldUseMultiValueEditor({key: "tags", type: MetaType.YAML, content: ["a", "b"]}, allSingle)).toBe(true);
    });

    it("keeps a YAML scalar on the single-value path in AllSingle", () => {
        expect(shouldUseMultiValueEditor({key: "status", type: MetaType.YAML, content: "open"}, allSingle)).toBe(false);
    });

    it("honours AllMulti and SomeMulti for non-array values", () => {
        expect(shouldUseMultiValueEditor({key: "status", type: MetaType.Dataview, content: "a"}, allMulti)).toBe(true);

        const someMulti = {mode: EditMode.SomeMulti, properties: ["tags"]};
        expect(shouldUseMultiValueEditor({key: "tags", type: MetaType.Dataview, content: "a"}, someMulti)).toBe(true);
        expect(shouldUseMultiValueEditor({key: "status", type: MetaType.Dataview, content: "a"}, someMulti)).toBe(false);
    });
});

describe("applyMultiValueEdit", () => {
    it("adds the first element to an empty list", () => {
        expect(applyMultiValueEdit([], {kind: "addFirst", value: "a"})).toEqual(["a"]);
    });

    it("prepends and appends without disturbing existing elements", () => {
        expect(applyMultiValueEdit(["b", "c"], {kind: "prepend", value: "a"})).toEqual(["a", "b", "c"]);
        expect(applyMultiValueEdit(["a", "b"], {kind: "append", value: "c"})).toEqual(["a", "b", "c"]);
    });

    it("replaces only the targeted element", () => {
        expect(applyMultiValueEdit(["a", "b", "c"], {kind: "replace", index: 1, value: "B"})).toEqual(["a", "B", "c"]);
    });

    it("replaces the whole list when no element matched (index -1)", () => {
        expect(applyMultiValueEdit(["a", "b"], {kind: "replace", index: -1, value: "x"})).toEqual(["x"]);
    });

    // The core regression: editing one element must NOT shred the others.
    it("preserves elements that contain commas (#94)", () => {
        expect(applyMultiValueEdit(["Smith, John", "Doe, Jane"], {kind: "replace", index: 1, value: "Roe, Jane"}))
            .toEqual(["Smith, John", "Roe, Jane"]);
    });

    it("preserves bracketed values and wikilinks", () => {
        expect(applyMultiValueEdit(["[[Home]]"], {kind: "append", value: "[[Away]]"}))
            .toEqual(["[[Home]]", "[[Away]]"]);
        expect(applyMultiValueEdit(["[draft]", "[final]"], {kind: "replace", index: 0, value: "[wip]"}))
            .toEqual(["[wip]", "[final]"]);
    });

    it("keeps the type of every untouched element (numbers, booleans, null)", () => {
        expect(applyMultiValueEdit([1, true, null, 3], {kind: "replace", index: 1, value: "maybe"}))
            .toEqual([1, "maybe", null, 3]);
    });

    it("does not mutate the input list", () => {
        const base = ["a", "b"];
        applyMultiValueEdit(base, {kind: "replace", index: 0, value: "X"});
        expect(base).toEqual(["a", "b"]);
    });
});
