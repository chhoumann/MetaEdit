#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

// MetaEdit ships a hand-written styles.css at the repo root alongside the
// compiled main.js, so all three plugin artifacts are symlinked into the vault.
const REQUIRED_PLUGIN_FILES = ["manifest.json", "main.js", "styles.css"];
const DEFAULT_ROOT = ".obsidian-e2e-vaults";
const DEFAULT_VAULT_PREFIX = "metaedit";
const PLUGIN_ID = "metaedit";

// Expression evaluated via `obsidian eval` to confirm the MetaEdit plugin
// instance is live in the target vault (the launcher waits for stdout to
// contain "=> true"). The expression intentionally does not contain the literal
// "=> true" so an echoed command can't be mistaken for a positive result.
export const METAEDIT_READY_EVAL = `Boolean(app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}])`;

// A valid, default MetaEdit settings document. Mirrors DEFAULT_SETTINGS in
// src/Settings/defaultSettings.ts so a freshly provisioned vault loads with
// clean plugin state. Keep in sync with that file. EditMode.mode uses the
// string value of the EditMode.AllSingle enum ("All Single").
export const DEFAULT_METAEDIT_DATA = {
	ProgressProperties: { enabled: false, properties: [] },
	IgnoredProperties: { enabled: false, properties: [] },
	AutoProperties: { enabled: false, properties: [] },
	EditMode: { mode: "All Single", properties: [] },
	KanbanHelper: { enabled: false, boards: [] },
	UIElements: { enabled: true },
};

function slugify(value) {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 80) || "worktree"
	);
}

function printUsage() {
	console.log(`Usage: node scripts/provision-obsidian-e2e-vault.mjs [options]

Options:
  --vault <name>        Vault name to provision. Defaults to metaedit-<worktree>.
  --root <path>         Directory that contains provisioned vaults. Defaults to .obsidian-e2e-vaults.
  --worktree <path>     MetaEdit worktree to link plugin files from. Defaults to cwd.
  --data <path>         Optional MetaEdit data.json seed to copy on first provision.
  --force               Recreate plugin symlinks if they already exist.
  --print-env           Print METAEDIT_E2E_VAULT exports after provisioning.
  --json                Print a machine-readable summary after provisioning.
  --help                Show this help.
`);
}

