import { type App, type TAbstractFile, Notice, parseYaml, TFile, TFolder } from "obsidian";
import type MetaEdit from "../main";
import { EditMode } from "../Types/editMode";
import GenericPrompt from "../Modals/GenericPrompt/GenericPrompt";
import { BulkOptionModal } from "./BulkOptionModal";
import {
	type BulkOutcome,
	type BulkSummary,
	type ConflictPolicy,
	decideBulkWrite,
	emptySummary,
	formatSummary,
	recordOutcome,
} from "./bulkMetadata";

/**
 * Drives the bulk "add/update a YAML property across many notes" flow shared by
 * the folder context-menu item and the multi-select (`files-menu`) item.
 *
 * Writes go through Obsidian's `app.fileManager.processFrontMatter` - the exact
 * frontmatter primitive the rewritten controller write path is built on (see
 * metaController.processFrontMatter) - never hand-rolled YAML text edits. The
 * read, the conflict decision, and the write all happen inside a single
 * processFrontMatter callback per note, so each note's decision is made against
 * its live frontmatter rather than the lazily-updated metadata cache.
 */
export class BulkMetadataEditor {
	constructor(private app: App, private plugin: MetaEdit) {}

	/** Recursively collect markdown files within a folder. */
	public collectFromFolder(folder: TFolder): TFile[] {
		return this.dedupeByPath(this.markdownFilesIn(folder));
	}

	/**
	 * Collect markdown files from an arbitrary selection of files and folders
	 * (e.g. a multi-selection in the file explorer), expanding folders and
	 * dropping duplicates so a file reached two ways is only edited once.
	 */
	public collectFromSelection(files: TAbstractFile[]): TFile[] {
		const collected: TFile[] = [];
		for (const file of files) {
			if (file instanceof TFile) {
				if (file.extension === "md") collected.push(file);
			} else if (file instanceof TFolder) {
				collected.push(...this.markdownFilesIn(file));
			}
		}
		return this.dedupeByPath(collected);
	}

	/**
	 * Run the full interactive flow: prompt for the property name and value,
	 * choose a conflict policy when some notes already have the key, confirm
	 * destructive overwrites, apply, and report a single summary Notice.
	 */
	public async run(files: TFile[], scopeLabel: string): Promise<void> {
		if (files.length === 0) {
			new Notice("MetaEdit: no markdown notes to edit here.");
			return;
		}

		const noteWord = files.length === 1 ? "note" : "notes";
		const key = (
			await GenericPrompt.Prompt(
				this.app,
				`Property to add/update across ${files.length} ${noteWord} in ${scopeLabel}`,
				"Property name",
			).catch(() => null)
		)?.trim();
		if (!key) return;

		const rawValue = await GenericPrompt.Prompt(this.app, `Value for "${key}"`, "Value").catch(
			() => null,
		);
		// Abort on cancel or an empty value rather than writing a blank property
		// across the whole batch, matching the prior folder command's guard.
		if (!rawValue) return;

		const conflicts = await this.countExisting(files, key);
		let policy: ConflictPolicy = "skip";

		if (conflicts > 0) {
			const conflictWord = conflicts === 1 ? "note" : "notes";
			const conflictVerb = conflicts === 1 ? "has" : "have";
			const choice = await BulkOptionModal.Choose(this.app, {
				title: `${conflicts} ${conflictWord} already ${conflictVerb} "${key}"`,
				description: "Choose how to handle notes that already define this property.",
				options: [
					{
						key: "skip",
						label: "Skip notes that already have it",
						description: "Only add the property where it is missing. Nothing is overwritten.",
					},
					{
						key: "merge",
						label: "Merge into a list",
						description: `Add "${rawValue}" to the existing value(s) as a list, without duplicating.`,
					},
					{
						key: "overwrite",
						label: "Overwrite existing values",
						description: "Replace the current value. This cannot be undone.",
					},
				],
			});
			if (!choice) return;
			policy = choice as ConflictPolicy;

			if (policy === "overwrite") {
				// The confirmation is framed against the authoritative selection size,
				// not the cache-derived conflict count, so the stated blast radius can
				// never understate what the live apply will overwrite.
				const confirm = await BulkOptionModal.Choose(this.app, {
					title: `Overwrite "${key}" across ${files.length} ${noteWord}?`,
					description:
						"Existing values will be replaced wherever the property is present. Bulk edits cannot be undone with Ctrl+Z.",
					danger: true,
					options: [{ key: "yes", label: "Overwrite" }],
				});
				if (confirm !== "yes") return;
			}
		}

		const summary = await this.apply(files, key, rawValue, policy);
		new Notice(formatSummary(summary, key), 10_000);
	}

