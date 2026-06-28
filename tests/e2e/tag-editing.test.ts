import { describe, expect, test } from "vitest";
import { createMetaEditE2EHarness, evalJsonAsync, PLUGIN_ID } from "./harness";

const getContext = createMetaEditE2EHarness("tag-editing");

/**
 * Drive a body-tag edit through the real controller, exactly as the picker does:
 * read the file's properties (so each tag carries its parsed span), find the
 * target occurrence, and call updatePropertyInFile with the full replacement
 * token. Returns the resulting file content (and any error message).
 *
 * `select` picks the occurrence to edit from the parsed tag properties.
 */
async function editBodyTag(
	obsidian: Parameters<typeof evalJsonAsync>[0],
	notePath: string,
	body: string,
	select: string,
	newToken: string,
): Promise<{ content: string; error: string }> {
	return await evalJsonAsync(
		obsidian,
		`
		(async () => {
			const plugin = app.plugins.plugins.${PLUGIN_ID};
			const c = plugin.controller;
			const path = ${JSON.stringify(notePath)};
			const body = ${JSON.stringify(body)};
			let f = app.vault.getAbstractFileByPath(path);
			if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }

			// Wait until the metadata cache's tag spans validate against disk, so
			// this mirrors a single picker-open on a fresh cache.
			let props = [];
			for (let i = 0; i < 60; i++) {
				await new Promise((r) => setTimeout(r, 50));
				props = await c.getPropertiesInFile(f);
				const tags = props.filter((p) => p.type === 2);
				if (tags.length && tags.every((t) => t.position && body.slice(t.position.start, t.position.end) === t.key)) break;
			}

			const tags = props.filter((p) => p.type === 2);
			const select = (${select});
			const target = select(tags);
			if (!target) throw new Error("target tag not found");

			let error = "";
			try { await c.updatePropertyInFile(target, ${JSON.stringify(newToken)}, f); }
			catch (e) { error = e instanceof Error ? e.message : String(e); }
			await new Promise((r) => setTimeout(r, 200));
			return { content: await app.vault.read(f), error };
		})()
	`,
	);
}