export function parseArgs(argv) {
	const options = {
		force: false,
		json: false,
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
			case "--print-env":
				options.printEnv = true;
				break;
			case "--help":
				options.help = true;
				break;
			case "--vault":
			case "--root":
			case "--worktree":
			case "--data": {
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
	return arg.slice(2);
}

export function resolveProvisionOptions(rawOptions, cwd = process.cwd()) {
	const worktreePath = path.resolve(cwd, rawOptions.worktree ?? ".");
	const vaultName =
		rawOptions.vault ??
		`${DEFAULT_VAULT_PREFIX}-${slugify(path.basename(worktreePath))}`;
	// Default the vault root to the *worktree* (not cwd) so the provisioned vault
	// always lives inside the checkout whose plugin it links. Anchoring to cwd
	// would put `--worktree /other/checkout` vaults under the caller's directory,
	// where parallel worktrees would share a root — breaking isolation. An
	// explicit --root still resolves against cwd.
	const rootPath = rawOptions.root
		? path.resolve(cwd, rawOptions.root)
		: path.join(worktreePath, DEFAULT_ROOT);
	const vaultPath = path.resolve(rootPath, vaultName);
	const dataPath = rawOptions.data
		? path.resolve(cwd, rawOptions.data)
		: undefined;

	return {
		dataPath,
		force: rawOptions.force ?? false,
		json: rawOptions.json ?? false,
		printEnv: rawOptions.printEnv ?? false,
		rootPath,
		vaultName,
		vaultPath,
		worktreePath,
	};
}

async function pathExists(filePath) {
	try {
		await fs.lstat(filePath);
		return true;
	} catch (error) {
		if (error?.code === "ENOENT") return false;
		throw error;
	}
}

async function assertRequiredPluginFiles(worktreePath) {
	const missing = [];
	for (const fileName of REQUIRED_PLUGIN_FILES) {
		const filePath = path.join(worktreePath, fileName);
		if (!(await pathExists(filePath))) missing.push(fileName);
	}

	if (missing.length > 0) {
		throw new Error(
			[
				`Cannot provision MetaEdit in ${worktreePath}; missing ${missing.join(", ")}.`,
				"Run pnpm run build in that worktree before provisioning.",
			].join(" "),
		);
	}
}

async function writeJson(filePath, value) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(
		`${filePath}.tmp`,
		`${JSON.stringify(value, null, "\t")}\n`,
	);
	await fs.rename(`${filePath}.tmp`, filePath);
}

async function writeJsonIfMissing(filePath, value) {
	if (await pathExists(filePath)) return;
	await writeJson(filePath, value);
}

async function linkPluginFile(sourcePath, destinationPath, force) {
	const existing = await pathExists(destinationPath);
	if (existing && force) {
		await fs.unlink(destinationPath);
	} else if (existing) {
		const stat = await fs.lstat(destinationPath);
		if (!stat.isSymbolicLink()) {
			throw new Error(
				`${destinationPath} exists and is not a symlink. Use --force after reviewing it.`,
			);
		}

		const currentTarget = await fs.readlink(destinationPath);
		if (
			path.resolve(path.dirname(destinationPath), currentTarget) === sourcePath
		) {
			return;
		}

		throw new Error(
			`${destinationPath} points at ${currentTarget}. Use --force to relink it.`,
		);
	}

	await fs.symlink(sourcePath, destinationPath);
}

export async function provisionVault(options) {
	await assertRequiredPluginFiles(options.worktreePath);

	const obsidianPath = path.join(options.vaultPath, ".obsidian");
	const pluginPath = path.join(obsidianPath, "plugins", PLUGIN_ID);

	await fs.mkdir(pluginPath, { recursive: true });
	await writeJsonIfMissing(path.join(obsidianPath, "app.json"), {});
	await writeJsonIfMissing(path.join(obsidianPath, "appearance.json"), {});
	await writeJsonIfMissing(path.join(obsidianPath, "core-plugins.json"), []);
	await writeJson(path.join(obsidianPath, "community-plugins.json"), [
		PLUGIN_ID,
	]);
	await writeJsonIfMissing(path.join(obsidianPath, "workspace.json"), {
		main: { id: "metaedit-e2e", type: "split", children: [] },
		left: { id: "metaedit-e2e-left", type: "split", children: [] },
		right: { id: "metaedit-e2e-right", type: "split", children: [] },
	});

	for (const fileName of REQUIRED_PLUGIN_FILES) {
		await linkPluginFile(
			path.join(options.worktreePath, fileName),
			path.join(pluginPath, fileName),
			options.force,
		);
	}

	const pluginDataPath = path.join(pluginPath, "data.json");
	if (options.dataPath && !(await pathExists(pluginDataPath))) {
		await fs.copyFile(options.dataPath, pluginDataPath);
	} else {
		await writeJsonIfMissing(pluginDataPath, DEFAULT_METAEDIT_DATA);
	}

	return {
		pluginPath,
		vaultName: options.vaultName,
		vaultPath: options.vaultPath,
		worktreePath: options.worktreePath,
	};
}

export function toShellExports(result) {
	return [
		`export METAEDIT_E2E_VAULT=${shellQuote(result.vaultName)}`,
		`export METAEDIT_E2E_VAULT_PATH=${shellQuote(result.vaultPath)}`,
	].join("\n");
}

function shellQuote(value) {
	return `'${String(value).replaceAll("'", "'\\''")}'`;
}

async function main() {
	const rawOptions = parseArgs(process.argv.slice(2));
	if (rawOptions.help) {
		printUsage();
		return;
	}

	const options = resolveProvisionOptions(rawOptions);
	const result = await provisionVault(options);

	if (options.json) {
		console.log(JSON.stringify(result, null, 2));
	} else {
		// With --print-env, stdout must contain only the `export ...` lines so
		// `eval "$(... --print-env)"` works; route the human summary to stderr.
		const status = options.printEnv ? console.error : console.log;
		status(`Provisioned Obsidian E2E vault ${result.vaultName}`);
		status(`Vault path: ${result.vaultPath}`);
		status(`MetaEdit plugin: ${result.pluginPath}`);
		// Provisioning only lays down vault files; it does not launch Obsidian,
		// disable Restricted Mode, or confirm the plugin loads. Use
		// `pnpm run start:e2e-obsidian` / `pnpm run obsidian:e2e` for that.
		status("Plugin not yet verified — start an instance to trust & load it.");
	}

	if (options.printEnv) {
		console.log(toShellExports(result));
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
