import { describe, expect, test } from "vitest";
import { createMetaEditE2EHarness, evalJsonAsync, PLUGIN_ID } from "./harness";

const getContext = createMetaEditE2EHarness("audit-repro2");

describe("AUDIT repro batch 2: candidate bugs", () => {
	test("API-03: getFilesWithProperty must include a note whose property value is falsy (false/0)", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("falsy-prop.md");
		const result = await evalJsonAsync<{ found: boolean }>(
			obsidian,
			`
			(async () => {
				const api = app.plugins.plugins.${PLUGIN_ID}.api;
				const path = ${JSON.stringify(notePath)};
				let f = app.vault.getAbstractFileByPath(path);
				const body = "---\\npublishedAudit: false\\n---\\nbody\\n";
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				await new Promise(r => setTimeout(r, 400));
				const found = api.getFilesWithProperty("publishedAudit").map(x => x.path).includes(path);
				return { found };
			})()
		`,
		);
		// A note that DEFINES the key (value false) should be returned; presence, not truthiness.
		expect(result.found).toBe(true);
	});

	test("API-07: getPropertiesInFile on an unresolved path returns an array, not undefined", async () => {
		const { obsidian } = getContext();
		const result = await evalJsonAsync<{ isArray: boolean; isUndefined: boolean }>(
			obsidian,
			`
			(async () => {
				const api = app.plugins.plugins.${PLUGIN_ID}.api;
				const r = await api.getPropertiesInFile("does-not-exist-audit-xyz.md");
				return { isArray: Array.isArray(r), isUndefined: r === undefined };
			})()
		`,
		);
		// Declared Promise<Property[]>; a caller iterating the result must not crash.
		expect(result.isArray).toBe(true);
		expect(result.isUndefined).toBe(false);
	});

	test("API-02: updating an inline field in a CRLF note preserves CRLF line endings", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("crlf-inline.md");
		const result = await evalJsonAsync<{ crBefore: number; crAfter: number; content: string }>(
			obsidian,
			`
			(async () => {
				const api = app.plugins.plugins.${PLUGIN_ID}.api;
				const path = ${JSON.stringify(notePath)};
				let f = app.vault.getAbstractFileByPath(path);
				const body = "line one\\r\\nfield:: one\\r\\nline three\\r\\n";
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				await new Promise(r => setTimeout(r, 400));
				const crBefore = (await app.vault.read(f)).split("\\r").length - 1;
				await api.update("field", "two", f);
				await new Promise(r => setTimeout(r, 250));
				const content = await app.vault.read(f);
				const crAfter = content.split("\\r").length - 1;
				return { crBefore, crAfter, content };
			})()
		`,
		);
		// The edit changed the value; line endings should remain CRLF throughout.
		expect(result.content).toContain("field:: two");
		expect(result.crAfter).toBe(result.crBefore);
	});
});
