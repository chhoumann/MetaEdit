import {describe, expect, it} from "vitest";
import {buildWikilinkInsertion, extractWikilinkQuery} from "./nativeWikilinkSuggester";

describe("extractWikilinkQuery", () => {
	it("returns the text typed after an open [[", () => {
		expect(extractWikilinkQuery("[[Foo")).toBe("Foo");
		expect(extractWikilinkQuery("see [[bar")).toBe("bar");
		expect(extractWikilinkQuery("[[")).toBe("");
	});

	it("returns null when there is no open [[", () => {
		expect(extractWikilinkQuery("")).toBeNull();
		expect(extractWikilinkQuery("plain text")).toBeNull();
		// A closed link is not an active query.
		expect(extractWikilinkQuery("[[Foo]]")).toBeNull();
	});
});

describe("buildWikilinkInsertion", () => {
	it("preserves text typed before the [[", () => {
		expect(buildWikilinkInsertion("see [[fo", "[[Foo]]")).toBe("see [[Foo]]");
	});

	it("inserts a comma-containing link verbatim as a single value", () => {
		expect(buildWikilinkInsertion("[[A, ", "[[A, B]]")).toBe("[[A, B]]");
		expect(buildWikilinkInsertion("ref [[a", "[[A, B|alias]]")).toBe("ref [[A, B|alias]]");
	});

	it("replaces the whole value when it is only the query", () => {
		expect(buildWikilinkInsertion("[[Foo", "[[Foo]]")).toBe("[[Foo]]");
	});

	it("appends defensively when there is no open [[", () => {
		expect(buildWikilinkInsertion("done", "[[Foo]]")).toBe("done[[Foo]]");
	});
});
