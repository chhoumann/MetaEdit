/**
 * Pure decision logic for applying a single YAML frontmatter property across a
 * set of notes. This module is intentionally free of any Obsidian dependency so
 * it can be unit-tested in the jsdom-free node environment, and so the
 * read-decide-write step can run atomically inside
 * `app.fileManager.processFrontMatter` (the same safe frontmatter primitive the
 * controller write path uses) - never against the eventually-consistent
 * metadata cache.
 */

/** How to treat notes that already define the target property. */
export type ConflictPolicy = "skip" | "overwrite" | "merge";

/** What happened to a single note during a bulk apply. */
export type BulkOutcome =
	| "added"
	| "merged"
	| "overwritten"
	| "skipped"
	| "unchanged"
	| "failed";

export type BulkDecision =
	| { action: "write"; value: unknown; outcome: "added" | "merged" | "overwritten" }
	| { action: "skip"; outcome: "skipped" | "unchanged" };

export interface DecideArgs {
	/** Whether the property key already exists in the note's frontmatter. */
	exists: boolean;
	/** The note's current value for the key (only meaningful when `exists`). */
	currentValue: unknown;
	/** The raw value entered by the user (always a string). */
	rawValue: string;
	/** Conflict policy chosen for notes that already have the key. */
	policy: ConflictPolicy;
	/**
	 * Whether a freshly-added/overwritten scalar should be wrapped in a list,
	 * mirroring the controller's EditMode (AllMulti / SomeMulti) wrapping so the
	 * bulk path produces the same YAML shape as a single-note add.
	 */
	wrapInArray: boolean;
}

/**
 * Decide what to write (if anything) for one note. Pure and deterministic:
 * given the same inputs it always returns the same decision, which is what
 * makes a bulk apply idempotent on re-run.
 */
export function decideBulkWrite(args: DecideArgs): BulkDecision {
	const { exists, currentValue, rawValue, policy, wrapInArray } = args;

	if (!exists) {
		// Under merge the property is meant to be a list, so seed it as one even
		// when adding it fresh - that keeps every note in a merge run list-shaped
		// rather than scalar-for-added vs list-for-merged.
		const value = policy === "merge" ? [rawValue] : wrapScalar(rawValue, wrapInArray);
		return { action: "write", value, outcome: "added" };
	}

	switch (policy) {
		case "skip":
			return { action: "skip", outcome: "skipped" };

		case "overwrite": {
			const next = wrapScalar(rawValue, wrapInArray);
			if (valuesEqual(currentValue, next)) {
				return { action: "skip", outcome: "unchanged" };
			}
			return { action: "write", value: next, outcome: "overwritten" };
		}

		case "merge": {
			// Merging a scalar into a map is undefined; leave the note untouched
			// rather than clobber structured data.
			if (isPlainObject(currentValue)) {
				return { action: "skip", outcome: "skipped" };
			}

			const merged = uniqueConcat(toArray(currentValue), [rawValue]);
			if (valuesEqual(currentValue, merged)) {
				return { action: "skip", outcome: "unchanged" };
			}
			return { action: "write", value: merged, outcome: "merged" };
		}

		default:
			return { action: "skip", outcome: "skipped" };
	}
}

export interface BulkSummary {
	total: number;
	added: number;
	merged: number;
	overwritten: number;
	skipped: number;
	unchanged: number;
	failed: number;
	failures: { path: string; error: string }[];
}

export function emptySummary(total: number): BulkSummary {
	return {
		total,
		added: 0,
		merged: 0,
		overwritten: 0,
		skipped: 0,
		unchanged: 0,
		failed: 0,
		failures: [],
	};
}

export function recordOutcome(summary: BulkSummary, outcome: BulkOutcome): void {
	summary[outcome] += 1;
}

/**
 * Human-readable one-line summary for the completion Notice. Only non-zero
 * buckets are listed so the common case stays terse, and the destructive
 * "overwritten" count is always called out when present.
 */
export function formatSummary(summary: BulkSummary, key: string): string {
	const parts: string[] = [];
	const add = (n: number, label: string) => {
		if (n > 0) parts.push(`${n} ${label}`);
	};

	add(summary.added, "added");
	add(summary.merged, "merged");
	add(summary.overwritten, "overwritten");
	add(summary.skipped, "skipped");
	add(summary.unchanged, "unchanged");
	add(summary.failed, "failed");

	const noteWord = summary.total === 1 ? "note" : "notes";
	const detail = parts.length > 0 ? parts.join(", ") : "no changes";
	const failureHint = summary.failed > 0 ? " (see console for failed notes)" : "";

	return `MetaEdit bulk "${key}": ${detail} across ${summary.total} ${noteWord}.${failureHint}`;
}

function wrapScalar(rawValue: string, wrapInArray: boolean): unknown {
	return wrapInArray ? [rawValue] : rawValue;
}

export function isPlainObject(value: unknown): boolean {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Normalize a frontmatter value into a list for merging. */
export function toArray(value: unknown): unknown[] {
	if (Array.isArray(value)) return value.slice();
	if (value === null || value === undefined) return [];
	return [value];
}

/**
 * Concatenate `additions` onto `base`, dropping values already present. Equality
 * is by stable string form, so `5` and `"5"` count as the same value and object
 * elements are compared structurally. This is what keeps merge idempotent.
 */
export function uniqueConcat(base: unknown[], additions: unknown[]): unknown[] {
	const seen = new Set(base.map(dedupeKey));
	const out = base.slice();

	for (const candidate of additions) {
		const key = dedupeKey(candidate);
		if (!seen.has(key)) {
			seen.add(key);
			out.push(candidate);
		}
	}

	return out;
}

export function valuesEqual(a: unknown, b: unknown): boolean {
	return stableStringify(a) === stableStringify(b);
}

function dedupeKey(value: unknown): string {
	if (value !== null && typeof value === "object") {
		return `o:${stableStringify(value)}`;
	}
	return `s:${String(value)}`;
}

/** Deterministic JSON serialization with sorted object keys. */
function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value) ?? "null";
	}

	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}

	const record = value as Record<string, unknown>;
	const keys = Object.keys(record).sort();
	const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
	return `{${entries.join(",")}}`;
}
