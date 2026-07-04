import {describe, expect, it} from "vitest";
import {NativeWidgetHost, carryTextFromEditor, stringifyForCarry} from "./NativeWidgetHost";

// A minimal fake host element whose querySelector answers like the real DOM for
// the readRawText probes (an input/textarea, a contenteditable, or no editor).
function makeHost(editor: {kind: "input" | "editable" | "chips" | "none"; value?: string}) {
	const hostEl = {
		querySelector(selector: string): unknown {
			// A chip editor exposes a multi-select container AND a contenteditable
			// entry field (usually empty); the committed chips are NOT in either.
			if (editor.kind === "chips") {
				if (selector.includes("multi-select-container")) return {};
				if (selector.includes("contenteditable")) return {textContent: editor.value ?? ""};
				return null;
			}
			if (selector.includes("multi-select-container")) return null;
			if (editor.kind === "input" && selector.includes("input")) return {value: editor.value};
			if (editor.kind === "editable" && selector.includes("contenteditable")) return {textContent: editor.value};
			return null;
		},
	};
	return new NativeWidgetHost({app: {} as never, hostEl: hostEl as never, sourcePath: "", key: "k"});
}

describe("carryTextFromEditor (type-switch carry decision)", () => {
	it("carries the live editor text, and an EMPTY editor stays empty (never resurrects lastValue)", () => {
		// The bug: clearing a Number seeded with 123 then switching type must carry ""
		// (the cleared value), not the stale 123.
		expect(carryTextFromEditor("", "123")).toBe("");
		expect(carryTextFromEditor("", ["a", "b"])).toBe("");
		expect(carryTextFromEditor("hello", "123")).toBe("hello");
	});

	it("falls back to the last reported value ONLY when there is no text editor (e.g. a checkbox)", () => {
		expect(carryTextFromEditor(null, true)).toBe("true");
		// An existing `done: false` is real data - it must carry, not empty out.
		expect(carryTextFromEditor(null, false)).toBe("false");
		expect(carryTextFromEditor(null, ["a", "b"])).toBe("a, b");
		expect(carryTextFromEditor(null, 5)).toBe("5");
		expect(carryTextFromEditor(null, undefined)).toBe("");
	});
});

describe("stringifyForCarry", () => {
	it("stringifies a value for carrying across a switch", () => {
		expect(stringifyForCarry("plain")).toBe("plain");
		expect(stringifyForCarry(["x", "y"])).toBe("x, y");
		expect(stringifyForCarry(42)).toBe("42");
		expect(stringifyForCarry(true)).toBe("true");
		expect(stringifyForCarry(false)).toBe("false");
		expect(stringifyForCarry(null)).toBe("");
	});
});

describe("NativeWidgetHost.readRawText", () => {
	it("reads a live input value, including an empty one", () => {
		expect(makeHost({kind: "input", value: "in-progress"}).readRawText()).toBe("in-progress");
		expect(makeHost({kind: "input", value: ""}).readRawText()).toBe("");
	});

	it("reads a live contenteditable value, including an empty one", () => {
		expect(makeHost({kind: "editable", value: "typed"}).readRawText()).toBe("typed");
		expect(makeHost({kind: "editable", value: ""}).readRawText()).toBe("");
	});

	it("returns empty when there is no text editor and no prior value", () => {
		expect(makeHost({kind: "none"}).readRawText()).toBe("");
	});

	it("ignores a chip editor's entry field so the committed chips carry, not the in-progress text", () => {
		// The bug: the chip editor's contenteditable entry field read as "the"
		// editor text, so switching away from a List dropped every chip.
		const host = makeHost({kind: "chips", value: "in-progress"});
		(host as unknown as {lastValueInternal: unknown}).lastValueInternal = ["a", "b"];
		expect(host.readRawText()).toBe("a, b");
	});
});
