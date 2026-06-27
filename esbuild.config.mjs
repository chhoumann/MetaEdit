import {builtinModules} from "node:module";
import {readFile} from "node:fs/promises";
import esbuild from "esbuild";
import esbuildSvelte from "esbuild-svelte";
import sveltePreprocess from "svelte-preprocess";

const isProduction = process.argv.includes("production");

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
			build.onLoad({filter: /\/src\/.*\.[cm]?[jt]sx?$/}, async (args) => {
				const contents = await readFile(args.path, "utf8");
				if (!contents.includes("START.DEVCMD") && !contents.includes("END.DEVCMD")) {
					return null;
				}

				const stripped = contents.replace(
					/\/\*START\.DEVCMD\*\/[\s\S]*?\/\*END\.DEVCMD\*\//g,
					"",
				);

				if (/\/\*(START|END)\.DEVCMD\*\//.test(stripped)) {
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
