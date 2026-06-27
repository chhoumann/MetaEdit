import { describe, expect, test } from "vitest";
import {
	createMetaEditE2EHarness,
	evalJsonAsync,
	PLUGIN_ID,
	WAIT_OPTS,
} from "./harness";

const getContext = createMetaEditE2EHarness("metaedit-runtime");

describe("MetaEdit runtime", () => {
	test("loads, exposes its API, and registers the run command", async () => {
		const { obsidian } = getContext();

		const state = await obsidian.dev.evalJson<{
			apiMethods: string[];
			hasRunCommand: boolean;
		}>(`
			(() => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				return {
					apiMethods: Object.keys(plugin?.api ?? {}).sort(),
					hasRunCommand: Boolean(app.commands?.commands?.[${JSON.stringify(`${PLUGIN_ID}:metaEditRun`)}]),
				};
			})()
		`);

		expect(state.hasRunCommand).toBe(true);
		expect(state.apiMethods).toEqual([
			"autoprop",
			"createYamlProperty",
			"getFilesWithProperty",
			"getPropertiesInFile",
			"getPropertyValue",
			"update",
		]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("creates, reads, and updates a YAML frontmatter property via the API", async () => {
		const { obsidian, sandbox } = getContext();

		const notePath = sandbox.path("note.md");
		await sandbox.write("note.md", "# Note\n\nBody text.\n", {
			waitForContent: true,
			waitOptions: WAIT_OPTS,
		});

		// createYamlProperty adds a brand-new frontmatter key to the file.
		await callApi(obsidian, "createYamlProperty", [
			"status",
			"draft",
			notePath,
		]);

		const afterCreate = await sandbox.waitForContent(
			"note.md",
			(value) => value.includes("status: draft"),
			WAIT_OPTS,
		);
		expect(afterCreate).toMatch(/^---\n[\s\S]*status: draft[\s\S]*---/);

		// getPropertyValue reads the value MetaEdit parsed back out of the file.
		const created = await callApi<string>(obsidian, "getPropertyValue", [
			"status",
			notePath,
		]);
		expect(String(created)).toBe("draft");

		// update mutates the existing property in place.
		await callApi(obsidian, "update", ["status", "published", notePath]);

		const afterUpdate = await sandbox.waitForContent(
			"note.md",
			(value) => value.includes("status: published"),
			WAIT_OPTS,
		);
		expect(afterUpdate).toContain("status: published");
		expect(afterUpdate).not.toContain("status: draft");

		const updated = await callApi<string>(obsidian, "getPropertyValue", [
			"status",
			notePath,
		]);
		expect(String(updated)).toBe("published");

		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});
});

// Invoke a MetaEdit public-API method inside the running app and return its
// (JSON-serializable) result.
async function callApi<T = unknown>(
	obsidian: Parameters<typeof evalJsonAsync>[0],
	method: string,
	args: unknown[],
): Promise<T> {
	return await evalJsonAsync<T>(
		obsidian,
		`
		(async () => {
			const api = app.plugins.plugins.${PLUGIN_ID}?.api;
			if (!api) throw new Error("MetaEdit API is not available.");
			return await api[${JSON.stringify(method)}](...${JSON.stringify(args)});
		})()
	`,
	);
}
