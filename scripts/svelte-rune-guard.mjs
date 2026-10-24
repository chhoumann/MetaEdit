// The build compiles `.svelte` components only. A `.svelte.js`/`.svelte.ts` rune
// module would need svelte's compileModule, and without it esbuild would bundle
// the raw `$state`/`$derived` calls, which then throw at runtime.
export function rejectSvelteRuneModules() {
	return {
		name: "reject-svelte-rune-modules",
		setup(build) {
			build.onLoad({filter: /\.svelte\.[cm]?[jt]s$/}, (args) => ({
				errors: [{text: `Svelte rune modules (.svelte.js/.svelte.ts) are not supported by this build: ${args.path}`}],
			}));
		},
	};
}
