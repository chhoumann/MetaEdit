#!/usr/bin/env node
// Generates the canonical AUDIT_TRACKER.md (and AUDIT_NOTES.md) by merging the
// code-derived story content (canonical-stories.json) with live test/fix/retest
// status (status.json). Re-run after every status edit so the committed tracker
// stays the single source of truth.
//
//   node audit/generate-tracker.mjs
//
import {readFileSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const canonical = JSON.parse(readFileSync(join(here, "canonical-stories.json"), "utf8"));
const status = JSON.parse(readFileSync(join(here, "status.json"), "utf8"));

const stories = canonical.stories;
const byId = new Map(stories.map((s) => [s.id, s]));

// Validate every status row points at a real story and vice versa.
for (const id of Object.keys(status.rows)) {
	if (!byId.has(id)) throw new Error(`status.json has unknown story id: ${id}`);
}
for (const s of stories) {
	if (!status.rows[s.id]) {
		status.rows[s.id] = {
			test: "Not started",
			errors: "-",
			fix: "-",
			retest: "-",
			desktop: "-",
			mobile: "-",
		};
	}
}

const cell = (v) =>
	String(v ?? "")
		// Escape backslashes first so the pipe-escape introducer is unambiguous,
		// then escape table-breaking pipes and fold newlines to <br>.
		.replace(/\\/g, "\\\\")
		.replace(/\|/g, "\\|")
		.replace(/\r?\n/g, "<br>")
		.trim();

const STATUS_ORDER = {
	"Not started": 0,
	"Testing": 1,
	"Fail": 2,
	"Blocked": 3,
	"Fixing": 4,
	"Retesting": 5,
	"Pass": 6,
	"N/A": 7,
};

function counts() {
	const c = {};
	for (const s of stories) {
		const st = status.rows[s.id]?.test ?? "Not started";
		c[st] = (c[st] || 0) + 1;
	}
	return c;
}

const c = counts();
const total = stories.length;
const passing = c["Pass"] || 0;

let md = "";
md += "# MetaEdit End-to-End Audit Tracker\n\n";
md += "Single source of truth for the full end-to-end audit. One row per canonical user story.\n";
md += "Generated from `audit/canonical-stories.json` (story content) + `audit/status.json` (live status) via `node audit/generate-tracker.mjs`. Edit `status.json` and regenerate; do not hand-edit this table.\n\n";
md += "Full code-derived expected behavior, edge cases, and pre-test risk hypotheses per story live in `AUDIT_NOTES.md`. Test environments and the mobile-sweep methodology are in `AUDIT_ENVIRONMENT.md`.\n\n";

md += "## Delivered fixes (merged to master)\n\n";
md += "Every defect was reproduced live, fixed at the root with regression tests, retested on desktop + mobile, and shipped as area-grouped PRs:\n";
md += "- **#143** fix(core,api): clean Run no-op with no active file; block-list-safe, queued property deletion; inline-delete scoped to `::`; getFilesWithProperty presence check; getPropertiesInFile returns `[]`.\n";
md += "- **#144** fix(suggester): well-formed duplicate Notice; modal closes on write failure; transform surfaces failures; new-property suggestions exclude present keys.\n";
md += "- **#145** fix(automators): Completed Tasks counts only `[x]`/`[X]`; Kanban settings null-guard.\n";
md += "\nKnown low-priority limitation (flagged, not fixed): AUTO-08 - a *Multi* Auto Property feeding a single nested-tag leaf fails safely with an 'invalid tag' notice (degenerate combination; the Single-value hook works).\n\n";

md += "## Progress\n\n";
md += `- Total stories: **${total}**\n`;
md += `- Passing: **${passing} / ${total}**\n`;
md += "- Status breakdown: " +
	Object.entries(c)
		.sort((a, b) => (STATUS_ORDER[a[0]] ?? 99) - (STATUS_ORDER[b[0]] ?? 99))
		.map(([k, v]) => `${k}: ${v}`)
		.join(", ") +
	"\n\n";

md += "**Legend** - Test status: `Not started` / `Testing` / `Pass` / `Fail` / `Blocked` / `N/A`. ";
md += "Fix status: `-` (none needed) / `Fixing` / `Fixed` / `Won't fix`. ";
md += "Retest: `-` / `Retesting` / `Pass` / `Fail`. ";
md += "Desktop & Mobile columns record where each story was verified live (`Pass`/`Fail`/`-`/`N/A`/`Blocked`).\n\n";

// Group by area.
const areas = [...new Set(stories.map((s) => s.area))];
md += "## Stories\n\n";
md += "| ID | Feature | User Story | Expected Behavior | Plat | Test | Errors Found | Fix | Retest | Desktop | Mobile |\n";
md += "|----|---------|-----------|-------------------|------|------|--------------|-----|--------|---------|--------|\n";
for (const area of areas) {
	for (const s of stories.filter((x) => x.area === area)) {
		const r = status.rows[s.id];
		md += "| " + [
			s.id,
			cell(s.feature),
			cell(s.userStory),
			cell(s.expectedBehavior),
			cell(s.platform),
			cell(r.test),
			cell(r.errors),
			cell(r.fix),
			cell(r.retest),
			cell(r.desktop),
			cell(r.mobile),
		].join(" | ") + " |\n";
	}
}

md += "\n## Area index\n\n";
for (const area of areas) {
	const ids = stories.filter((x) => x.area === area).map((x) => x.id);
	md += `- **${area}**: ${ids.join(", ")}\n`;
}

writeFileSync(join(root, "AUDIT_TRACKER.md"), md);

// Notes file: full detail per story.
let notes = "";
notes += "# MetaEdit Audit - Story Notes\n\n";
notes += "Full code-derived expected behavior, edge cases, and pre-test risk hypotheses for each story in `AUDIT_TRACKER.md`. Generated from `audit/canonical-stories.json`.\n\n";
for (const area of areas) {
	notes += `## ${area}\n\n`;
	for (const s of stories.filter((x) => x.area === area)) {
		notes += `### ${s.id} - ${s.feature}\n\n`;
		notes += `- **Story:** ${s.userStory}\n`;
		notes += `- **Entry point:** ${s.entryPoint} | **Platform:** ${s.platform}\n`;
		notes += `- **Expected behavior:** ${s.expectedBehavior}\n`;
		if (s.edgeCases?.length) {
			notes += `- **Edge cases:**\n`;
			for (const e of s.edgeCases) notes += `  - ${e}\n`;
		}
		if (s.risks?.length) {
			notes += `- **Risks / test focus:**\n`;
			for (const r of s.risks) notes += `  - ${r}\n`;
		}
		const st = status.rows[s.id];
		if (st?.evidence) notes += `- **Evidence:** ${st.evidence}\n`;
		notes += "\n";
	}
}
writeFileSync(join(root, "AUDIT_NOTES.md"), notes);

// Persist any newly-initialized rows back so status.json stays complete.
writeFileSync(join(here, "status.json"), JSON.stringify(status, null, "\t") + "\n");

console.log(`Generated AUDIT_TRACKER.md and AUDIT_NOTES.md: ${total} stories, ${passing} passing.`);
console.log("Status:", JSON.stringify(c));
