import type {App} from "obsidian";
import type {Property} from "../parser";
import {MetaType} from "../Types/metaType";
import {isTagsKey} from "../tagEditing";
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

// The types a user can pick for a property (creating a new one, or switching an
// existing one), mirroring Obsidian's own Set-type menu (Text, List, Number,
// Checkbox, Date, Date & time). Reserved keys (tags/aliases/cssclasses) lock to
// their widget instead of offering this list. Labels are user-facing; the `type`
// is the internal widget id.
export const NATIVE_TYPE_CHOICES: ReadonlyArray<{type: StandardNativePropertyType; label: string}> = [
	{type: "text", label: "Text"},
	{type: "multitext", label: "List"},
	{type: "number", label: "Number"},
	{type: "checkbox", label: "Checkbox"},
	{type: "date", label: "Date"},
	{type: "datetime", label: "Date & time"},
];

// Reserved widget types lock the type picker (switching a `tags`/`aliases`
// property to Number is nonsense). `cssclasses` only resolves as its own type
// when Obsidian registers that widget; otherwise it maps to the List widget and
// this lock never applies to it.
export const LOCKED_NATIVE_TYPES: ReadonlySet<StandardNativePropertyType> = new Set(["tags", "aliases", "cssclasses"]);

export type NativePropertyPromptResult =
	| {
		kind: "submit";
		changed: boolean;
		// The user switched the property's type in the edit prompt. The value is
		// already reshaped for the new type; the caller still owns updating
		// Obsidian's vault-wide type memory (assignVaultPropertyType).
		typeChanged: boolean;
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
	icon?: unknown;
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
	setType?: (key: string, type: string) => unknown;
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

/**
 * Persist `type` as `key`'s property type in Obsidian's VAULT-WIDE type memory
 * (`.obsidian/types.json`), exactly like Obsidian's own "Property type" menu.
 * Feature-detected internal API: returns false (writing nothing) when this
 * Obsidian build does not expose `metadataTypeManager.setType`, or when the call
 * throws; the caller decides how to surface that.
 */
/** Whether this Obsidian build exposes the vault-wide type setter at all. */
export function canAssignVaultPropertyType(app: App): boolean {
	return typeof getMetadataTypeManager(app)?.setType === "function";
}

export async function assignVaultPropertyType(app: App, key: string, type: StandardNativePropertyType): Promise<boolean> {
	const manager = getMetadataTypeManager(app);
	if (!manager || typeof manager.setType !== "function") return false;
	try {
		await manager.setType(key, type);
		return true;
	} catch {
		return false;
	}
}

/**
 * Obsidian's registered native widget for an explicit type, or null when the
 * registry or that widget is unavailable. Centralizes the internal-API access so
 * both the edit prompt and the create modal resolve widgets one way.
 */
export function getNativeWidgetForType(app: App, type: StandardNativePropertyType): NativePropertyWidget | null {
	const widget = getMetadataTypeManager(app)?.registeredTypeWidgets?.[type];
	return widget && typeof widget.render === "function" ? widget : null;
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

// ---------------------------------------------------------------------------
// Property creation (fluid, type-aware). Pure logic behind the create modal, so
// the type/inference/seed behavior is unit-tested without a DOM. See
// src/Modals/NativePropertyCreatePrompt.
// ---------------------------------------------------------------------------

/**
 * The type to adopt for a brand-new property key, using Obsidian's vault-wide
 * type memory - with ZERO value-shape inference, because at key-entry time there
 * is no value yet. This is the {@link resolveNativeProperty} ladder minus the
 * final `inferTypeFromValue` step: reserved key name -> assigned widget ->
 * property-info widget -> `getTypeInfo(key).expected` (Obsidian's own vault
 * inference, which returns `text` for an unknown key) -> `text`.
 *
 * So a key the vault already knows (e.g. `due` used as dates elsewhere) adopts
 * that type with zero friction, while a brand-new key defaults to `text`.
 */
export function resolveCreationType(app: App, key: string): StandardNativePropertyType {
	const manager = getMetadataTypeManager(app);
	const widgets = manager?.registeredTypeWidgets;
	if (!manager || !widgets) return "text";

	const normalizedKey = key.toLowerCase();
	// Both `tags` and the singular `tag` are Obsidian tag frontmatter (matching
	// isTagsKey and the legacy addYamlProp path), so a new `tag` key adopts the
	// tags widget and is written as tag metadata, not a plain text scalar.
	if (isTagsKey(normalizedKey)) return "tags";
	if (normalizedKey === "aliases") return "aliases";
	if (normalizedKey === "cssclasses" && widgets.cssclasses) return "cssclasses";

	const assigned = toStandardType(manager.getAssignedWidget?.(key), widgets);
	if (assigned) return assigned;

	const propertyInfoType = toStandardType(readPropertyInfoWidget(manager, key), widgets);
	if (propertyInfoType) return propertyInfoType;

	const expectedType = toStandardType(readTypeInfoExpected(manager, key, undefined), widgets);
	if (expectedType) return expectedType;

	return "text";
}

/**
 * The empty seed value to mount a freshly-created widget against, per type. Every
 * value here is one {@link normalizeWidgetValue} accepts for that type as a native
 * source, so an untouched create-mode widget always commits a valid empty value
 * (text `""`, number `null`, checkbox `false`, date/datetime `""`, list `[]`).
 */
export function emptyValueForType(type: StandardNativePropertyType): unknown {
	switch (type) {
		case "number":
			return null;
		case "checkbox":
			return false;
		case "multitext":
		case "tags":
		case "aliases":
		case "cssclasses":
			return [];
		case "text":
		case "date":
		case "datetime":
			return "";
	}
}

/**
 * A SUGGESTED richer type for the value the user is typing into the default text
 * widget, or null. Promotion-only: it only ever suggests upgrading FROM `text` to
 * a more specific scalar type, and never fires once the user is already on a
 * non-text type (adopted or chosen). This means inference can never trap a value
 * in the wrong type and there is no flip-flop - it is a hint the user opts into,
 * never a silent morph. Lists are intentionally never inferred (a text value can
 * legitimately contain commas); the user picks List explicitly.
 */
export function inferCreationTypeFromText(rawText: string, currentType: StandardNativePropertyType): StandardNativePropertyType | null {
	if (currentType !== "text") return null;
	const inferred = inferTypeFromText(rawText.trim());
	return inferred && inferred !== currentType ? inferred : null;
}

/**
 * The seed value to mount `nextType`'s widget against when the user switches type
 * mid-creation, carrying the in-progress text across losslessly where the target
 * type can represent it, and falling back to that type's empty value otherwise.
 * This is deliberately NOT an invented coercion table: every branch returns a
 * value {@link normalizeWidgetValue} accepts for `nextType` (proven by test), so
 * the seed can never desync from validation, and switching never writes garbage.
 * `text` keeps the raw input verbatim, so a richer->text switch is always lossless.
 */
export function seedFromRawText(rawText: string, nextType: StandardNativePropertyType): unknown {
	const trimmed = rawText.trim();
	switch (nextType) {
		case "text":
			return rawText;
		case "multitext":
		case "tags":
		case "aliases":
		case "cssclasses":
			return trimmed === "" ? [] : [trimmed];
		case "number":
			return isFiniteNumericString(trimmed) ? Number(trimmed) : null;
		case "checkbox":
			return trimmed === "true" ? true : false;
		case "date":
			return isValidIsoDate(trimmed) ? trimmed : "";
		case "datetime":
			return isValidIsoDatetime(trimmed) ? trimmed : "";
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
	// Both `tags` and the singular `tag` are tag frontmatter (matching isTagsKey
	// and the write path), so edit resolves them to the tags widget exactly like
	// creation does.
	if (isTagsKey(normalizedKey)) return "tags";
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
	// parseYaml gives a date-only YAML value (e.g. 2026-08-03) as a Date at UTC
	// midnight. Read UTC fields so a date-only value isn't misclassified as
	// datetime in non-UTC locales (consistent with this module's UTC-based date
	// handling elsewhere).
	return value.getUTCHours() !== 0 ||
		value.getUTCMinutes() !== 0 ||
		value.getUTCSeconds() !== 0 ||
		value.getUTCMilliseconds() !== 0;
}

// A strict decimal literal: optional sign, digits with an optional fractional
// part, or a bare fractional. Deliberately rejects scientific notation, hex, and
// trailing text ("3 apples"), so value-text inference stays conservative.
const NUMERIC_RE = /^-?(?:\d+\.?\d*|\.\d+)$/;

function isFiniteNumericString(text: string): boolean {
	if (!NUMERIC_RE.test(text)) return false;
	return Number.isFinite(Number(text));
}

// Shape AND calendar validity: `2026-99-99` / `...T99:99` match the regex but are
// not real dates, so inference and seeding must reject them (they would otherwise
// be written as a bogus "date" value).
function isValidIsoDate(value: string): boolean {
	if (!DATE_RE.test(value)) return false;
	const year = Number(value.slice(0, 4));
	const month = Number(value.slice(5, 7));
	const day = Number(value.slice(8, 10));
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isValidIsoDatetime(value: string): boolean {
	if (!DATETIME_RE.test(value)) return false;
	if (!isValidIsoDate(value.slice(0, 10))) return false;
	const hour = Number(value.slice(11, 13));
	const minute = Number(value.slice(14, 16));
	const second = value.length > 16 ? Number(value.slice(17, 19)) : 0;
	return hour <= 23 && minute <= 59 && second <= 59;
}

function inferTypeFromText(text: string): StandardNativePropertyType | null {
	if (text === "") return null;
	if (isValidIsoDatetime(text)) return "datetime";
	if (isValidIsoDate(text)) return "date";
	if (text === "true" || text === "false") return "checkbox";
	// A leading-zero run (007, 0042) is almost always a meaningful string; never
	// suggest number and silently strip the zeros. "0" and "0.5" still infer.
	if (/^0\d/.test(text)) return null;
	if (isFiniteNumericString(text)) return "number";
	return null;
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
