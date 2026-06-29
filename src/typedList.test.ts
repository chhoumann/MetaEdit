import {describe, expect, it} from "vitest";
import {
	createAddedTypedListItem,
	createTypedListItems,
	displayTypedListValue,
	reconstructTypedList,
	shouldUseTypedListEditor,
} from "./typedList";
import {MetaType} from "./Types/metaType";

describe("shouldUseTypedListEditor", () => {
	it("routes only ordinary top-level YAML arrays", () => {
		expect(shouldUseTypedListEditor({key: "topics", type: MetaType.YAML, content: ["a"]})).toBe(true);
		expect(shouldUseTypedListEditor({key: "topics", type: MetaType.Dataview, content: ["a"]})).toBe(false);
		expect(shouldUseTypedListEditor({key: "topics", type: MetaType.YAML, content: "a"})).toBe(false);
		expect(shouldUseTypedListEditor({key: "topics", type: MetaType.YAML, content: ["a"], isNested: true})).toBe(false);
		expect(shouldUseTypedListEditor({key: "topics", type: MetaType.YAML, content: ["a"], isVirtual: true})).toBe(false);
	});

	it("leaves tags and aliases on their existing routes", () => {
		expect(shouldUseTypedListEditor({key: "tags", type: MetaType.YAML, content: ["a"]})).toBe(false);
		expect(shouldUseTypedListEditor({key: "tag", type: MetaType.YAML, content: ["a"]})).toBe(false);
		expect(shouldUseTypedListEditor({key: "aliases", type: MetaType.YAML, content: ["Alias"]})).toBe(false);
	});
});

describe("reconstructTypedList", () => {
	it("preserves untouched mixed values by their original type", () => {
		// The current controller refuses arrays containing object elements as YAML
		// parent containers. The pure reconstruction helper still preserves an
		// object if a future typed editor safely routes one through it.
		const objectValue = {nested: "value"};
		const items = createTypedListItems([1, true, null, objectValue, "[[A, B]]"]);

		expect(reconstructTypedList(items)).toEqual([1, true, null, objectValue, "[[A, B]]"]);
	});

	it("changes only the edited element", () => {
		const items = createTypedListItems([1, true, null, "old"]);
		items[3] = {...items[3], text: "new"};

		expect(reconstructTypedList(items)).toEqual([1, true, null, "new"]);
	});

	it("preserves order and duplicates", () => {
		const items = createTypedListItems(["dup", "dup", "tail"]);
		items.splice(2, 0, createAddedTypedListItem("item-3", "dup"));

		expect(reconstructTypedList(items)).toEqual(["dup", "dup", "dup", "tail"]);
	});

	it("preserves wikilinks with commas as one item", () => {
		const items = createTypedListItems(["[[A, B]]", "next"]);

		expect(reconstructTypedList(items)).toEqual(["[[A, B]]", "next"]);
	});

	it("does not stringify a typed value after a no-op edit", () => {
		const items = createTypedListItems([1, false, null]);
		items[0] = {...items[0], text: "1"};
		items[1] = {...items[1], text: "false"};
		items[2] = {...items[2], text: ""};

		expect(reconstructTypedList(items)).toEqual([1, false, null]);
	});

	it("formats dates predictably for display while preserving them if untouched", () => {
		const date = new Date("2026-01-02T00:00:00.000Z");
		const items = createTypedListItems([date]);

		expect(displayTypedListValue(date)).toBe("2026-01-02");
		expect(reconstructTypedList(items)).toEqual([date]);
	});
});
