import {describe, expect, it} from "vitest";
import {NativeWidgetHost, carryTextFromEditor, stringifyForCarry} from "./NativeWidgetHost";

// A minimal fake host element whose querySelector answers like the real DOM for
// the readRawText probes (an input/textarea, a contenteditable, or no editor).
function makeHost(editor: {kind: "input" | "editable" | "none"; value?: string}) {
	const hostEl = {
		querySelector(selector: string): unknown {
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
		expect(carryTextFromEditor(null, false)).toBe("");
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
		expect(stringifyForCarry(false)).toBe("");
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
});
