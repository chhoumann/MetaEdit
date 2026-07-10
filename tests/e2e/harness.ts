import { type ObsidianClient, resolveObsidianEnvOptions } from "obsidian-e2e";
import { createPluginHarness } from "obsidian-e2e/vitest";

export const PLUGIN_ID = "metaedit";
// Reused by tests for sandbox content polling; also the harness reload interval.
export const WAIT_OPTS = { timeoutMs: 15_000, intervalMs: 200 };

/**
 * Suite-scoped MetaEdit E2E harness built on obsidian-e2e's shared
 * `createPluginHarness`: one vault lock + sandbox + reload per file, per-test
 * diagnostics reset and data restore, failure-artifact capture, and the dev
 * vault symlink preflight. Returns the `(testName) => () => context` getter the
 * test bodies already consume.
 *
 * Canonical `OBSIDIAN_E2E_*` env is emitted by the shared runner; the legacy
 * `METAEDIT_E2E_*` aliases remain a fallback during the migration.
 */
export const createMetaEditE2EHarness = createPluginHarness({
	...resolveObsidianEnvOptions({ legacyPrefix: "METAEDIT" }),
	pluginId: PLUGIN_ID,
	reload: {
		// Plugin-ready sentinel: a command MetaEdit always registers in onload()
		// (`metaEditRun`). The dev-only `reloadMetaEdit` command is stripped from
		// production bundles (START.DEVCMD/END.DEVCMD), so it must not be used here.
		readyCommandId: `${PLUGIN_ID}:metaEditRun`,
		timeoutMs: 30_000,
		intervalMs: WAIT_OPTS.intervalMs,
	},
	// MetaEdit exposes its public API on the plugin instance in onload()
	// (`this.api = new MetaEditApi(this).make()`), the most precise signal that
	// the plugin finished loading.
	waitUntilReady: (obsidian) =>
		obsidian.dev.evalJson<boolean>(
			`Boolean(app.plugins.plugins.${PLUGIN_ID}?.api)`,
		),
	// styles.css is a hand-written release asset shipped alongside main.js, so the
	// provisioned dev vault symlinks all three artifacts.
	symlinkArtifacts: ["main.js", "manifest.json", "styles.css"],
	captureOnFailure: true,
});

/**
 * Evaluate an async body in the Obsidian runtime and decode the JSON result,
 * rethrowing remote failures (as `DevEvalError`) with their message and stack.
 * Thin adapter over the package's `obsidian.dev.evalJsonAsync` that keeps the
 * `(obsidian, code)` call shape the test bodies use.
 */
export function evalJsonAsync<T>(
	obsidian: ObsidianClient,
	code: string,
): Promise<T> {
	return obsidian.dev.evalJsonAsync<T>(code);
}
