import { describe, expect, test } from "vitest";
import { createMetaEditE2EHarness, evalJsonAsync, PLUGIN_ID } from "./harness";

const getContext = createMetaEditE2EHarness("audit-api");

// Drive the public API exactly as another plugin would: app.plugins.plugins.metaedit.api.
async function api<T>(
	obsidian: Parameters<typeof evalJsonAsync>[0],
	notePath: string,
	body: string,
	expr: string,
): Promise<T> {
	return await evalJsonAsync<T>(
		obsidian,
		`
		(async () => {
			const api = app.plugins.plugins.${PLUGIN_ID}.api;
			const path = ${JSON.stringify(notePath)};
			const body = ${JSON.stringify(body)};
			let f = app.vault.getAbstractFileByPath(path);
			if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
			await new Promise((r) => setTimeout(r, 300));
			const result = await (${expr});
			await new Promise((r) => setTimeout(r, 150));
			return result;
		})()
	`,
	);
}

describe("MetaEdit public API", () => {
	test("API-getPropertyValue + getPropertiesInFile read frontmatter, inline, and tags", async () => {
		const { obsidian, sandbox } = getContext();
		const result = await api<{ status: unknown; props: string[] }>(
			obsidian,
			sandbox.path("api-get.md"),
			"---\nstatus: active\n---\n#mytag\ninline:: 42\n",
			`(async () => {
				const status = await api.getPropertyValue("status", f);
				const props = (await api.getPropertiesInFile(f)).map(p => p.key + ":" + p.type);
				return { status, props };
			})()`,
		);
		expect(result.status).toBe("active");
		expect(result.props).toContain("status:0");
		expect(result.props).toContain("inline:1");
		expect(result.props.some((p) => p.startsWith("#mytag:2"))).toBe(true);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("API-createYamlProperty adds a key; refuses to clobber an existing one", async () => {
		const { obsidian, sandbox } = getContext();
		const result = await api<{ added: string; afterDup: string }>(
			obsidian,
			sandbox.path("api-create.md"),
			"---\nexisting: 1\n---\nbody\n",
			`(async () => {
				await api.createYamlProperty("fresh", "v", f);
				await new Promise(r => setTimeout(r, 150));
				const added = await app.vault.read(f);
				await api.createYamlProperty("existing", "SHOULD_NOT_OVERWRITE", f);
				await new Promise(r => setTimeout(r, 150));
				const afterDup = await app.vault.read(f);
				return { added, afterDup };
			})()`,
		);
		expect(result.added).toContain("fresh: v");
		// createYamlProperty must not overwrite an existing key.
		expect(result.afterDup).toContain("existing: 1");
		expect(result.afterDup).not.toContain("SHOULD_NOT_OVERWRITE");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("API-addOrUpdateProperty updates an existing key and creates a missing one", async () => {
		const { obsidian, sandbox } = getContext();
		const result = await api<{ content: string }>(
			obsidian,
			sandbox.path("api-upsert.md"),
			"---\nstatus: old\n---\nbody\n",
			`(async () => {
				await api.addOrUpdateProperty("status", "new", f);
				await api.addOrUpdateProperty("added", "yes", f);
				await new Promise(r => setTimeout(r, 200));
				return { content: await app.vault.read(f) };
			})()`,
		);
		expect(result.content).toContain("status: new");
		expect(result.content).not.toContain("status: old");
		expect(result.content).toContain("added: yes");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("API-update on a non-existent property is a safe no-op", async () => {
		const { obsidian, sandbox } = getContext();
		const result = await api<{ before: string; after: string; threw: string }>(
			obsidian,
			sandbox.path("api-update-missing.md"),
			"---\na: 1\n---\nbody\n",
			`(async () => {
				const before = await app.vault.read(f);
				let threw = "";
				try { await api.update("nope", "x", f); } catch (e) { threw = String(e && e.message || e); }
				await new Promise(r => setTimeout(r, 150));
				return { before, after: await app.vault.read(f), threw };
			})()`,
		);
		expect(result.threw).toBe("");
		expect(result.after).toBe(result.before);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("API-appendDataviewField appends a new instance without replacing existing ones", async () => {
		const { obsidian, sandbox } = getContext();
		const result = await api<{ content: string }>(
			obsidian,
			sandbox.path("api-append.md"),
			"start\nfield:: one\nmiddle\n",
			`(async () => {
				await api.appendDataviewField("field", "two", f);
				await new Promise(r => setTimeout(r, 200));
				return { content: await app.vault.read(f) };
			})()`,
		);
		// Both instances exist (append, not replace).
		expect(result.content).toContain("field:: one");
		expect(result.content).toContain("field:: two");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("API-getYamlPath / addOrUpdateYamlPath / updateYamlPath handle nested YAML", async () => {
		const { obsidian, sandbox } = getContext();
		const result = await api<{
			read: unknown;
			afterUpsert: unknown;
			afterUpdate: unknown;
			content: string;
		}>(
			obsidian,
			sandbox.path("api-yamlpath.md"),
			"---\nmeta:\n  nested: original\n---\nbody\n",
			`(async () => {
				const read = await api.getYamlPath("meta.nested", f);
				// Upsert a brand-new nested path with createParents.
				await api.addOrUpdateYamlPath(["meta", "added"], "created", f, { createParents: true });
				await new Promise(r => setTimeout(r, 150));
				const afterUpsert = await api.getYamlPath("meta.added", f);
				// Update an existing nested path.
				await api.updateYamlPath("meta.nested", "changed", f);
				await new Promise(r => setTimeout(r, 150));
				const afterUpdate = await api.getYamlPath("meta.nested", f);
				return { read, afterUpsert, afterUpdate, content: await app.vault.read(f) };
			})()`,
		);
		expect(result.read).toBe("original");
		expect(result.afterUpsert).toBe("created");
		expect(result.afterUpdate).toBe("changed");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("API-getFilesWithProperty returns files whose frontmatter has the key", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("api-haskey.md");
		const result = await api<{ found: boolean }>(
			obsidian,
			notePath,
			"---\nuniqueAuditKey: 1\n---\nbody\n",
			`(async () => {
				await new Promise(r => setTimeout(r, 300));
				const files = api.getFilesWithProperty("uniqueAuditKey").map(x => x.path);
				return { found: files.includes(${JSON.stringify(notePath)}) };
			})()`,
		);
		expect(result.found).toBe(true);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("API-getAutoProperties returns an isolated clone; setAutoProperties persists and validates", async () => {
		const { obsidian } = getContext();
		const result = await evalJsonAsync<{
			cloneIsolated: boolean;
			persisted: string[];
			rejectedBad: string;
		}>(
			obsidian,
			`
			(async () => {
				const api = app.plugins.plugins.${PLUGIN_ID}.api;
				const plugin = app.plugins.plugins.${PLUGIN_ID};

				// Mutating the returned clone must not affect stored settings.
				const clone = api.getAutoProperties();
				clone.push({ name: "ghost", choices: ["x"] });
				const cloneIsolated = !plugin.settings.AutoProperties.properties.some(a => a.name === "ghost");

				// Valid set persists.
				await api.setAutoProperties([{ name: "auditAP", choices: ["a", "b"], type: "Single" }]);
				const persisted = plugin.settings.AutoProperties.properties.map(a => a.name);

				// Invalid set is rejected (choices not strings).
				let rejectedBad = "";
				try { await api.setAutoProperties([{ name: "bad", choices: [1, 2] }]); }
				catch (e) { rejectedBad = String(e && e.message || e); }

				return { cloneIsolated, persisted, rejectedBad };
			})()
		`,
		);
		expect(result.cloneIsolated).toBe(true);
		expect(result.persisted).toContain("auditAP");
		expect(result.rejectedBad).toMatch(/choices|string/i);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("API-onMetadataChange fires on change with prev/next props and stops after unsubscribe", async () => {
		const { obsidian, sandbox } = getContext();
		const notePath = sandbox.path("api-onchange.md");
		const result = await evalJsonAsync<{
			firedCount: number;
			sawNewValue: boolean;
			afterUnsubCount: number;
		}>(
			obsidian,
			`
			(async () => {
				const api = app.plugins.plugins.${PLUGIN_ID}.api;
				const path = ${JSON.stringify(notePath)};
				let f = app.vault.getAbstractFileByPath(path);
				const body = "---\\nstate: one\\n---\\nbody\\n";
				if (f) { await app.vault.modify(f, body); } else { f = await app.vault.create(path, body); }
				await new Promise(r => setTimeout(r, 300));

				let firedCount = 0;
				let sawNewValue = false;
				const unsub = api.onMetadataChange((change) => {
					if (change.file.path !== path) return;
					firedCount++;
					if (change.properties.some(p => p.key === "state" && p.content === "two")) sawNewValue = true;
				});

				await api.update("state", "two", f);
				await new Promise(r => setTimeout(r, 600));
				const firedAfterChange = firedCount;

				unsub();
				await api.update("state", "three", f);
				await new Promise(r => setTimeout(r, 600));
				const afterUnsubCount = firedCount - firedAfterChange;

				return { firedCount: firedAfterChange, sawNewValue, afterUnsubCount };
			})()
		`,
		);
		expect(result.firedCount).toBeGreaterThan(0);
		expect(result.sawNewValue).toBe(true);
		// No callbacks after unsubscribe.
		expect(result.afterUnsubCount).toBe(0);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});
});
