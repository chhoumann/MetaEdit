import { readlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	acquireVaultRunLock,
	captureFailureArtifacts,
	clearVaultRunLockMarker,
	createObsidianClient,
	createSandboxApi,
	type ObsidianClient,
	type PluginHandle,
	type PluginReloadOptions,
	type SandboxApi,
	type VaultRunLock,
} from "obsidian-e2e";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

export const PLUGIN_ID = "metaedit";
// Canonical OBSIDIAN_E2E_* names are emitted by the shared obsidian-e2e runner;
// the legacy METAEDIT_E2E_* aliases remain a fallback during the migration.
export const E2E_VAULT =
	process.env.OBSIDIAN_E2E_VAULT ?? process.env.METAEDIT_E2E_VAULT ?? "dev";
export const E2E_BIN = process.env.OBSIDIAN_BIN ?? "obsidian";
// styles.css is a hand-written release asset shipped alongside main.js, so the
// provisioned vault symlinks all three artifacts.
export const PLUGIN_ARTIFACTS = ["main.js", "manifest.json", "styles.css"];
export const WAIT_OPTS = { timeoutMs: 15_000, intervalMs: 200 };
export const RELOAD_OPTIONS: PluginReloadOptions = {
	waitUntilReady: true,
	timeoutMs: 30_000,
	readyOptions: {
		// Plugin-ready sentinel: a command MetaEdit always registers in onload()
		// (`metaEditRun`). The dev-only `reloadMetaEdit` command is stripped from
		// production bundles (START.DEVCMD/END.DEVCMD), so it must not be used here.
		commandId: `${PLUGIN_ID}:metaEditRun`,
		...WAIT_OPTS,
	},
};

type HarnessState = {
	lock?: VaultRunLock;
	obsidian?: ObsidianClient;
	plugin?: PluginHandle;
	sandbox?: SandboxApi;
};

export type MetaEditE2EContext = {
	obsidian: ObsidianClient;
	plugin: PluginHandle;
	sandbox: SandboxApi;
};

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
);

export function createMetaEditE2EHarness(testName: string) {
	const state: HarnessState = {};

	beforeAll(async () => {
		state.obsidian = createObsidianClient({
			vault: E2E_VAULT,
			bin: E2E_BIN,
			timeoutMs: 20_000,
			intervalMs: 200,
		});
		await state.obsidian.verify();

		state.lock = await acquireVaultRunLock({
			vaultName: E2E_VAULT,
			vaultPath: await state.obsidian.vaultPath(),
			onBusy: "wait",
			timeoutMs: 60_000,
		});
		await state.lock.publishMarker(state.obsidian);

		await assertDevVaultSymlinks(await state.obsidian.vaultPath());

		state.plugin = state.obsidian.plugin(PLUGIN_ID);
		state.sandbox = await createSandboxApi({
			obsidian: state.obsidian,
			sandboxRoot: "__obsidian_e2e__",
			testName,
		});

		await state.obsidian.dev.resetDiagnostics().catch(() => undefined);
		await reloadMetaEdit(state.plugin, state.obsidian);
	}, 90_000);

	beforeEach((ctx) => {
		ctx.onTestFailed(async () => {
			if (!state.obsidian) return;

			await captureFailureArtifacts(
				{ id: ctx.task.id, name: ctx.task.name },
				state.obsidian,
				{
					captureOnFailure: true,
					plugin: state.plugin,
				},
			).catch((error) => {
				console.warn("MetaEdit E2E artifact capture failed", error);
			});
		});
	});

	beforeEach(async () => {
		await state.obsidian?.dev.resetDiagnostics().catch(() => undefined);
	});

	afterEach(async () => {
		if (!state.plugin || !state.obsidian) return;

		await restoreMetaEditData(state.plugin, state.obsidian);
	});

	afterAll(async () => {
		const errors: unknown[] = [];

		await runTeardown("restore plugin data", errors, () => {
			if (!state.plugin || !state.obsidian) return undefined;
			return restoreMetaEditData(state.plugin, state.obsidian);
		});
		await runTeardown("clean sandbox", errors, () => state.sandbox?.cleanup());
		await runTeardown("clear vault lock marker", errors, () => {
			if (!state.obsidian) return undefined;
			return clearVaultRunLockMarker(state.obsidian);
		});
		await runTeardown("release vault lock", errors, () =>
			state.lock?.release(),
		);

		if (errors.length > 0) {
			throw errors[0];
		}
	}, 30_000);

	return (): MetaEditE2EContext => {
		if (!state.obsidian || !state.plugin || !state.sandbox) {
			throw new Error("MetaEdit E2E harness is not initialized.");
		}

		return {
			obsidian: state.obsidian,
			plugin: state.plugin,
			sandbox: state.sandbox,
		};
	};
}

