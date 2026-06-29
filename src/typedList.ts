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

export function appendTypedListItem(items: readonly TypedListItem[], item: TypedListItem): TypedListItem[] {
	return [...items, item];
}

export function prependTypedListItem(items: readonly TypedListItem[], item: TypedListItem): TypedListItem[] {
	return [item, ...items];
}

export function moveTypedListItem(
	items: readonly TypedListItem[],
	index: number,
	direction: "down" | "up",
): TypedListItem[] {
	const targetIndex = direction === "up" ? index - 1 : index + 1;
	if (index < 0 || index >= items.length || targetIndex < 0 || targetIndex >= items.length) {
		return [...items];
	}

	const next = [...items];
	[next[index], next[targetIndex]] = [next[targetIndex], next[index]];
	return next;
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
