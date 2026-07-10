// Consumer config for the shared obsidian-e2e instance runner. The four
// `provision:e2e-vault` / `start:e2e-obsidian` / `stop:e2e-obsidian` /
// `obsidian:e2e` scripts point at the `obsidian-e2e` bin, which reads this file
// from the worktree root. See the runner's README ("Instance Runner (CLI)") for
// the full schema.
//
// `defaultData` seeds a freshly provisioned vault's data.json. It mirrors
// DEFAULT_SETTINGS in src/Settings/defaultSettings.ts so a new vault loads with
// clean MetaEdit state; keep the two in sync. EditMode.mode uses the string
// value of the EditMode.AllSingle enum ("All Single"). scripts/e2e-config.test.ts
// fails if this drifts from DEFAULT_SETTINGS.
export default {
	pluginId: "metaedit",
	// MetaEdit ships a hand-written styles.css at the repo root alongside the
	// compiled main.js, so all three plugin artifacts are symlinked into the vault.
	pluginArtifacts: ["manifest.json", "main.js", "styles.css"],
	defaultData: {
		ProgressProperties: { enabled: false, properties: [] },
		IgnoredProperties: { enabled: false, properties: [], hideFileTags: false },
		AutoProperties: { enabled: false, properties: [] },
		EditMode: { mode: "All Single", properties: [] },
		KanbanHelper: { enabled: false, boards: [] },
		UIElements: { enabled: true },
	},
	buildCommand: "pnpm run build",
	// Emit legacy METAEDIT_E2E_* env aliases alongside the canonical OBSIDIAN_E2E_*
	// names while the harness and AGENTS.md playbooks migrate off them.
	envPrefix: "METAEDIT",
	// Confirm the MetaEdit plugin instance is live in the target vault. The launcher
	// waits for stdout to contain the match string; the code intentionally omits the
	// literal "=> true" so an echoed command can't be mistaken for a positive result.
	readyProbe: {
		kind: "eval",
		code: `Boolean(app.plugins.plugins["metaedit"])`,
		match: "=> true",
	},
};
