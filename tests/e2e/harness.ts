import { type ObsidianClient, resolveObsidianEnvOptions } from "obsidian-e2e";
import { createPluginHarness } from "obsidian-e2e/vitest";

export const PLUGIN_ID = "metaedit";
// Reused by tests for sandbox content polling; also the harness reload interval.
export const WAIT_OPTS = { timeoutMs: 15_000, intervalMs: 200 };

/**
 * In-app cleanup helper (interpolate into an eval body): closes every open
 * modal/suggester the way a user does - Escape routed through Obsidian's
 * keymap scope. Obsidian 1.13 removed the `.modal-close-button` DOM
 * affordance, which silently turned class-targeted close clicks into no-ops;
 * Escape is registered by `Modal`/`SuggestModal` themselves and survives DOM
 * redesigns. Going through the real close path (never `el.remove()`) runs
 * `onClose`, so pending `waitForClose` promises resolve and keymap scopes pop
 * instead of leaking into the next test.
 *
 * One Escape closes one layer (an open suggest popover before its modal), so
 * the loop presses per remaining layer, bounded. If Escape cannot drain the
 * stack, `app.workspace.activeModal?.close()` is the lifecycle-aware fallback;
 * anything still open after that throws with diagnostics rather than being
 * hidden by DOM removal.
 */
export const CLOSE_ALL_MODALS_JS = String.raw`
async function closeAllModals() {
	const settle = () => {
		const {promise, resolve} = Promise.withResolvers();
		setTimeout(resolve, 60);
		return promise;
	};
	const openLayers = () =>
		document.querySelectorAll(".modal-container").length +
		document.querySelectorAll(".suggestion-container").length;
	const pressEscape = () => {
		document.body.dispatchEvent(new KeyboardEvent("keydown", {
			key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true,
		}));
	};
	app.setting?.close?.();
	for (let round = 0; round < 10 && openLayers() > 0; round++) {
		pressEscape();
		await settle();
	}
	if (openLayers() > 0) {
		app.workspace.activeModal?.close?.();
		await settle();
	}
	if (openLayers() > 0) {
		const leftovers = Array.from(
			document.querySelectorAll(".modal-container, .suggestion-container"),
			(el) => el.className,
		);
		throw new Error("closeAllModals: still open after Escape + activeModal.close(): " + JSON.stringify(leftovers));
	}
}
`;

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
	// Failure-safe modal teardown: runs before EVERY per-test data restore,
	// including after a failed test whose in-body cleanup never ran. Without
	// this, a stuck prompt/suggester cascades modal-count-leak assertion
	// failures into later tests and files (#184).
	beforeDataRestore: (obsidian) =>
		obsidian.dev.evalJsonAsync<void>(
			`(async () => { ${CLOSE_ALL_MODALS_JS} await closeAllModals(); })()`,
		),
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

/**
 * Create (or replace) a vault file with `content` and wait for the metadata
 * cache to index it - including its frontmatter when the content carries a
 * `---` block - so a test can immediately parse/edit its properties.
 */
export async function writeLiveFile(
	obsidian: ObsidianClient,
	path: string,
	content: string,
): Promise<void> {
	const needsFrontmatter = content.startsWith("---");
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
					try {
						await app.vault.createFolder(current);
					} catch (error) {
						if (!String(error.message).includes("Folder already exists")) throw error;
					}
				}
			}
			const existing = app.vault.getAbstractFileByPath(path);
			if (existing) await app.vault.delete(existing);
			await app.vault.create(path, content);
			for (let i = 0; i < 40; i++) {
				const cache = app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(path));
				if (cache && (!${needsFrontmatter} || cache.frontmatter)) break;
				const {promise, resolve} = Promise.withResolvers();
				setTimeout(resolve, 50);
				await promise;
			}
		})()
		`,
	);
}
