import { describe, expect, test } from "vitest";
import { createMetaEditE2EHarness, evalJsonAsync, PLUGIN_ID } from "./harness";

const getContext = createMetaEditE2EHarness("audit-repro");

describe("AUDIT repro: confirmed bug candidates", () => {
	test("CTRL: deleting an inline field does not remove a same-named frontmatter key", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("delete-inline-collision.md");
		const content = await evalJsonAsync<string>(
			obsidian,
			`
			(async () => {
				const c = app.plugins.plugins.${PLUGIN_ID}.controller;
				const path = ${JSON.stringify(notePath)};
				const body = "---\\nkey: yaml-value\\n---\\nkey:: inline-value\\n";
				let f = app.vault.getAbstractFileByPath(path);
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				await new Promise((r) => setTimeout(r, 300));
				// The inline Dataview field (type 1), not the YAML key (type 0).
				const inline = (await c.getPropertiesInFile(f)).find((p) => p.key === "key" && p.type === 1);
				await c.deleteProperty(inline, f);
				await new Promise((r) => setTimeout(r, 200));
				return await app.vault.read(f);
			})()
		`,
		);
		// The inline field is gone; the same-named frontmatter key survives.
		expect(content).toContain("key: yaml-value");
		expect(content).not.toContain("key:: inline-value");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("CTRL: deleteProperty on a block-style YAML list must not orphan value lines", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("delete-block-list.md");
		const result = await evalJsonAsync<{ content: string; error: string }>(
			obsidian,
			`
			(async () => {
				const c = app.plugins.plugins.${PLUGIN_ID}.controller;
				const path = ${JSON.stringify(notePath)};
				const body = "---\\ntags:\\n  - a\\n  - b\\nstatus: keep\\n---\\nbody text\\n";
				let f = app.vault.getAbstractFileByPath(path);
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				await new Promise((r) => setTimeout(r, 300));
				const tagsProp = (await c.getPropertiesInFile(f)).find((p) => p.type === 0 && p.key === "tags" && !p.path);
				let error = "";
				try { await c.deleteProperty(tagsProp, f); } catch (e) { error = e instanceof Error ? e.message : String(e); }
				await new Promise((r) => setTimeout(r, 200));
				return { content: await app.vault.read(f), error };
			})()
		`,
		);

		// The tags key (and its block list) should be gone, status: keep preserved,
		// and the frontmatter must stay valid - no orphaned "- a" / "- b" lines.
		expect(result.error).toBe("");
		expect(result.content).not.toMatch(/^\s*-\s*a\s*$/m);
		expect(result.content).not.toMatch(/^\s*-\s*b\s*$/m);
		expect(result.content).toContain("status: keep");
		expect(result.content).toContain("body text");
	});

	test("RUN: running the command with no active markdown file is a clean no-op (no thrown error)", async () => {
		const { obsidian } = getContext();
		// Start from a clean diagnostics buffer so we only see errors this run causes.
		await obsidian.dev.resetDiagnostics().catch(() => undefined);

		// Run the command as a pure side effect (the fix logs a notice-style
		// message, which evalJsonAsync now tolerates), then assert via
		// diagnostics. Stub getActiveFile to null for the one command run.
		await evalJsonAsync<void>(
			obsidian,
			`
			(async () => {
				const orig = app.workspace.getActiveFile;
				app.workspace.getActiveFile = () => null;
				try {
					app.commands.executeCommandById("${PLUGIN_ID}:metaEditRun");
				} finally {
					app.workspace.getActiveFile = orig;
				}
			})()
		`,
		);
		// Let any async command rejection settle into diagnostics.
		await new Promise((r) => setTimeout(r, 300));

		// The command must produce no "this.logError is not a function" unhandled
		// rejection (the pre-fix bug), and indeed no runtime error at all.
		const errors = await obsidian.dev.runtimeErrors();
		expect(errors).toEqual([]);
	});
});
