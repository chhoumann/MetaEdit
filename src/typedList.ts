import type {Property} from "./parser";
import {MetaType} from "./Types/metaType";
import {isTagsKey} from "./tagEditing";

export type TypedListPromptResult =
	| {kind: "submit"; value: unknown[]}
	| {kind: "cancel"};

export type TypedListItem =
	| {
		id: string;
		kind: "original";
		originalValue: unknown;
		text: string;
	}
	| {
		id: string;
		kind: "added";
		text: string;
	};

type PropertyLike = Pick<Property, "content" | "isNested" | "isVirtual" | "key" | "type">;

export function shouldUseTypedListEditor(property: PropertyLike): boolean {
	return property.type === MetaType.YAML &&
		!property.isVirtual &&
		!property.isNested &&
		Array.isArray(property.content) &&
		!isTagsKey(property.key) &&
		property.key.toLowerCase() !== "aliases";
}

export function createTypedListItems(values: readonly unknown[]): TypedListItem[] {
	return values.map((value, index) => ({
		id: `item-${index}`,
		kind: "original",
		originalValue: value,
		text: displayTypedListValue(value),
	}));
}

export function createAddedTypedListItem(id: string, text: string): TypedListItem {
	return {id, kind: "added", text};
}

export function displayTypedListValue(value: unknown): string {
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) return "";
		const iso = value.toISOString();
		return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
	}
	return value == null ? "" : String(value);
}

export function reconstructTypedList(items: readonly TypedListItem[]): unknown[] {
	return items.map(item => {
		if (item.kind === "added") return item.text;
		return item.text === displayTypedListValue(item.originalValue)
			? item.originalValue
			: item.text;
	});
}
