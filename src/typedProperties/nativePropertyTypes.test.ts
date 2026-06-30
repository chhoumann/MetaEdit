import {describe, expect, it} from "vitest";
import {MetaType} from "../Types/metaType";
import {
	frontmatterValuesEqual,
	isNativeEditableYamlProperty,
	normalizeWidgetValue,
	resolveNativeProperty,
} from "./nativePropertyTypes";

const widget = () => ({
	render: () => undefined,
	validate: () => true,
});

const appWithManager = (manager: Record<string, unknown>) => ({
	metadataTypeManager: {
		registeredTypeWidgets: {
			aliases: widget(),
			checkbox: widget(),
			date: widget(),
			datetime: widget(),
			multitext: widget(),
			number: widget(),
			tags: widget(),
			text: widget(),
		},
		...manager,
	},
});

describe("native property type resolution", () => {
	it("uses Obsidian reserved widgets for standard reserved keys", () => {
		const app = appWithManager({});

		expect(resolveNativeProperty(app as never, {key: "tags", content: [], type: MetaType.YAML}))
			.toMatchObject({kind: "native", type: "tags"});
		expect(resolveNativeProperty(app as never, {key: "aliases", content: [], type: MetaType.YAML}))
			.toMatchObject({kind: "native", type: "aliases"});
	});

	it("prefers assigned and expected Obsidian widget types before value-shape inference", () => {
		const assigned = appWithManager({
			getAssignedWidget: () => "number",
		});
		const expected = appWithManager({
			getTypeInfo: () => ({expected: {type: "date"}}),
		});

		expect(resolveNativeProperty(assigned as never, {key: "rating", content: "5", type: MetaType.YAML}))
			.toMatchObject({kind: "native", type: "number"});
		expect(resolveNativeProperty(expected as never, {key: "due", content: "2026-08-03", type: MetaType.YAML}))
			.toMatchObject({kind: "native", type: "date"});
	});

	it("falls back to value shape when Obsidian has no assignment", () => {
		const app = appWithManager({});

		expect(resolveNativeProperty(app as never, {key: "list", content: ["a"], type: MetaType.YAML}))
			.toMatchObject({kind: "native", type: "multitext"});
		expect(resolveNativeProperty(app as never, {key: "done", content: false, type: MetaType.YAML}))
			.toMatchObject({kind: "native", type: "checkbox"});
		expect(resolveNativeProperty(app as never, {key: "count", content: 0, type: MetaType.YAML}))
			.toMatchObject({kind: "native", type: "number"});
	});

	it("uses the text fallback only when the native registry or selected widget is absent", () => {
		expect(resolveNativeProperty({} as never, {key: "status", content: "open", type: MetaType.YAML}))
			.toMatchObject({kind: "fallback", type: "text"});

		const app = appWithManager({
			registeredTypeWidgets: {
				text: widget(),
			},
		});
		expect(resolveNativeProperty(app as never, {key: "count", content: 1, type: MetaType.YAML}))
			.toMatchObject({kind: "fallback", type: "text"});
	});

	it("only routes top-level scalar/list YAML properties to the native prompt", () => {
		expect(isNativeEditableYamlProperty({key: "status", content: "open", type: MetaType.YAML})).toBe(true);
		expect(isNativeEditableYamlProperty({key: "status", content: "open", type: MetaType.Dataview})).toBe(false);
		expect(isNativeEditableYamlProperty({key: "meta", content: {status: "open"}, type: MetaType.YAML})).toBe(false);
		expect(isNativeEditableYamlProperty({key: "items", content: [{name: "A"}], type: MetaType.YAML})).toBe(false);
		expect(isNativeEditableYamlProperty({key: "meta.status", content: "open", type: MetaType.YAML, path: ["meta", "status"]})).toBe(false);
	});
});

describe("native widget value normalization", () => {
	it("accepts native falsy values without truthiness filtering", () => {
		expect(normalizeWidgetValue("number", 0, "native")).toEqual({ok: true, value: 0});
		expect(normalizeWidgetValue("number", null, "native")).toEqual({ok: true, value: null});
		expect(normalizeWidgetValue("checkbox", false, "native")).toEqual({ok: true, value: false});
		expect(normalizeWidgetValue("text", "", "native")).toEqual({ok: true, value: ""});
	});

	it("validates each native type shape before write", () => {
		expect(normalizeWidgetValue("number", "0", "native").ok).toBe(false);
		expect(normalizeWidgetValue("checkbox", "false", "native").ok).toBe(false);
		expect(normalizeWidgetValue("date", "next Friday", "native").ok).toBe(false);
		expect(normalizeWidgetValue("datetime", "2026-08-03T12:34:56", "native"))
			.toEqual({ok: true, value: "2026-08-03T12:34:56"});
		expect(normalizeWidgetValue("aliases", ["Alias, One", "[[A, B]]"], "native"))
			.toEqual({ok: true, value: ["Alias, One", "[[A, B]]"]});
	});

	it("keeps the minimal fallback as a text value", () => {
		expect(normalizeWidgetValue("number", 42, "fallback")).toEqual({ok: true, value: "42"});
		expect(normalizeWidgetValue("text", null, "fallback")).toEqual({ok: true, value: ""});
	});
});

describe("frontmatter value comparison", () => {
	it("compares arrays and nested objects structurally for stale-write checks", () => {
		expect(frontmatterValuesEqual(["a", 0, false, null], ["a", 0, false, null])).toBe(true);
		expect(frontmatterValuesEqual(["a", 0], ["a", "0"])).toBe(false);
		expect(frontmatterValuesEqual({a: ["b"]}, {a: ["b"]})).toBe(true);
		expect(frontmatterValuesEqual({a: ["b"]}, {a: ["c"]})).toBe(false);
	});

	it("allows Date objects to compare against Obsidian date strings", () => {
		expect(frontmatterValuesEqual(new Date("2026-08-03T00:00:00.000Z"), "2026-08-03")).toBe(true);
		expect(frontmatterValuesEqual(new Date("2026-08-03T12:34:56.000Z"), "2026-08-03T12:34:56")).toBe(true);
	});
});
