import { describe, expect, test } from "vitest";
import {
	createMetaEditE2EHarness,
	evalJsonAsync,
	PLUGIN_ID,
} from "./harness";

const getContext = createMetaEditE2EHarness("metaedit-menu-filter");

// Open the real "Edit Meta" suggester (plugin.runMetaEditForFile) against a note
// and read back the keys it lists, under three IgnoredProperties configurations.
// This is the user-visible menu: the same FuzzySuggestModal a right-click "Edit
// Meta" opens. Returns the rendered keys so the test can assert on them.
async function captureMenuKeys(
	obsidian: Parameters<typeof evalJsonAsync>[0],
	opts: { notePath: string; noteBody: string },
): Promise<{ hideTags: string[]; showTags: string[]; disabled: string[] }> {
	return await evalJsonAsync(
		obsidian,
		`
		(async () => {
			const plugin = app.plugins.plugins.${PLUGIN_ID};
			const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
			const waitFor = async (pred, timeout = 5000) => {
				const start = Date.now();
				while (Date.now() - start < timeout) {
					if (pred()) return true;
					await sleep(60);
				}
				return false;
			};

			const snapshot = JSON.parse(JSON.stringify(plugin.settings.IgnoredProperties));
			const path = ${JSON.stringify(opts.notePath)};
			const existing = app.vault.getAbstractFileByPath(path);
			if (existing) await app.vault.delete(existing);
			const file = await app.vault.create(path, ${JSON.stringify(opts.noteBody)});
			await sleep(400);

			const setIgnored = async (enabled, hideFileTags, properties) => {
				plugin.settings.IgnoredProperties.enabled = enabled;
				plugin.settings.IgnoredProperties.hideFileTags = hideFileTags;
				plugin.settings.IgnoredProperties.properties = properties;
				await plugin.saveSettings();
			};

			const captureMenu = async () => {
				await plugin.runMetaEditForFile(file);
				await waitFor(() => document.querySelector(".suggestion-item"));
				await sleep(120);
				const keys = Array.from(document.querySelectorAll(".suggestion-item")).map((el) => {
					const t = el.querySelector(".suggestion-item-text") || el;
					return (t.textContent || "").replace(/[❌🔃]/g, "").trim();
				});
				// Close the suggester and wait until it is gone, so the next capture
				// reads a fresh menu rather than a stacked one.
				document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
				await waitFor(() => !document.querySelector(".suggestion-item"));
				await sleep(60);
				return keys;
			};

			try {
				await setIgnored(true, true, []);
				const hideTags = await captureMenu();

				await setIgnored(true, false, []);
				const showTags = await captureMenu();

				// Feature off, yet hideFileTags + an ignored key are set: nothing must
				// be filtered (the toggle does what it says).
				await setIgnored(false, true, ["status"]);
				const disabled = await captureMenu();

				return { hideTags, showTags, disabled };
			} finally {
				plugin.settings.IgnoredProperties = snapshot;
				await plugin.saveSettings();
				const orphan = app.vault.getAbstractFileByPath(path);
				if (orphan) await app.vault.delete(orphan);
			}
		})()
	`,
	);
}

describe("Edit Meta menu - file tag filtering (#46, #90)", () => {
	test("hides body #tags while keeping frontmatter, inline, and the tags: key", async () => {
		const { obsidian, sandbox } = getContext();

		const { hideTags, showTags, disabled } = await captureMenuKeys(obsidian, {
			notePath: sandbox.path("menu-filter.md"),
			noteBody:
				"---\ntags: [alpha, beta]\nstatus: open\n---\n\n# Note\n\nBody has #bodytag here.\n\nrating:: 5\n",
		});

		// hideFileTags ON: no body #tag survives, but the frontmatter `tags:` key,
		// `status`, and the inline `rating` field stay editable.
		expect(hideTags).not.toContain("#bodytag");
		expect(hideTags.some((k) => k.startsWith("#"))).toBe(false);
		expect(hideTags).toContain("tags");
		expect(hideTags).toContain("status");
		expect(hideTags).toContain("rating");
		// The action options are always present, so the menu is never empty.
		expect(hideTags).toContain("New YAML property");
		expect(hideTags).toContain("New Dataview field");

		// hideFileTags OFF: the body tag comes back.
		expect(showTags).toContain("#bodytag");
		expect(showTags).toContain("tags");

		// Feature disabled: nothing filtered even though hideFileTags and an
		// ignored key were set (regression for the latent enabled bug).
		expect(disabled).toContain("#bodytag");
		expect(disabled).toContain("status");
	});
});
