#!/usr/bin/env node
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import {
	METAEDIT_READY_EVAL,
	provisionVault,
	resolveProvisionOptions,
	toShellExports,
} from "./provision-obsidian-e2e-vault.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_PROFILE_ROOT = "/tmp/metaedit-obsidian-e2e";
// Sidecar written at the instance root recording which worktree the instance
// belongs to. The teardown reaper reads it to reap an instance only once its
// worktree is gone (a removed/merged worktree) — the reliable leak signal.
export const INSTANCE_MARKER_FILE = "metaedit-e2e-instance.json";
const DEFAULT_OBSIDIAN_APP = "Obsidian";
const DEFAULT_OBSIDIAN_BIN = "obsidian";
const READY_TIMEOUT_MS = 30_000;
const READY_INTERVAL_MS = 500;
const METAEDIT_READY_MARKER = "=> true";

function printUsage() {
	console.log(`Usage: node scripts/start-obsidian-e2e-instance.mjs [options]

Options:
  --vault <name>        Vault/profile name. Defaults to metaedit-<worktree>.
  --root <path>         Directory that contains provisioned vaults. Defaults to .obsidian-e2e-vaults.
  --worktree <path>     MetaEdit worktree to link plugin files from. Defaults to cwd.
  --data <path>         Optional MetaEdit data.json seed to copy on first provision.
  --profile-root <path> Directory for per-vault Obsidian HOME profiles. Defaults to /tmp/metaedit-obsidian-e2e.
  --obsidian-app <name> Obsidian app name for macOS open. Defaults to Obsidian.
  --obsidian-bin <path> Obsidian CLI executable. Defaults to obsidian.
  --force               Recreate plugin symlinks if they already exist.
  --no-launch           Prepare the profile and vault without launching Obsidian.
  --print-env           Print exports for running e2e tests against this instance.
  --json                Print a machine-readable summary.
  --help                Show this help.
`);
}

export function parseArgs(argv) {
	const options = {
		force: false,
		json: false,
		launch: true,
		printEnv: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		switch (arg) {
			case "--":
				break;
			case "--force":
				options.force = true;
				break;
			case "--json":
				options.json = true;
				break;
			case "--no-launch":
				options.launch = false;
				break;
			case "--print-env":
				options.printEnv = true;
				break;
			case "--help":
				options.help = true;
				break;
			case "--vault":
			case "--root":
			case "--worktree":
			case "--data":
			case "--profile-root":
			case "--obsidian-app":
			case "--obsidian-bin": {
				const value = argv[index + 1];
				if (!value || value.startsWith("--")) {
					throw new Error(`${arg} requires a value.`);
				}
				options[toOptionKey(arg)] = value;
				index += 1;
				break;
			}
			default:
				throw new Error(`Unknown option: ${arg}`);
		}
	}

	return options;
}

function toOptionKey(arg) {
	if (arg === "--profile-root") return "profileRoot";
	if (arg === "--obsidian-app") return "obsidianApp";
	if (arg === "--obsidian-bin") return "obsidianBin";
	return arg.slice(2);
}

export function resolveInstanceOptions(rawOptions, cwd = process.cwd()) {
	const provisionOptions = resolveProvisionOptions(rawOptions, cwd);
	const profileRoot = path.resolve(
		cwd,
		rawOptions.profileRoot ?? DEFAULT_PROFILE_ROOT,
	);
	const instanceId = stableInstanceId(
		provisionOptions.worktreePath,
		provisionOptions.vaultName,
	);
	const instancePath = path.join(profileRoot, instanceId);
	const obsidianHome = path.join(instancePath, "home");

	return {
		...provisionOptions,
		instanceId,
		instancePath,
		launch: rawOptions.launch ?? true,
		obsidianApp: rawOptions.obsidianApp ?? DEFAULT_OBSIDIAN_APP,
		obsidianBin: rawOptions.obsidianBin ?? DEFAULT_OBSIDIAN_BIN,
		obsidianHome,
		profileRoot,
	};
}

function stableInstanceId(worktreePath, vaultName) {
	const hash = crypto
		.createHash("sha256")
		.update(`${path.resolve(worktreePath)}\0${vaultName}`)
		.digest("hex")
		.slice(0, 12);
	return `${safeName(vaultName).slice(0, 32)}-${hash}`;
}

function safeName(value) {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, "-")
			.replace(/^-+|-+$/g, "") || "vault"
	);
}

export async function prepareObsidianProfile(options) {
	const userDataPath = path.join(
		options.obsidianHome,
		"Library",
		"Application Support",
		"obsidian",
	);
	await fs.mkdir(userDataPath, { recursive: true, mode: 0o700 });
	await fs.mkdir(path.join(options.obsidianHome, "Library", "Logs"), {
		recursive: true,
		mode: 0o700,
	});
	await linkHostKeychains(options);

	const vaultId = stableVaultId(options.vaultPath);
	const obsidianJsonPath = path.join(userDataPath, "obsidian.json");
	await writeJson(obsidianJsonPath, {
		cli: true,
		updateDisabled: true,
		vaults: {
			[vaultId]: {
				open: true,
				path: options.vaultPath,
				ts: Date.now(),
			},
		},
	});

	// Record which worktree this instance belongs to so the teardown reaper can
	// reap it once that worktree is removed (see INSTANCE_MARKER_FILE).
	await writeJson(path.join(options.instancePath, INSTANCE_MARKER_FILE), {
		worktreePath: options.worktreePath,
		vaultName: options.vaultName,
		vaultPath: options.vaultPath,
	});

	return {
		obsidianJsonPath,
		userDataPath,
		vaultId,
	};
}