describe("MetaEdit tag editing", () => {
	test("renames a line-start body tag in place, preserving the rest of the line (BUG-2 + Decision D)", async () => {
		const { obsidian, sandbox } = getContext();
		const result = await editBodyTag(
			obsidian,
			sandbox.path("rename.md"),
			"#epsilon at line start with trailing prose.\n",
			"(t) => t.find((x) => x.key === '#epsilon')",
			"#renamed",
		);

		expect(result.error).toBe("");
		// The whole tag is renamed (not turned into #epsilon/renamed) and the prose
		// after it survives - the pre-fix writer destroyed everything after the tag.
		expect(result.content).toBe("#renamed at line start with trailing prose.\n");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("edits a mid-line body tag in place (BUG-3)", async () => {
		const { obsidian, sandbox } = getContext();
		const result = await editBodyTag(
			obsidian,
			sandbox.path("midline.md"),
			"Mid-line tag #zeta should be editable too.\n",
			"(t) => t.find((x) => x.key === '#zeta')",
			"#omega",
		);

		expect(result.error).toBe("");
		expect(result.content).toBe("Mid-line tag #omega should be editable too.\n");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("edits only the selected occurrence when a tag repeats (BUG-3)", async () => {
		const { obsidian, sandbox } = getContext();
		const result = await editBodyTag(
			obsidian,
			sandbox.path("dup.md"),
			"Dup #dup one and #dup two.\n",
			"(t) => t.filter((x) => x.key === '#dup').sort((a, b) => a.position.start - b.position.start)[1]",
			"#dup2",
		);

		expect(result.error).toBe("");
		// Only the second #dup changed; the first is untouched.
		expect(result.content).toBe("Dup #dup one and #dup2 two.\n");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("replaces only the leaf of a nested tag (Decision D)", async () => {
		const { obsidian, sandbox } = getContext();
		const result = await editBodyTag(
			obsidian,
			sandbox.path("nested.md"),
			"#area/old here.\n",
			"(t) => t.find((x) => x.key === '#area/old')",
			"#area/new",
		);

		expect(result.error).toBe("");
		expect(result.content).toBe("#area/new here.\n");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("re-edits a Tracker #tag:value without stacking the old value", async () => {
		const { obsidian, sandbox } = getContext();
		const result = await editBodyTag(
			obsidian,
			sandbox.path("tracker.md"),
			"#weight:80 logged today.\n",
			"(t) => t.find((x) => x.key === '#weight')",
			"#weight:85",
		);

		expect(result.error).toBe("");
		// Obsidian's tag span covers only #weight; the writer replaces the trailing
		// :80 too, instead of producing #weight:85:80.
		expect(result.content).toBe("#weight:85 logged today.\n");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("rejects an invalid tag name (spaces) without corrupting the note", async () => {
		const { obsidian, sandbox } = getContext();
		const result = await editBodyTag(
			obsidian,
			sandbox.path("invalid.md"),
			"#topic here.\n",
			"(t) => t.find((x) => x.key === '#topic')",
			"#meeting notes",
		);

		expect(result.error).toContain("not a valid tag");
		expect(result.content).toBe("#topic here.\n");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("api.update on a body tag normalizes a bare value into a safe rename", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("api-rename.md");
		const content = await evalJsonAsync<string>(
			obsidian,
			`
			(async () => {
				const path = ${JSON.stringify(notePath)};
				const body = "#status here.\\n";
				let f = app.vault.getAbstractFileByPath(path);
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				await new Promise((r) => setTimeout(r, 300));
				await app.plugins.plugins.${PLUGIN_ID}.api.update("#status", "done", f);
				await new Promise((r) => setTimeout(r, 200));
				return await app.vault.read(f);
			})()
		`,
		);

		// "done" -> "#done" (prepended #), spliced over the tag span - not "done"
		// dropped in as prose.
		expect(content).toBe("#done here.\n");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("refuses to write when the tag's parsed span no longer matches the file", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("stale.md");
		const result = await evalJsonAsync<{ content: string; error: string }>(
			obsidian,
			`
			(async () => {
				const c = app.plugins.plugins.${PLUGIN_ID}.controller;
				const path = ${JSON.stringify(notePath)};
				const body = "#stable here.\\n";
				let f = app.vault.getAbstractFileByPath(path);
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				await new Promise((r) => setTimeout(r, 300));
				const snapshot = await app.vault.read(f);

				let error = "";
				try {
					// Position points at "#sta" (offsets 0-4), which does not equal "#stable".
					await c.updatePropertyInFile({ key: "#stable", content: "#stable", type: 2, position: { start: 0, end: 4 } }, "#x", f);
				} catch (e) { error = e instanceof Error ? e.message : String(e); }
				await new Promise((r) => setTimeout(r, 150));
				return { content: await app.vault.read(f), error, snapshot };
			})()
		`,
		);

		expect(result.error).toContain("could not locate the tag");
		// The note is byte-for-byte unchanged: a stale edit never corrupts.
		expect(result.content).toBe("#stable here.\n");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("canonicalises frontmatter tags and removes the key when emptied (Section 6.3 / Decision E)", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("frontmatter-tags.md");
		const result = await evalJsonAsync<{ scalarToList: string; emptied: string }>(
			obsidian,
			`
			(async () => {
				const c = app.plugins.plugins.${PLUGIN_ID}.controller;
				const path = ${JSON.stringify(notePath)};
				let f = app.vault.getAbstractFileByPath(path);
				const body = "---\\ntags: alpha\\nstatus: keep\\n---\\nbody\\n";
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				await new Promise((r) => setTimeout(r, 300));

				const tagsProp = (await c.getPropertiesInFile(f)).find((p) => p.type === 0 && p.key === "tags" && !p.path);
				// Edit a scalar tags value with a #, CSV and whitespace - stored as a clean list.
				await c.updatePropertyInFile(tagsProp, "alpha, #beta gamma", f);
				await new Promise((r) => setTimeout(r, 200));
				const scalarToList = await app.vault.read(f);

				// Emptying the tags removes the key entirely (status survives).
				const tagsProp2 = (await c.getPropertiesInFile(f)).find((p) => p.type === 0 && p.key === "tags" && !p.path);
				await c.updatePropertyInFile(tagsProp2, [], f);
				await new Promise((r) => setTimeout(r, 200));
				const emptied = await app.vault.read(f);

				return { scalarToList, emptied };
			})()
		`,
		);

		expect(result.scalarToList).toContain("tags:\n  - alpha\n  - beta\n  - gamma");
		expect(result.emptied).not.toContain("tags:");
		expect(result.emptied).toContain("status: keep");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});
});
