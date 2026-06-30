import type {App} from "obsidian";
import type {Property} from "../parser";
import {MetaType} from "../Types/metaType";
import {isPlainYamlObject, isYamlParentContainerValue} from "../yamlPath";

export const STANDARD_NATIVE_PROPERTY_TYPES = [
	"text",
	"multitext",
	"number",
	"checkbox",
	"date",
	"datetime",
	"tags",
	"aliases",
	"cssclasses",
] as const;

export type StandardNativePropertyType = typeof STANDARD_NATIVE_PROPERTY_TYPES[number];
export type NativeValueSource = "native" | "fallback";

export type NativePropertyPromptResult =
	| {
		kind: "submit";
		changed: boolean;
		type: StandardNativePropertyType;
		value: unknown;
		valueSource: NativeValueSource;
	}
	| {kind: "cancel"};

export type NormalizedWidgetValue =
	| {ok: true; value: unknown}
	| {ok: false; reason: string};

export type NativePropertyResolution =
	| {
		kind: "native";
		type: StandardNativePropertyType;
		widget: NativePropertyWidget;
	}
	| {
		kind: "fallback";
		reason: string;
		type: "text";
	};

export interface NativePropertyWidget {
	name?: unknown;
	type?: unknown;
	validate?: (value: unknown) => boolean;
	render?: (container: HTMLElement, value: unknown, ctx: NativePropertyWidgetContext) => unknown;
	reservedKeys?: unknown;
}

export interface NativePropertyWidgetContext {
	app: App;
	key: string;
	sourcePath: string;
	onChange: (value: unknown) => void;
	blur: () => void;
}

type MetadataTypeManager = {
	registeredTypeWidgets?: Record<string, NativePropertyWidget | undefined>;
	getAllProperties?: () => Record<string, {name?: unknown, widget?: unknown} | undefined>;
	getAssignedWidget?: (key: string) => unknown;
	getTypeInfo?: (key: string, value?: unknown) => {expected?: {type?: unknown}, inferred?: {type?: unknown}} | undefined;
};

const STANDARD_TYPE_SET: ReadonlySet<string> = new Set(STANDARD_NATIVE_PROPERTY_TYPES);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export function isNativeEditableYamlProperty(property: Property): boolean {
	return property.type === MetaType.YAML &&
		!property.path &&
		!property.isNested &&
		!property.isVirtual &&
		!isYamlParentContainerValue(property.content);
}

export function resolveNativeProperty(app: App, property: Property): NativePropertyResolution {
	const manager = getMetadataTypeManager(app);
	const widgets = manager?.registeredTypeWidgets;
	if (!widgets) {
		return {
			kind: "fallback",
			reason: "Obsidian native property widgets are not available.",
			type: "text",
		};
	}

	const type = resolveNativePropertyType(manager, widgets, property.key, property.content);
	const widget = widgets[type];
	if (!widget || typeof widget.render !== "function") {
		return {
			kind: "fallback",
			reason: `Obsidian's native ${type} property widget is not available.`,
			type: "text",
		};
	}

	return {kind: "native", type, widget};
}

export function normalizeWidgetValue(
	type: StandardNativePropertyType,
	value: unknown,
	valueSource: NativeValueSource,
): NormalizedWidgetValue {
	if (valueSource === "fallback") {
		return {ok: true, value: value === null || value === undefined ? "" : String(value)};
	}

	switch (type) {
		case "text":
			if (typeof value === "string" || value === null) return {ok: true, value};
			return invalidType(type, "a string or null");

		case "multitext":
		case "tags":
		case "aliases":
		case "cssclasses":
			if (typeof value === "string") return {ok: true, value};
			if (Array.isArray(value) && value.every(item => typeof item === "string")) {
				return {ok: true, value};
			}
			return invalidType(type, "a string or string array");

		case "number":
			if (value === null) return {ok: true, value};
			if (typeof value === "number" && Number.isFinite(value)) return {ok: true, value};
			return invalidType(type, "a finite number or null");

		case "checkbox":
			if (typeof value === "boolean") return {ok: true, value};
			return invalidType(type, "a boolean");

		case "date":
			if (value === null || value === "") return {ok: true, value};
			if (typeof value === "string" && DATE_RE.test(value)) return {ok: true, value};
			return invalidType(type, "an ISO date string, empty string, or null");

		case "datetime":
			if (value === null || value === "") return {ok: true, value};
			if (typeof value === "string" && DATETIME_RE.test(value)) return {ok: true, value};
			return invalidType(type, "an ISO datetime string, empty string, or null");
	}
}