async function linkHostKeychains(options) {
	const realHome = process.env.HOME;
	if (!realHome) return;

	const source = path.join(realHome, "Library", "Keychains");
	const destination = path.join(options.obsidianHome, "Library", "Keychains");
	// If HOME is already the private profile (e.g. after the documented
	// `export HOME=$METAEDIT_E2E_OBSIDIAN_HOME`), source and destination are the
	// same path. Re-linking would unlink the real host-keychain symlink a prior
	// run created and replace it with a self-referential broken link — leave it.
	if (path.resolve(source) === path.resolve(destination)) return;
	try {
		await fs.lstat(source);
	} catch (error) {
		if (error?.code === "ENOENT") return;
		throw error;
	}

	try {
		const stat = await fs.lstat(destination);
		if (!stat.isSymbolicLink()) return;
		const target = await fs.readlink(destination);
		if (path.resolve(path.dirname(destination), target) === source) return;
		await fs.unlink(destination);
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}

	await fs.mkdir(path.dirname(destination), { recursive: true });
	await fs.symlink(source, destination);
}

function stableVaultId(vaultPath) {
	return crypto
		.createHash("sha256")
		.update(path.resolve(vaultPath))
		.digest("hex")
		.slice(0, 16);
}

async function writeJson(filePath, value) {
	await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
	try {
		const stat = await fs.lstat(filePath);
		if (stat.isSymbolicLink() || !stat.isFile()) {
			throw new Error(`${filePath} exists but is not a regular file.`);
		}
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
	await fs.writeFile(filePath, `${JSON.stringify(value, null, "\t")}\n`, {
		mode: 0o600,
	});
}

export async function launchObsidianInstance(options) {
	await fs.mkdir(options.instancePath, { recursive: true });
	await execFileAsync(
		"/usr/bin/open",
		[
			"-n",
			"-g",
			"-a",
			options.obsidianApp,
			"--env",
			`HOME=${options.obsidianHome}`,
			"--args",
			`--user-data-dir=${options.userDataPath}`,
			"--password-store=basic",
		],
		{
			env: obsidianEnv(options),
		},
	);

	return {
		pid: null,
		pidPath: null,
	};
}

function obsidianEnv(options) {
	return {
		...process.env,
		HOME: options.obsidianHome,
	};
}

async function execObsidian(options, args, execOptions = {}) {
	return execFileAsync(options.obsidianBin, args, {
		env: obsidianEnv(options),
		...execOptions,
	});
}

function cliSocketPath(options) {
	// The obsidian CLI talks to this unix socket; its presence means an instance
	// for this private HOME is up (or starting to listen).
	return path.join(options.obsidianHome, ".obsidian-cli.sock");
}

async function cliSocketExists(options) {
	try {
		await fs.lstat(cliSocketPath(options));
		return true;
	} catch {
		return false;
	}
}

export async function isInstanceReady(options) {
	// Non-launching readiness probe: the obsidian CLI auto-launches Obsidian on
	// the first command when nothing is running, so probing a cold HOME would
	// spawn a competing instance. A missing socket means "not running" — report
	// not-ready without probing.
	if (!(await cliSocketExists(options))) return false;

	try {
		const { stdout } = await execObsidian(
			options,
			[`vault=${options.vaultName}`, "vault", "info=path"],
			{ timeout: 5_000 },
		);
		return path.resolve(stdout.trim()) === path.resolve(options.vaultPath);
	} catch {
		return false;
	}
}

export async function waitForInstanceReady(options) {
	const expectedPath = path.resolve(options.vaultPath);
	const deadline = Date.now() + READY_TIMEOUT_MS;
	let lastError = "";

	while (Date.now() < deadline) {
		// Don't issue a CLI command before the just-launched instance is listening
		// on its socket: a probe sent first would make the CLI auto-launch a second
		// Obsidian on the same profile/vault, racing the one open -n started.
		if (!(await cliSocketExists(options))) {
			lastError = "waiting for the obsidian-cli socket to appear";
			await sleep(READY_INTERVAL_MS);
			continue;
		}
		try {
			const { stdout } = await execObsidian(options, [
				`vault=${options.vaultName}`,
				"vault",
				"info=path",
			]);
			const actualPath = path.resolve(stdout.trim());
			if (actualPath === expectedPath) return actualPath;
			lastError = `resolved ${actualPath}, expected ${expectedPath}`;
		} catch (error) {
			lastError =
				error?.stderr?.trim() ||
				error?.stdout?.trim() ||
				error?.message ||
				String(error);
		}
		await sleep(READY_INTERVAL_MS);
	}

	throw new Error(
		`Obsidian instance did not become ready for ${options.vaultName}. Last error: ${lastError}`,
	);
}

export async function trustVaultAndVerifyMetaEdit(options) {
	await execObsidian(options, [
		`vault=${options.vaultName}`,
		"plugins:restrict",
		"off",
	]);

	const deadline = Date.now() + READY_TIMEOUT_MS;
	let lastError = "";
	while (Date.now() < deadline) {
		try {
			const { stdout } = await execObsidian(options, [
				`vault=${options.vaultName}`,
				"eval",
				`code=${METAEDIT_READY_EVAL}`,
			]);
			if (stdout.includes(METAEDIT_READY_MARKER)) return true;
			lastError = stdout.trim();
		} catch (error) {
			lastError =
				error?.stderr?.trim() ||
				error?.stdout?.trim() ||
				error?.message ||
				String(error);
		}
		await sleep(READY_INTERVAL_MS);
	}

	throw new Error(
		`MetaEdit did not become available in ${options.vaultName}. Last error: ${lastError}`,
	);
}

export async function reloadMetaEdit(options) {
	// Reload the plugin so a reused instance picks up a rebuilt main.js (the
	// symlink target) instead of running the bundle it loaded earlier.
	await execObsidian(options, [
		`vault=${options.vaultName}`,
		"plugin:reload",
		"id=metaedit",
	]);
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toInstanceShellExports(result) {
	const lines = [
		toShellExports(result),
		`export METAEDIT_E2E_OBSIDIAN_HOME=${shellQuote(result.obsidianHome)}`,
	];
	// Propagate a non-default CLI binary so the Vitest harness (which reads
	// OBSIDIAN_BIN ?? "obsidian") targets the same instance this script verified.
	if (result.obsidianBin && result.obsidianBin !== DEFAULT_OBSIDIAN_BIN) {
		lines.push(`export OBSIDIAN_BIN=${shellQuote(result.obsidianBin)}`);
	}
	return lines.join("\n");
}

function shellQuote(value) {
	return `'${String(value).replaceAll("'", "'\\''")}'`;
}

// Self-healing safety net: before launching our own instance, reap any leaked
// instances whose backing worktree is gone (e.g. removed on merge without the
// orca archive hook running). Best-effort — a reap failure must never block a
// start. The reaper is imported lazily so the static module graph stays acyclic
// (the stop module imports our option resolver; we only need its reaper at
// runtime). Logs go to stderr so `--print-env` keeps stdout to `export …` lines.
export async function reapStaleInstances(options) {
	try {
		const { reapOrphanedInstances } = await import(
			"./stop-obsidian-e2e-instance.mjs"
		);
		await reapOrphanedInstances({
			profileRoot: options.profileRoot,
			exceptInstancePath: options.instancePath,
			log: console.error,
		});
	} catch (error) {
		console.error(
			`Skipping stale-instance reap: ${error instanceof Error ? error.message : error}`,
		);
	}
}

async function main() {
	const rawOptions = parseArgs(process.argv.slice(2));
	if (rawOptions.help) {
		printUsage();
		return;
	}

	const options = resolveInstanceOptions(rawOptions);
	await reapStaleInstances(options);
	const provisionResult = await provisionVault(options);
	const profileResult = await prepareObsidianProfile(options);
	options.userDataPath = profileResult.userDataPath;

	let launchResult = { pid: null, pidPath: null };
	let resolvedVaultPath = null;
	let verifiedMetaEdit = false;
	if (options.launch) {
		if (await isInstanceReady(options)) {
			// Reuse the running private instance instead of starting a second app
			// on the same HOME/vault, but reload first so a rebuilt main.js takes
			// effect — otherwise `--print-env` would hand the E2E suite a stale
			// bundle. Mirrors the obsidian:e2e wrapper.
			await reloadMetaEdit(options);
		} else {
			launchResult = await launchObsidianInstance(options);
		}
		resolvedVaultPath = await waitForInstanceReady(options);
		verifiedMetaEdit = await trustVaultAndVerifyMetaEdit(options);
	}
	const result = {
		...provisionResult,
		...profileResult,
		...launchResult,
		obsidianBin: options.obsidianBin,
		obsidianHome: options.obsidianHome,
		resolvedVaultPath,
		verifiedMetaEdit,
	};

	if (rawOptions.json) {
		console.log(JSON.stringify(result, null, 2));
	} else {
		// With --print-env, stdout must contain only the `export ...` lines so
		// `eval "$(... --print-env)"` works; route the human summary to stderr.
		const status = rawOptions.printEnv ? console.error : console.log;
		status(`Prepared Obsidian E2E instance ${result.vaultName}`);
		status(`Vault path: ${result.vaultPath}`);
		status(`Obsidian HOME: ${result.obsidianHome}`);
		if (result.pid) status(`Obsidian PID: ${result.pid}`);
		if (result.verifiedMetaEdit) status("MetaEdit plugin check: ok");
	}

	if (rawOptions.printEnv) {
		console.log(toInstanceShellExports(result));
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
