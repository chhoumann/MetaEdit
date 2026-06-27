import {builtinModules} from "node:module";
import {readFile} from "node:fs/promises";
import {dirname, join, sep} from "node:path";
import {fileURLToPath} from "node:url";
import esbuild from "esbuild";
import esbuildSvelte from "esbuild-svelte";
import sveltePreprocess from "svelte-preprocess";

const isProduction = process.argv.includes("production");
const projectSrcDir = `${join(dirname(fileURLToPath(import.meta.url)), "src")}${sep}`;
const devCommandBlockPattern = /\/\*\s*START\.DEVCMD\s*\*\/[\s\S]*?\/\*\s*END\.DEVCMD\s*\*\//g;

const external = [
	"obsidian",
	"electron",
	"@codemirror/*",
	"@lezer/*",
	...builtinModules,
	...builtinModules.map((moduleName) => `node:${moduleName}`),
];

function loaderFor(path) {
	if (path.endsWith(".tsx")) return "tsx";
	if (path.endsWith(".jsx")) return "jsx";
	if (path.endsWith(".ts") || path.endsWith(".mts") || path.endsWith(".cts")) return "ts";
	return "js";
}

function stripDevCommandBlocks() {
	return {
		name: "strip-dev-command-blocks",
		setup(build) {
			build.onLoad({filter: /\.(?:[cm]?[jt]sx?|svelte)$/}, async (args) => {
				if (!args.path.startsWith(projectSrcDir)) return null;

				const contents = await readFile(args.path, "utf8");
				if (!contents.includes("DEVCMD")) return null;

				if (args.path.endsWith(".svelte")) {
					throw new Error(`DEVCMD markers are only supported in TypeScript/JavaScript source files: ${args.path}`);
				}

				const stripped = contents.replace(devCommandBlockPattern, "");

				if (stripped.includes("DEVCMD")) {
					throw new Error(`Unmatched START.DEVCMD/END.DEVCMD block in ${args.path}`);
				}

				return {
					contents: stripped,
					loader: loaderFor(args.path),
				};
			});
		},
	};
}

const options = {
	entryPoints: ["src/main.ts"],
	bundle: true,
	outfile: "main.js",
	format: "cjs",
	platform: "browser",
	target: "es2020",
	sourcemap: true,
	treeShaking: true,
	external,
	mainFields: ["svelte", "browser", "module", "main"],
	conditions: ["svelte", "browser"],
	define: {
		"process.env.NODE_ENV": JSON.stringify(isProduction ? "production" : "development"),
	},
	logLevel: "info",
	plugins: [
		...(isProduction ? [stripDevCommandBlocks()] : []),
		esbuildSvelte({
			compilerOptions: {css: "injected"},
			preprocess: sveltePreprocess(),
		}),
	],
};

if (isProduction) {
	await esbuild.build(options);
} else {
	const context = await esbuild.context(options);
	await context.watch();
}
