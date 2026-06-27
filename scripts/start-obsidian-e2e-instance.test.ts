import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	parseArgs,
	prepareObsidianProfile,
	resolveInstanceOptions,
	toInstanceShellExports,
} from "./start-obsidian-e2e-instance.mjs";

const tempRoots: string[] = [];

async function makeTempDir(name: string) {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), `${name}-`));
	tempRoots.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("start-obsidian-e2e-instance", () => {
	it("derives a private profile HOME under the profile root", () => {
		const options = resolveInstanceOptions(
			parseArgs([
				"--vault",
				"metaedit-worktree-a",
				"--root",
				"vaults",
				"--profile-root",
				"profiles",
				"--no-launch",
			]),
			"/tmp/metaedit-instance",
		);

		expect(
			options.obsidianHome.startsWith(
				path.join("/tmp/metaedit-instance", "profiles", "metaedit-worktree-a-"),
			),
		).toBe(true);
		expect(options.obsidianHome.endsWith("/home")).toBe(true);
		expect(options.vaultPath).toBe(
			path.join("/tmp/metaedit-instance", "vaults", "metaedit-worktree-a"),
		);
	});

	it("creates a private Obsidian profile registered to the provisioned vault", async () => {
		const cwd = await makeTempDir("metaedit-instance");
		const options = resolveInstanceOptions(
			parseArgs([
				"--vault",
				"metaedit-worktree-a",
				"--root",
				"vaults",
				"--profile-root",
				"profiles",
				"--no-launch",
			]),
			cwd,
		);

		const profile = await prepareObsidianProfile(options);
		const registry = JSON.parse(
			await fs.readFile(profile.obsidianJsonPath, "utf8"),
		);
		const vaults = Object.values(registry.vaults) as Array<{
			path: string;
			open: boolean;
		}>;

		expect(registry.cli).toBe(true);
		expect(registry.updateDisabled).toBe(true);
		const hostKeychains = path.join(
			process.env.HOME ?? "",
			"Library",
			"Keychains",
		);
		const privateKeychains = path.join(
			options.obsidianHome,
			"Library",
			"Keychains",
		);
		if (await exists(hostKeychains)) {
			await expect(fs.readlink(privateKeychains)).resolves.toBe(hostKeychains);
		} else {
			await expect(fs.lstat(privateKeychains)).rejects.toMatchObject({
				code: "ENOENT",
			});
		}
		expect(
			options.obsidianHome.startsWith(
				path.join(cwd, "profiles", "metaedit-worktree-a-"),
			),
		).toBe(true);
		expect(options.obsidianHome.endsWith("/home")).toBe(true);
		expect(vaults).toEqual([
			{
				open: true,
				path: path.join(cwd, "vaults", "metaedit-worktree-a"),
				ts: expect.any(Number),
			},
		]);
		expect(
			toInstanceShellExports({
				obsidianHome: options.obsidianHome,
				vaultName: options.vaultName,
				vaultPath: options.vaultPath,
			}),
		).toContain("METAEDIT_E2E_OBSIDIAN_HOME=");
	});

	it("exports OBSIDIAN_BIN only when a non-default binary is used", () => {
		const base = {
			obsidianHome: "/tmp/home",
			vaultName: "metaedit-a",
			vaultPath: "/tmp/vault",
		};

		expect(toInstanceShellExports(base)).not.toContain("OBSIDIAN_BIN=");
		expect(
			toInstanceShellExports({ ...base, obsidianBin: "obsidian" }),
		).not.toContain("OBSIDIAN_BIN=");
		expect(
			toInstanceShellExports({ ...base, obsidianBin: "/opt/custom/obsidian" }),
		).toContain("export OBSIDIAN_BIN='/opt/custom/obsidian'");
	});
});

async function exists(filePath: string) {
	try {
		await fs.lstat(filePath);
		return true;
	} catch (error) {
		if ((error as { code?: string }).code === "ENOENT") return false;
		throw error;
	}
}
