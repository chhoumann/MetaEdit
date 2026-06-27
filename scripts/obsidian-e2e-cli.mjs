#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";
import { provisionVault } from "./provision-obsidian-e2e-vault.mjs";
import {
	isInstanceReady,
	launchObsidianInstance,
	parseArgs as parseInstanceArgs,
	prepareObsidianProfile,
	reapStaleInstances,
	reloadMetaEdit,
	resolveInstanceOptions,
	trustVaultAndVerifyMetaEdit,
	waitForInstanceReady,
} from "./start-obsidian-e2e-instance.mjs";

const VALUE_OPTIONS = new Set([
	"--vault",
	"--root",
	"--worktree",
	"--data",
	"--profile-root",
	"--obsidian-app",
	"--obsidian-bin",
]);
const BOOLEAN_OPTIONS = new Set(["--force"]);
const DEFAULT_COMMAND = ["eval", "code=app.vault.getName()"];

function printUsage() {
	console.log(`Usage: node scripts/obsidian-e2e-cli.mjs [instance options] [--] <obsidian command...>

Examples:
  pnpm run obsidian:e2e -- eval code=app.vault.getName()
  pnpm run obsidian:e2e -- dev:errors
  pnpm run obsidian:e2e -- --vault metaedit-my-worktree eval code='app.plugins.plugins.metaedit?.manifest?.version'

Instance options:
  --vault <name>        Vault/profile name. Defaults to metaedit-<worktree>.
  --root <path>         Directory that contains provisioned vaults. Defaults to .obsidian-e2e-vaults.
  --worktree <path>     MetaEdit worktree to link plugin files from. Defaults to cwd.
  --data <path>         Optional MetaEdit data.json seed to copy on first provision.
  --profile-root <path> Directory for per-vault Obsidian HOME profiles. Defaults to /tmp/metaedit-obsidian-e2e.
  --obsidian-app <name> Obsidian app name for macOS open. Defaults to Obsidian.
  --obsidian-bin <path> Obsidian CLI executable. Defaults to obsidian.
  --force               Recreate plugin symlinks if they already exist.
  --help                Show this help.
`);
}

export function parseArgs(argv) {
	const instanceArgs = [];
	const commandArgs = [];

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--") {
			const next = argv[index + 1];
			if (
				index === 0 &&
				(next === "--help" ||
					BOOLEAN_OPTIONS.has(next) ||
					VALUE_OPTIONS.has(next))
			) {
				continue;
			}
			commandArgs.push(...argv.slice(index + 1));
			break;
		}
		if (arg === "--help") {
			return { help: true, instanceArgs, commandArgs };
		}
		if (BOOLEAN_OPTIONS.has(arg)) {
			instanceArgs.push(arg);
			continue;
		}
		if (VALUE_OPTIONS.has(arg)) {
			const value = argv[index + 1];
			if (!value || value.startsWith("--")) {
				throw new Error(`${arg} requires a value.`);
			}
			instanceArgs.push(arg, value);
			index += 1;
			continue;
		}

		commandArgs.push(...argv.slice(index));
		break;
	}

	return {
		help: false,
		instanceArgs,
		commandArgs: commandArgs.length > 0 ? commandArgs : [...DEFAULT_COMMAND],
	};
}

export function obsidianEnv(options) {
	return {
		...process.env,
		HOME: options.obsidianHome,
	};
}

export function obsidianCommandArgs(options, commandArgs) {
	return [`vault=${options.vaultName}`, ...commandArgs];
}

export async function ensureObsidianInstance(options) {
	const provisionResult = await provisionVault(options);
	const profileResult = await prepareObsidianProfile(options);
	options.userDataPath = profileResult.userDataPath;

	const reused = await isInstanceReady(options);
	if (reused) {
		// A reused instance still holds the bundle it loaded earlier — possibly a
		// broken pre-rebuild one. Reload BEFORE verifying so the rebuilt main.js is
		// loaded first; otherwise a failed old bundle would make the readiness
		// check below time out before the reload ever runs.
		await reloadMetaEdit(options);
	} else {
		// A freshly launched instance loads the current bundle on its own.
		await launchObsidianInstance(options);
		await waitForInstanceReady(options);
	}

	await trustVaultAndVerifyMetaEdit(options);

	return {
		...provisionResult,
		...profileResult,
		obsidianHome: options.obsidianHome,
	};
}

function spawnObsidian(options, commandArgs) {
	return new Promise((resolve) => {
		const child = spawn(
			options.obsidianBin,
			obsidianCommandArgs(options, commandArgs),
			{
				env: obsidianEnv(options),
				stdio: "inherit",
			},
		);
		child.on("close", (code, signal) => {
			if (signal) {
				process.kill(process.pid, signal);
				return;
			}
			resolve(code ?? 1);
		});
		child.on("error", (error) => {
			console.error(error instanceof Error ? error.message : error);
			resolve(1);
		});
	});
}

async function main() {
	const parsed = parseArgs(process.argv.slice(2));
	if (parsed.help) {
		printUsage();
		return;
	}

	const options = resolveInstanceOptions(
		parseInstanceArgs(parsed.instanceArgs),
	);
	await reapStaleInstances(options);
	await ensureObsidianInstance(options);
	process.exitCode = await spawnObsidian(options, parsed.commandArgs);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
