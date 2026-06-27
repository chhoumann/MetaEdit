import { describe, expect, test } from "vitest";
import {
	createMetaEditE2EHarness,
	evalJsonAsync,
	PLUGIN_ID,
} from "./harness";
import type { AutoProperty } from "../../src/Types/autoProperty";

const getContext = createMetaEditE2EHarness("metaedit-auto-properties");

// Drive a real Auto Property edit through plugin.controller.editMetaElement and
// the AutoPropertyValueModal, manipulating the modal DOM exactly as a user would.
// Returns the file contents after the edit plus the persisted choices, so each
// test can assert on real on-disk results.
async function runAutoPropertyEdit(
	obsidian: Parameters<typeof evalJsonAsync>[0],
	opts: {
		notePath: string;
		noteBody: string;
		property: string;
		autoProperties: AutoProperty[];
		editMode?: string;
		// A function body (string) run with `dom` helpers + `modal` element in scope
		// to interact with the modal. Must leave the modal on a path to close.
		interact: string;
	},
): Promise<{ content: string; choices: string[] | undefined }> {
	return await evalJsonAsync(
		obsidian,
		`
		(async () => {
			const plugin = app.plugins.plugins.${PLUGIN_ID};
			const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
			const waitFor = async (sel, pred = () => true) => {
				const start = Date.now();
				while (Date.now() - start < 5000) {
					const el = Array.from(document.querySelectorAll(sel)).find(pred);
					if (el) return el;
					await sleep(80);
				}
				throw new Error("Timed out waiting for " + sel);
			};
			const dom = { sleep, waitFor };

			const snapshot = {
				auto: JSON.parse(JSON.stringify(plugin.settings.AutoProperties)),
				mode: plugin.settings.EditMode.mode,
			};
			plugin.settings.AutoProperties.enabled = true;
			plugin.settings.AutoProperties.properties = ${JSON.stringify(opts.autoProperties)};
			plugin.settings.EditMode.mode = ${JSON.stringify(opts.editMode ?? "All Single")};
			await plugin.saveSettings();

			const path = ${JSON.stringify(opts.notePath)};
			const existing = app.vault.getAbstractFileByPath(path);
			if (existing) await app.vault.delete(existing);
			const file = await app.vault.create(path, ${JSON.stringify(opts.noteBody)});
			await sleep(300);

			try {
				const props = await plugin.controller.getPropertiesInFile(file);
				const property = props.find((p) => p.key === ${JSON.stringify(opts.property)});
				if (!property) throw new Error("Property not parsed: ${opts.property}");

				const editPromise = plugin.controller.editMetaElement(property, props, file);
				const modal = await waitFor(".metaedit-ap-prompt");

				await (async () => { ${opts.interact} })();

				await Promise.race([editPromise, sleep(4000)]);
				await sleep(300);

				const content = await app.vault.read(file);
				const saved = plugin.settings.AutoProperties.properties.find(
					(a) => a.name === ${JSON.stringify(opts.property)},
				);
				return { content, choices: saved ? saved.choices : undefined };
			} finally {
				// Make sure no modal is left open to leak into the next test.
				document.querySelectorAll(".modal-close-button").forEach((b) => b.click());
				plugin.settings.AutoProperties = snapshot.auto;
				plugin.settings.EditMode.mode = snapshot.mode;
				await plugin.saveSettings();
			}
		})()
	`,
	);
}