export async function reloadMetaEdit(
	plugin: PluginHandle,
	obsidian: ObsidianClient,
): Promise<void> {
	await plugin.reload(RELOAD_OPTIONS);
	await waitForMetaEditReady(obsidian);
}

export async function restoreMetaEditData(
	plugin: PluginHandle,
	obsidian: ObsidianClient,
): Promise<void> {
	await plugin.disable();
	await plugin.restoreData();
	await plugin.enable();
	await waitForMetaEditReady(obsidian);
}

export async function waitForMetaEditReady(
	obsidian: ObsidianClient,
): Promise<void> {
	await obsidian.waitFor(
		async () => {
			// MetaEdit exposes its public API on the plugin instance in onload()
			// (`this.api = new MetaEditApi(this).make()`), which is the most precise
			// signal that the plugin finished loading.
			return await obsidian.dev.evalJson<boolean>(
				`Boolean(app.plugins.plugins.${PLUGIN_ID}?.api)`,
			);
		},
		{
			...WAIT_OPTS,
			message: "MetaEdit plugin did not become ready.",
		},
	);
}

type AsyncEvalEnvelope<T> =
	| { ok: true; value: T }
	| { error: { message: string; stack?: string }; ok: false };

export async function evalJsonAsync<T>(
	obsidian: ObsidianClient,
	code: string,
): Promise<T> {
	const envelope = await obsidian.dev.eval<AsyncEvalEnvelope<T>>(`
		(async () => {
			const code = ${JSON.stringify(code)};
			try {
				const value = await (0, eval)(code);
				return JSON.stringify({ ok: true, value });
			} catch (error) {
				return JSON.stringify({
					ok: false,
					error: {
						message: error instanceof Error ? error.message : String(error),
						stack: error instanceof Error ? error.stack : undefined,
					},
				});
			}
		})()
	`);

	if (!envelope.ok) {
		throw new Error(
			[
				`Failed to evaluate async Obsidian code: ${envelope.error.message}`,
				envelope.error.stack ?? "",
			]
				.filter(Boolean)
				.join("\n"),
		);
	}

	return envelope.value;
}

async function assertDevVaultSymlinks(vaultPath: string): Promise<void> {
	const pluginDir = path.join(vaultPath, ".obsidian", "plugins", PLUGIN_ID);

	for (const fileName of PLUGIN_ARTIFACTS) {
		await assertSymlinkTarget(pluginDir, fileName);
	}
}

async function assertSymlinkTarget(
	pluginDir: string,
	fileName: string,
): Promise<void> {
	const linkPath = path.join(pluginDir, fileName);
	const expected = path.join(repoRoot, fileName);
	let target: string;

	try {
		target = await readlink(linkPath);
	} catch (error) {
		throw new Error(
			[
				"MetaEdit E2E preflight failed.",
				`Expected ${linkPath} to be a symlink to ${expected}.`,
				`Could not read symlink: ${error instanceof Error ? error.message : String(error)}`,
			].join(" "),
		);
	}

	const resolvedTarget = path.resolve(path.dirname(linkPath), target);
	if (resolvedTarget !== expected) {
		throw new Error(
			[
				"MetaEdit E2E preflight failed.",
				`Expected ${linkPath} to point at ${expected}.`,
				`It currently points at ${resolvedTarget}.`,
				"Repoint the vault plugin symlink intentionally before running pnpm run test:e2e.",
			].join(" "),
		);
	}
}

async function runTeardown(
	label: string,
	errors: unknown[],
	step: () => Promise<unknown> | unknown,
): Promise<void> {
	try {
		await step();
	} catch (error) {
		errors.push(error);
		console.warn(`MetaEdit E2E teardown failed during ${label}`, error);
	}
}