export function frontmatterValuesEqual(left: unknown, right: unknown): boolean {
	if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
	if (left instanceof Date || right instanceof Date) return compareDateWithPrimitive(left, right);
	if (Array.isArray(left) || Array.isArray(right)) return arraysEqual(left, right);
	if (isPlainYamlObject(left) || isPlainYamlObject(right)) return objectsEqual(left, right);
	return Object.is(left, right);
}

function resolveNativePropertyType(
	manager: MetadataTypeManager,
	widgets: Record<string, NativePropertyWidget | undefined>,
	key: string,
	value: unknown,
): StandardNativePropertyType {
	const normalizedKey = key.toLowerCase();
	if (normalizedKey === "tags") return "tags";
	if (normalizedKey === "aliases") return "aliases";
	if (normalizedKey === "cssclasses" && widgets.cssclasses) return "cssclasses";

	const assigned = toStandardType(manager.getAssignedWidget?.(key), widgets);
	if (assigned) return assigned;

	const propertyInfoWidget = readPropertyInfoWidget(manager, key);
	const propertyInfoType = toStandardType(propertyInfoWidget, widgets);
	if (propertyInfoType) return propertyInfoType;

	const expected = readTypeInfoExpected(manager, key, value);
	const expectedType = toStandardType(expected, widgets);
	if (expectedType) return expectedType;

	return inferTypeFromValue(value);
}

function readPropertyInfoWidget(manager: MetadataTypeManager, key: string): unknown {
	try {
		const all = manager.getAllProperties?.();
		return all?.[key]?.widget ?? all?.[key.toLowerCase()]?.widget;
	} catch {
		return null;
	}
}

function readTypeInfoExpected(manager: MetadataTypeManager, key: string, value: unknown): unknown {
	try {
		return manager.getTypeInfo?.(key, value)?.expected?.type ??
			manager.getTypeInfo?.(key)?.expected?.type;
	} catch {
		return null;
	}
}

function toStandardType(value: unknown, widgets: Record<string, NativePropertyWidget | undefined>): StandardNativePropertyType | null {
	if (typeof value !== "string") return null;
	if (!STANDARD_TYPE_SET.has(value)) return null;
	if (value === "cssclasses" && !widgets.cssclasses) return null;
	return value as StandardNativePropertyType;
}

function inferTypeFromValue(value: unknown): StandardNativePropertyType {
	if (Array.isArray(value)) return "multitext";
	if (typeof value === "boolean") return "checkbox";
	if (typeof value === "number" && Number.isFinite(value)) return "number";
	if (value instanceof Date) return hasDateTime(value) ? "datetime" : "date";
	if (typeof value === "string") {
		if (DATETIME_RE.test(value)) return "datetime";
		if (DATE_RE.test(value)) return "date";
	}
	return "text";
}

function hasDateTime(value: Date): boolean {
	return value.getHours() !== 0 ||
		value.getMinutes() !== 0 ||
		value.getSeconds() !== 0 ||
		value.getMilliseconds() !== 0;
}

function invalidType(type: StandardNativePropertyType, expected: string): NormalizedWidgetValue {
	return {
		ok: false,
		reason: `Obsidian's native ${type} editor returned an unsupported value shape; expected ${expected}.`,
	};
}

function arraysEqual(left: unknown, right: unknown): boolean {
	if (!Array.isArray(left) || !Array.isArray(right)) return false;
	if (left.length !== right.length) return false;
	return left.every((value, index) => frontmatterValuesEqual(value, right[index]));
}

function objectsEqual(left: unknown, right: unknown): boolean {
	if (!isPlainYamlObject(left) || !isPlainYamlObject(right)) return false;

	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) return false;

	return leftKeys.every(key =>
		Object.prototype.hasOwnProperty.call(right, key) &&
		frontmatterValuesEqual(left[key], right[key]),
	);
}

function compareDateWithPrimitive(left: unknown, right: unknown): boolean {
	const date = left instanceof Date ? left : right instanceof Date ? right : null;
	const other = left instanceof Date ? right : left;
	if (!date || typeof other !== "string") return false;

	if (DATE_RE.test(other)) return date.toISOString().slice(0, 10) === other;
	if (DATETIME_RE.test(other)) return date.toISOString().replace(/\.\d{3}Z$/, "").startsWith(other);
	return false;
}

function getMetadataTypeManager(app: App): MetadataTypeManager | null {
	return (app as unknown as {metadataTypeManager?: MetadataTypeManager}).metadataTypeManager ?? null;
}
