import type { ObsidianClient } from "obsidian-e2e";
import { describe, expect, test } from "vitest";
import {
	createMetaEditE2EHarness,
	evalJsonAsync,
	PLUGIN_ID,
} from "./harness";

const getContext = createMetaEditE2EHarness("kanban-helper");
const WAIT = { timeoutMs: 25_000, intervalMs: 250 };

// Enable the Kanban helper for one board and attach the automator to the live
// modify pipeline, mirroring what the settings tab does at runtime.
async function enableBoard(
	obsidian: ObsidianClient,
	boardName: string,
	property: string,
): Promise<void> {
	await evalJsonAsync<void>(
		obsidian,
		`
		(async () => {
			const plugin = app.plugins.plugins.${PLUGIN_ID};
			plugin.settings.KanbanHelper = {
				enabled: true,
				boards: [{ boardName: ${JSON.stringify(boardName)}, property: ${JSON.stringify(property)} }],
			};
			plugin.toggleAutomators();
		})()
	`,
	);
}

async function writeLiveFile(
	obsidian: ObsidianClient,
	path: string,
	content: string,
): Promise<void> {
	await evalJsonAsync<void>(
		obsidian,
		`
		(async () => {
			const path = ${JSON.stringify(path)};
			const content = ${JSON.stringify(content)};
			const parts = path.split("/");
			let current = "";
			for (const part of parts.slice(0, -1)) {
				current = current ? current + "/" + part : part;
				if (!app.vault.getAbstractFileByPath(current)) {
					await app.vault.createFolder(current);
				}
			}
			const existing = app.vault.getAbstractFileByPath(path);
			if (existing) await app.vault.delete(existing);
			await app.vault.create(path, content);
			await new Promise((resolve) => setTimeout(resolve, 500));
		})()
	`,
	);
}

// Rewrite the board file (the modification a Kanban drag produces), which fires
// the vault "modify" event the helper reacts to.
async function modifyLiveFile(
	obsidian: Parameters<typeof evalJsonAsync>[0],
	path: string,
	content: string,
): Promise<void> {
	await evalJsonAsync<void>(
		obsidian,
		`
		(async () => {
			const file = app.vault.getAbstractFileByPath(${JSON.stringify(path)});
			if (!file) throw new Error("Board file not found: " + ${JSON.stringify(path)});
			await app.vault.modify(file, ${JSON.stringify(content)});
		})()
	`,
	);
}

function statusOf(content: string): string {
	const match = content.match(/^status:\s*(.*)$/m);
	return match ? match[1].trim() : "(no status)";
}

const note = (status: string) => `---\nstatus: ${status}\n---\n\nbody\n`;

const FRONTMATTER = ["---", "kanban-plugin: board", "---", ""];

describe("KanbanHelper live board behavior", () => {
	test("moves the card's leading link to the new lane without clobbering trailing links", async () => {
		const { obsidian, sandbox } = getContext();
		await enableBoard(obsidian, "Roadmap", "status");

		await writeLiveFile(obsidian, sandbox.path("Project A.md"), note("Backlog"));
		await writeLiveFile(obsidian, sandbox.path("2026-06-01.md"), note("DATE-ORIGINAL"));
		await writeLiveFile(obsidian, sandbox.path("Reference Note.md"), note("REF-ORIGINAL"));
		await writeLiveFile(
			obsidian,
			sandbox.path("Roadmap.md"),
			[
				...FRONTMATTER,
				"## Backlog",
				"",
				"- [ ] [[Project A]] @[[2026-06-01]] and see [[Reference Note]]",
				"",
				"## In Progress",
				"",
				"",
			].join("\n"),
		);

		// Let the metadata cache index the seeded files before the move.
		await evalJsonAsync<void>(
			obsidian,
			`(async () => { await new Promise((r) => setTimeout(r, 1500)); })()`,
		);

		// Simulate the drag: Project A goes Backlog -> In Progress.
		await modifyLiveFile(
			obsidian,
			sandbox.path("Roadmap.md"),
			[
				...FRONTMATTER,
				"## Backlog",
				"",
				"## In Progress",
				"",
				"- [ ] [[Project A]] @[[2026-06-01]] and see [[Reference Note]]",
				"",
				"",
			].join("\n"),
		);

		const cardContent = await sandbox.waitForContent(
			"Project A.md",
			(value) => value.includes("status: In Progress"),
			WAIT,
		);
		expect(statusOf(cardContent)).toBe("In Progress");

		// The date and reference links on the card line must be untouched.
		expect(statusOf(await sandbox.read("2026-06-01.md"))).toBe("DATE-ORIGINAL");
		expect(statusOf(await sandbox.read("Reference Note.md"))).toBe("REF-ORIGINAL");

		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});

	test("keeps updating later cards when an earlier card link is unresolvable", async () => {
		const { obsidian, sandbox } = getContext();
		await enableBoard(obsidian, "Sprint", "status");

		await writeLiveFile(obsidian, sandbox.path("Project B.md"), note("Done"));
		await writeLiveFile(
			obsidian,
			sandbox.path("Sprint.md"),
			[...FRONTMATTER, "## Backlog", "", "## In Progress", "", ""].join("\n"),
		);

		await evalJsonAsync<void>(
			obsidian,
			`(async () => { await new Promise((r) => setTimeout(r, 1500)); })()`,
		);

		// An unresolvable card ([[Missing Note]]) precedes a real one ([[Project B]]).
		await modifyLiveFile(
			obsidian,
			sandbox.path("Sprint.md"),
			[
				...FRONTMATTER,
				"## Backlog",
				"",
				"- [ ] [[Missing Note]]",
				"- [ ] [[Project B]]",
				"",
				"## In Progress",
				"",
				"",
			].join("\n"),
		);

		const content = await sandbox.waitForContent(
			"Project B.md",
			(value) => value.includes("status: Backlog"),
			WAIT,
		);
		expect(statusOf(content)).toBe("Backlog");

		expect(await obsidian.dev.runtimeErrors()).toEqual([]);
	});
});