describe("Auto Properties value prompt", () => {
	test("shows the description and writes the picked value (single, #59)", async () => {
		const { obsidian, sandbox } = getContext();

		const result = await runAutoPropertyEdit(obsidian, {
			notePath: sandbox.path("ap-single.md"),
			noteBody: "---\nstatus: todo\n---\n# Note\n",
			property: "status",
			autoProperties: [
				{
					name: "status",
					choices: ["todo", "in-progress", "done"],
					description: "The workflow state of this note",
					type: "Single",
				},
			],
			interact: `
				const desc = modal.querySelector(".metaedit-ap-prompt-desc");
				if (desc.textContent !== "The workflow state of this note") {
					throw new Error("Description not shown: " + desc.textContent);
				}
				const done = await dom.waitFor(".metaedit-ap-prompt-row", (el) => el.textContent.trim() === "done");
				done.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			`,
		});

		expect(result.content).toContain("status: done");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("saves a typed value as a new choice when chosen explicitly (#43)", async () => {
		const { obsidian, sandbox } = getContext();

		const result = await runAutoPropertyEdit(obsidian, {
			notePath: sandbox.path("ap-save.md"),
			noteBody: "---\nstatus: todo\n---\n",
			property: "status",
			autoProperties: [{ name: "status", choices: ["todo", "done"], type: "Single" }],
			interact: `
				const input = modal.querySelector(".metaedit-ap-prompt-input");
				input.value = "blocked";
				input.dispatchEvent(new Event("input", { bubbles: true }));
				const save = await dom.waitFor(
					".metaedit-ap-prompt-row",
					(el) => el.textContent.includes("Save") && el.textContent.includes("blocked"),
				);
				save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			`,
		});

		expect(result.content).toContain("status: blocked");
		expect(result.choices).toEqual(["todo", "done", "blocked"]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("uses a typed value once without polluting the choice list (#43)", async () => {
		const { obsidian, sandbox } = getContext();

		const result = await runAutoPropertyEdit(obsidian, {
			notePath: sandbox.path("ap-once.md"),
			noteBody: "---\nstatus: todo\n---\n",
			property: "status",
			autoProperties: [{ name: "status", choices: ["todo", "done"], type: "Single" }],
			interact: `
				const input = modal.querySelector(".metaedit-ap-prompt-input");
				input.value = "scratch";
				input.dispatchEvent(new Event("input", { bubbles: true }));
				const use = await dom.waitFor(
					".metaedit-ap-prompt-row",
					(el) => el.textContent.includes('Use "scratch"'),
				);
				use.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			`,
		});

		expect(result.content).toContain("status: scratch");
		expect(result.choices).toEqual(["todo", "done"]);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("multi type writes a YAML list and overrides AllSingle EditMode (#40)", async () => {
		const { obsidian, sandbox } = getContext();

		const result = await runAutoPropertyEdit(obsidian, {
			notePath: sandbox.path("ap-multi.md"),
			noteBody: "---\ntags: [work]\n---\n",
			property: "tags",
			editMode: "All Single",
			autoProperties: [
				{ name: "tags", choices: ["work", "personal", "urgent"], type: "Multi" },
			],
			interact: `
				const checks = Array.from(modal.querySelectorAll(".metaedit-ap-prompt-check"));
				const work = checks.find((c) => c.querySelector(".metaedit-ap-prompt-row-label").textContent === "work");
				if (!work.querySelector("input").checked) throw new Error("current value not pre-checked");
				const urgent = checks.find((c) => c.querySelector(".metaedit-ap-prompt-row-label").textContent === "urgent");
				urgent.querySelector("input").click();
				const confirm = await dom.waitFor("button.mod-cta", (el) => el.textContent.trim() === "Confirm");
				confirm.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			`,
		});

		expect(result.content).toContain("work");
		expect(result.content).toContain("urgent");
		// A real YAML list, not a comma string.
		expect(result.content).toMatch(/tags:\n\s*-\s*work\n\s*-\s*urgent/);
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("does not nest a Multi value into a list-of-lists under AllMulti (#40)", async () => {
		const { obsidian, sandbox } = getContext();

		// A Multi auto property yields a string[]; addYamlProp must not wrap it
		// again when the global EditMode is AllMulti, or it becomes [[...]].
		const notePath = sandbox.path("ap-nested.md");
		const result = await evalJsonAsync<{ content: string; tags: unknown }>(
			obsidian,
			`
			(async () => {
				const plugin = app.plugins.plugins.${PLUGIN_ID};
				const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
				const snapshot = plugin.settings.EditMode.mode;
				plugin.settings.EditMode.mode = "All Multi";
				const path = ${JSON.stringify(notePath)};
				const existing = app.vault.getAbstractFileByPath(path);
				if (existing) await app.vault.delete(existing);
				const file = await app.vault.create(path, "Body\\n");
				await sleep(300);
				try {
					await plugin.controller.addYamlProp("tags", ["work", "urgent"], file);
					await sleep(300);
					const content = await app.vault.read(file);
					const tags = app.metadataCache.getFileCache(file)?.frontmatter?.tags;
					return { content, tags };
				} finally {
					plugin.settings.EditMode.mode = snapshot;
				}
			})()
		`,
		);

		expect(result.tags).toEqual(["work", "urgent"]);
		expect(result.content).not.toContain("- - ");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("treats an entry without a type as single (back-compat)", async () => {
		const { obsidian, sandbox } = getContext();

		const result = await runAutoPropertyEdit(obsidian, {
			notePath: sandbox.path("ap-legacy.md"),
			noteBody: "---\nkind: a\n---\n",
			property: "kind",
			autoProperties: [{ name: "kind", choices: ["a", "b"] }],
			interact: `
				if (modal.querySelectorAll(".metaedit-ap-prompt-check").length !== 0) {
					throw new Error("legacy entry rendered as multi");
				}
				const b = await dom.waitFor(".metaedit-ap-prompt-row", (el) => el.textContent.trim() === "b");
				b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			`,
		});

		expect(result.content).toContain("kind: b");
		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});
});
