import {describe, expect, it} from "vitest";
import {MetaType} from "../Types/metaType";
import {
	NATIVE_TYPE_CHOICES,
	assignVaultPropertyType,
	canAssignVaultPropertyType,
	emptyValueForType,
	frontmatterValuesEqual,
	inferCreationTypeFromText,
	isNativeEditableYamlProperty,
	normalizeWidgetValue,
	resolveCreationType,
	resolveNativeProperty,
	seedFromRawText,
	type StandardNativePropertyType,
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

	it("resolves the singular `tag` key to the tags widget, matching isTagsKey and creation", () => {
		const app = appWithManager({});

		expect(resolveNativeProperty(app as never, {key: "tag", content: ["legacy"], type: MetaType.YAML}))
			.toMatchObject({kind: "native", type: "tags"});
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

	it("infers a UTC-midnight Date as date regardless of the runner's timezone", () => {
		const app = appWithManager({});

		// parseYaml represents a date-only YAML value (2026-08-03) as UTC midnight.
		expect(resolveNativeProperty(app as never, {key: "due", content: new Date("2026-08-03T00:00:00.000Z"), type: MetaType.YAML}))
			.toMatchObject({kind: "native", type: "date"});
		expect(resolveNativeProperty(app as never, {key: "stamp", content: new Date("2026-08-03T09:30:00.000Z"), type: MetaType.YAML}))
			.toMatchObject({kind: "native", type: "datetime"});
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

describe("creation type resolution (no value-shape inference)", () => {
	it("locks reserved key names to their native widget", () => {
		const app = appWithManager({});
		expect(resolveCreationType(app as never, "tags")).toBe("tags");
		expect(resolveCreationType(app as never, "Tags")).toBe("tags");
		expect(resolveCreationType(app as never, "aliases")).toBe("aliases");
	});

	it("routes the singular 'tag' key to the tags widget too (consistent with isTagsKey)", () => {
		const app = appWithManager({});
		// Without this, a new `tag` key would fall through to the text default and be
		// written as a plain text scalar instead of tag metadata.
		expect(resolveCreationType(app as never, "tag")).toBe("tags");
		expect(resolveCreationType(app as never, "Tag")).toBe("tags");
	});

	it("adopts an assigned, then property-info, then Obsidian-expected type before defaulting", () => {
		const assigned = appWithManager({getAssignedWidget: () => "number"});
		expect(resolveCreationType(assigned as never, "rating")).toBe("number");

		const propertyInfo = appWithManager({getAllProperties: () => ({priority: {widget: "number"}})});
		expect(resolveCreationType(propertyInfo as never, "priority")).toBe("number");

		const expected = appWithManager({getTypeInfo: () => ({expected: {type: "date"}})});
		expect(resolveCreationType(expected as never, "due")).toBe("date");
	});

	it("defaults a brand-new key to text, and degrades to text without a type manager", () => {
		expect(resolveCreationType(appWithManager({}) as never, "totallyNew")).toBe("text");
		expect(resolveCreationType({} as never, "anything")).toBe("text");
	});
});

describe("empty seed per type", () => {
	it("maps each type to a value normalizeWidgetValue accepts as an empty native value", () => {
		const cases: Array<[StandardNativePropertyType, unknown]> = [
			["text", ""],
			["multitext", []],
			["tags", []],
			["aliases", []],
			["cssclasses", []],
			["number", null],
			["checkbox", false],
			["date", ""],
			["datetime", ""],
		];
		for (const [type, expectedEmpty] of cases) {
			expect(emptyValueForType(type)).toEqual(expectedEmpty);
			expect(normalizeWidgetValue(type, emptyValueForType(type), "native").ok).toBe(true);
		}
	});
});

describe("value-text inference (suggest, promotion-only)", () => {
	it("promotes the text default to a richer scalar type when the text is unambiguous", () => {
		expect(inferCreationTypeFromText("2026-07-01", "text")).toBe("date");
		expect(inferCreationTypeFromText("2026-07-01T09:30", "text")).toBe("datetime");
		expect(inferCreationTypeFromText("true", "text")).toBe("checkbox");
		expect(inferCreationTypeFromText("false", "text")).toBe("checkbox");
		expect(inferCreationTypeFromText("3", "text")).toBe("number");
		expect(inferCreationTypeFromText("-2.5", "text")).toBe("number");
	});

	it("stays quiet on ambiguous text, partial values, and leading-zero strings", () => {
		expect(inferCreationTypeFromText("3 apples", "text")).toBeNull();
		expect(inferCreationTypeFromText("2026-07-0", "text")).toBeNull();
		expect(inferCreationTypeFromText("007", "text")).toBeNull();
		expect(inferCreationTypeFromText("", "text")).toBeNull();
		expect(inferCreationTypeFromText("   ", "text")).toBeNull();
		expect(inferCreationTypeFromText("hello", "text")).toBeNull();
	});

	it("rejects shape-valid but calendar-invalid dates/times (never infers a bogus date)", () => {
		expect(inferCreationTypeFromText("2026-99-99", "text")).toBeNull();
		expect(inferCreationTypeFromText("2026-13-01", "text")).toBeNull();
		expect(inferCreationTypeFromText("2026-02-30", "text")).toBeNull();
		expect(inferCreationTypeFromText("2026-07-01T25:00", "text")).toBeNull();
		expect(inferCreationTypeFromText("2026-07-01T12:60", "text")).toBeNull();
		// Real dates/times still infer.
		expect(inferCreationTypeFromText("2026-02-28", "text")).toBe("date");
		expect(inferCreationTypeFromText("2024-02-29", "text")).toBe("date"); // leap year
		expect(inferCreationTypeFromText("2026-07-01T23:59:59", "text")).toBe("datetime");
	});

	it("never fires once the user is already on a non-text type (no trap, no flip-flop)", () => {
		expect(inferCreationTypeFromText("3", "number")).toBeNull();
		expect(inferCreationTypeFromText("plain text", "date")).toBeNull();
		expect(inferCreationTypeFromText("2026-07-01", "multitext")).toBeNull();
	});
});

describe("seedFromRawText across a type switch", () => {
	it("carries in-progress text across losslessly where the target type can hold it", () => {
		expect(seedFromRawText("hello", "text")).toBe("hello");
		expect(seedFromRawText("in-progress", "multitext")).toEqual(["in-progress"]);
		expect(seedFromRawText("", "multitext")).toEqual([]);
		expect(seedFromRawText("42", "number")).toBe(42);
		expect(seedFromRawText("2026-07-01", "date")).toBe("2026-07-01");
		expect(seedFromRawText("2026-07-01T09:30", "datetime")).toBe("2026-07-01T09:30");
		expect(seedFromRawText("true", "checkbox")).toBe(true);
	});

	it("falls back to the empty value when the target type can't represent the text", () => {
		expect(seedFromRawText("3 apples", "number")).toBeNull();
		expect(seedFromRawText("not-a-date", "date")).toBe("");
		expect(seedFromRawText("noon", "datetime")).toBe("");
		expect(seedFromRawText("maybe", "checkbox")).toBe(false);
		// Calendar-invalid dates are not seeded as dates (would write a bogus value).
		expect(seedFromRawText("2026-99-99", "date")).toBe("");
		expect(seedFromRawText("2026-02-30", "date")).toBe("");
		expect(seedFromRawText("2026-07-01T25:00", "datetime")).toBe("");
	});

	it("INVARIANT: every seed is a value normalizeWidgetValue accepts for the target type", () => {
		const rawSamples = ["", "hello", "3", "3.5", "-1", "007", "3 apples", "true", "false", "2026-07-01", "2026-07-01T09:30", "[[A]], [[B]]", "a, b, c"];
		const types = NATIVE_TYPE_CHOICES.map(choice => choice.type);
		for (const type of types) {
			for (const raw of rawSamples) {
				const seed = seedFromRawText(raw, type);
				const normalized = normalizeWidgetValue(type, seed, "native");
				expect(normalized.ok, `seed ${JSON.stringify(seed)} for type ${type} from ${JSON.stringify(raw)}`).toBe(true);
			}
		}
	});
});

describe("assignVaultPropertyType (vault-wide type memory)", () => {
	it("canAssignVaultPropertyType reflects whether setType exists", () => {
		expect(canAssignVaultPropertyType(appWithManager({setType: () => undefined}) as never)).toBe(true);
		expect(canAssignVaultPropertyType(appWithManager({}) as never)).toBe(false);
		expect(canAssignVaultPropertyType({} as never)).toBe(false);
	});

	it("calls metadataTypeManager.setType with the key and widget id", async () => {
		const calls: unknown[][] = [];
		const app = appWithManager({setType: (...args: unknown[]) => void calls.push(args)});

		await expect(assignVaultPropertyType(app as never, "status", "multitext")).resolves.toBe(true);
		expect(calls).toEqual([["status", "multitext"]]);
	});

	it("returns false without throwing when setType is absent or the manager is missing", async () => {
		await expect(assignVaultPropertyType(appWithManager({}) as never, "status", "date")).resolves.toBe(false);
		await expect(assignVaultPropertyType({} as never, "status", "date")).resolves.toBe(false);
	});

	it("returns false when setType throws (internal API drift must not crash the edit)", async () => {
		const app = appWithManager({setType: () => { throw new Error("boom"); }});
		await expect(assignVaultPropertyType(app as never, "status", "number")).resolves.toBe(false);
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
