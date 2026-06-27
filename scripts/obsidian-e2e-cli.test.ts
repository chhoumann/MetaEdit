import { describe, expect, it } from "vitest";
import {
	obsidianCommandArgs,
	obsidianEnv,
	parseArgs,
} from "./obsidian-e2e-cli.mjs";

describe("obsidian-e2e-cli", () => {
	it("defaults to an eval of the vault name when no Obsidian command is provided", () => {
		const parsed = parseArgs([]);

		expect(parsed.instanceArgs).toEqual([]);
		expect(parsed.commandArgs).toEqual(["eval", "code=app.vault.getName()"]);
	});

	it("splits instance options from the Obsidian command", () => {
		const parsed = parseArgs([
			"--vault",
			"metaedit-worktree-a",
			"--profile-root",
			"profiles",
			"dev:errors",
		]);

		expect(parsed.instanceArgs).toEqual([
			"--vault",
			"metaedit-worktree-a",
			"--profile-root",
			"profiles",
		]);
		expect(parsed.commandArgs).toEqual(["dev:errors"]);
	});

	it("uses -- to pass option-like Obsidian command arguments", () => {
		const parsed = parseArgs([
			"--vault",
			"metaedit-worktree-a",
			"--",
			"eval",
			"--some-obsidian-flag",
		]);

		expect(parsed.instanceArgs).toEqual(["--vault", "metaedit-worktree-a"]);
		expect(parsed.commandArgs).toEqual(["eval", "--some-obsidian-flag"]);
	});

	it("accepts the leading separator produced by pnpm run before wrapper options", () => {
		const parsed = parseArgs([
			"--",
			"--vault",
			"metaedit-worktree-a",
			"eval",
			"code=app.vault.getName()",
		]);

		expect(parsed.instanceArgs).toEqual(["--vault", "metaedit-worktree-a"]);
		expect(parsed.commandArgs).toEqual(["eval", "code=app.vault.getName()"]);
	});

	it("prefixes commands with the resolved isolated vault", () => {
		expect(
			obsidianCommandArgs({ vaultName: "metaedit-worktree-a" }, [
				"eval",
				"code=app.vault.getName()",
			]),
		).toEqual([
			"vault=metaedit-worktree-a",
			"eval",
			"code=app.vault.getName()",
		]);
	});

	it("runs Obsidian CLI commands with the isolated HOME", () => {
		expect(obsidianEnv({ obsidianHome: "/tmp/metaedit/home" })).toMatchObject({
			HOME: "/tmp/metaedit/home",
		});
	});
});