	/** Apply the property to every note, isolating per-note failures. */
	public async apply(
		files: TFile[],
		key: string,
		rawValue: string,
		policy: ConflictPolicy,
	): Promise<BulkSummary> {
		const wrapInArray = this.wrapInArrayFor(key);
		const summary = emptySummary(files.length);

		for (const file of files) {
			try {
				const outcome = await this.applyToFile(file, key, rawValue, policy, wrapInArray);
				recordOutcome(summary, outcome);
			} catch (error) {
				// Isolate the failure so one unwritable note never aborts the batch.
				const message = error instanceof Error ? error.message : String(error);
				summary.failed += 1;
				summary.failures.push({ path: file.path, error: message });
			}
		}

		// Report failures once, as a warning, rather than per-note error Notices
		// (LogManager.logWarning routes to logError, which would spam the UI and
		// register as runtime errors).
		if (summary.failures.length > 0) {
			console.warn(
				`MetaEdit bulk: failed to update ${summary.failures.length} note(s) for "${key}":`,
				summary.failures,
			);
		}

		return summary;
	}

	private async applyToFile(
		file: TFile,
		key: string,
		rawValue: string,
		policy: ConflictPolicy,
		wrapInArray: boolean,
	): Promise<BulkOutcome> {
		let outcome: BulkOutcome = "skipped";

		await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			const exists = Object.prototype.hasOwnProperty.call(frontmatter, key);
			const decision = decideBulkWrite({
				exists,
				currentValue: frontmatter[key],
				rawValue,
				policy,
				wrapInArray,
			});
			outcome = decision.outcome;
			if (decision.action === "write") {
				frontmatter[key] = decision.value;
			}
		});

		return outcome;
	}

	private markdownFilesIn(folder: TFolder): TFile[] {
		const files: TFile[] = [];
		for (const child of folder.children) {
			if (child instanceof TFile) {
				if (child.extension === "md") files.push(child);
			} else if (child instanceof TFolder) {
				files.push(...this.markdownFilesIn(child));
			}
		}
		return files;
	}

	private dedupeByPath(files: TFile[]): TFile[] {
		const byPath = new Map<string, TFile>();
		for (const file of files) {
			if (!byPath.has(file.path)) byPath.set(file.path, file);
		}
		return [...byPath.values()];
	}

	private async countExisting(files: TFile[], key: string): Promise<number> {
		let count = 0;
		for (const file of files) {
			const frontmatter = await this.readLiveFrontmatter(file);
			if (frontmatter && Object.prototype.hasOwnProperty.call(frontmatter, key)) count += 1;
		}
		return count;
	}

	private async readLiveFrontmatter(file: TFile): Promise<Record<string, unknown> | null> {
		const content = await this.app.vault.cachedRead(file);
		const lines = content.split(/\r?\n/);
		const firstLine = (lines[0] ?? "").replace(/^\uFEFF/, "");
		if (!/^---\s*$/.test(firstLine)) return null;

		const end = lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)\s*$/.test(line));
		if (end === -1) return null;

		let parsed: unknown;
		try {
			parsed = parseYaml(lines.slice(1, end).join("\n"));
		} catch {
			return null;
		}
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

		return parsed as Record<string, unknown>;
	}

	private wrapInArrayFor(key: string): boolean {
		const { mode, properties } = this.plugin.settings.EditMode;
		return mode === EditMode.AllMulti || (mode === EditMode.SomeMulti && properties.includes(key));
	}
}
