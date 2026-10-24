import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import esbuild from "esbuild";
import { afterAll, describe, expect, it } from "vitest";
import { rejectSvelteRuneModules } from "./svelte-rune-guard.mjs";

const dir = mkdtempSync(join(tmpdir(), "metaedit-rune-guard-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function bundle(importPath: string, source: string) {
	writeFileSync(join(dir, importPath), source);
	return esbuild.build({
		stdin: { contents: `import {value} from "./${importPath}"; console.debug(value);`, resolveDir: dir },
		bundle: true,
		write: false,
		logLevel: "silent",
		plugins: [rejectSvelteRuneModules()],
	});
}

describe("rejectSvelteRuneModules", () => {
	it.each(["counter.svelte.ts", "counter.svelte.js", "counter.svelte.mts"])("fails the build when %s is imported", async (file) => {
		await expect(bundle(file, "export const value = $state(0);")).rejects.toThrow(
			/Svelte rune modules \(\.svelte\.js\/\.svelte\.ts\) are not supported by this build/,
		);
	});

	it("leaves ordinary modules alone", async () => {
		const result = await bundle("counter.ts", "export const value = 0;");
		expect(result.errors).toEqual([]);
	});
});
