import { describe, expect, it } from "vitest";
import {
	type BulkSummary,
	type ConflictPolicy,
	decideBulkWrite,
	emptySummary,
	formatSummary,
	recordOutcome,
	toArray,
	uniqueConcat,
	valuesEqual,
} from "./bulkMetadata";

const decide = (over: Partial<Parameters<typeof decideBulkWrite>[0]>) =>
	decideBulkWrite({
		exists: false,
		currentValue: undefined,
		rawValue: "v",
		policy: "skip",
		wrapInArray: false,
		...over,
	});

describe("decideBulkWrite - add (key missing)", () => {
	it("adds a scalar when the key is missing, regardless of policy", () => {
		for (const policy of ["skip", "overwrite", "merge"] as ConflictPolicy[]) {
			expect(decide({ exists: false, rawValue: "draft", policy })).toEqual({
				action: "write",
				value: "draft",
				outcome: "added",
			});
		}
	});

	it("wraps the added value in a list when EditMode requests multi-value", () => {
		expect(decide({ exists: false, rawValue: "draft", wrapInArray: true })).toEqual({
			action: "write",
			value: ["draft"],
			outcome: "added",
		});
	});
});

describe("decideBulkWrite - skip policy", () => {
	it("never touches a note that already has the key", () => {
		expect(decide({ exists: true, currentValue: "old", rawValue: "new", policy: "skip" })).toEqual({
			action: "skip",
			outcome: "skipped",
		});
	});
});

describe("decideBulkWrite - overwrite policy", () => {
	it("replaces a differing scalar value", () => {
		expect(
			decide({ exists: true, currentValue: "draft", rawValue: "published", policy: "overwrite" }),
		).toEqual({ action: "write", value: "published", outcome: "overwritten" });
	});

	it("is idempotent: an already-equal value is reported unchanged, no write", () => {
		expect(
			decide({ exists: true, currentValue: "published", rawValue: "published", policy: "overwrite" }),
		).toEqual({ action: "skip", outcome: "unchanged" });
	});

	it("treats wrapped scalars as equal under multi-value EditMode", () => {
		expect(
			decide({
				exists: true,
				currentValue: ["published"],
				rawValue: "published",
				policy: "overwrite",
				wrapInArray: true,
			}),
		).toEqual({ action: "skip", outcome: "unchanged" });
	});

	it("flattens an existing list to the new scalar (caller confirms this destructive path)", () => {
		expect(
			decide({ exists: true, currentValue: ["a", "b", "c"], rawValue: "x", policy: "overwrite" }),
		).toEqual({ action: "write", value: "x", outcome: "overwritten" });
	});
});

describe("decideBulkWrite - merge policy", () => {
	it("appends a new value to an existing list without duplicating", () => {
		expect(
			decide({ exists: true, currentValue: ["a", "b"], rawValue: "c", policy: "merge" }),
		).toEqual({ action: "write", value: ["a", "b", "c"], outcome: "merged" });
	});

	it("is idempotent: appending a value already present reports unchanged, no write", () => {
		expect(
			decide({ exists: true, currentValue: ["a", "b"], rawValue: "b", policy: "merge" }),
		).toEqual({ action: "skip", outcome: "unchanged" });
	});

	it("normalizes an existing scalar into a list when merging", () => {
		expect(
			decide({ exists: true, currentValue: "a", rawValue: "b", policy: "merge" }),
		).toEqual({ action: "write", value: ["a", "b"], outcome: "merged" });
	});

	it("dedupes across types: numeric 5 and string '5' are the same value", () => {
		expect(
			decide({ exists: true, currentValue: [5], rawValue: "5", policy: "merge" }),
		).toEqual({ action: "skip", outcome: "unchanged" });
	});

	it("leaves map-valued properties untouched (cannot append a scalar into a map)", () => {
		expect(
			decide({ exists: true, currentValue: { nested: true }, rawValue: "x", policy: "merge" }),
		).toEqual({ action: "skip", outcome: "skipped" });
	});

	it("preserves existing object elements while appending the new scalar", () => {
		const current = [{ id: 1 }];
		expect(
			decide({ exists: true, currentValue: current, rawValue: "x", policy: "merge" }),
		).toEqual({ action: "write", value: [{ id: 1 }, "x"], outcome: "merged" });
	});
});

describe("idempotency across a re-run", () => {
	// Feeds the decision's written value back in as the next run's current value
	// and asserts the second run is a no-op for every conflict policy.
	const reRunIsNoop = (policy: ConflictPolicy, currentValue: unknown, rawValue: string) => {
		const first = decideBulkWrite({ exists: true, currentValue, rawValue, policy, wrapInArray: false });
		const nextValue = first.action === "write" ? first.value : currentValue;
		const second = decideBulkWrite({ exists: true, currentValue: nextValue, rawValue, policy, wrapInArray: false });
		return second;
	};

	it("merge converges after one run", () => {
		expect(reRunIsNoop("merge", "a", "b")).toEqual({ action: "skip", outcome: "unchanged" });
	});

	it("overwrite converges after one run", () => {
		expect(reRunIsNoop("overwrite", "old", "new")).toEqual({ action: "skip", outcome: "unchanged" });
	});
});

describe("value helpers", () => {
	it("toArray wraps scalars, copies arrays, and empties nullish", () => {
		expect(toArray("a")).toEqual(["a"]);
		expect(toArray(["a", "b"])).toEqual(["a", "b"]);
		expect(toArray(null)).toEqual([]);
		expect(toArray(undefined)).toEqual([]);
	});

	it("uniqueConcat keeps order and drops duplicates by stable value", () => {
		expect(uniqueConcat(["a"], ["a", "b", "b"])).toEqual(["a", "b"]);
		expect(uniqueConcat([{ a: 1 }], [{ a: 1 }])).toEqual([{ a: 1 }]);
	});

	it("valuesEqual compares structurally regardless of key order", () => {
		expect(valuesEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
		expect(valuesEqual(["a"], ["a"])).toBe(true);
		expect(valuesEqual("a", ["a"])).toBe(false);
	});
});

describe("formatSummary", () => {
	const withCounts = (over: Partial<BulkSummary>): BulkSummary => ({
		...emptySummary(over.total ?? 1),
		...over,
	});

	it("lists only non-zero buckets", () => {
		const summary = withCounts({ total: 5, added: 3, skipped: 2 });
		expect(formatSummary(summary, "status")).toBe(
			'MetaEdit bulk "status": 3 added, 2 skipped across 5 notes.',
		);
	});

	it("calls out failures and points at the console", () => {
		const summary = withCounts({ total: 2, added: 1, failed: 1, failures: [{ path: "x.md", error: "boom" }] });
		expect(formatSummary(summary, "k")).toContain("1 failed");
		expect(formatSummary(summary, "k")).toContain("see console");
	});

	it("uses singular note wording and a no-changes phrase", () => {
		const summary = withCounts({ total: 1, skipped: 1 });
		expect(formatSummary(summary, "k")).toBe('MetaEdit bulk "k": 1 skipped across 1 note.');
		const noop = withCounts({ total: 3 });
		expect(formatSummary(noop, "k")).toBe('MetaEdit bulk "k": no changes across 3 notes.');
	});

	it("recordOutcome increments the matching bucket", () => {
		const summary = emptySummary(2);
		recordOutcome(summary, "added");
		recordOutcome(summary, "merged");
		expect(summary.added).toBe(1);
		expect(summary.merged).toBe(1);
	});
});
