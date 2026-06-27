import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		// Generated artifacts, vendored code, the legacy JS build tooling, and
		// Svelte components are not linted.
		ignores: [
			"node_modules/**",
			"main.js",
			"**/*.js.map",
			"coverage/**",
			".obsidian-e2e-vaults/**",
			".obsidian-e2e-artifacts/**",
			"**/*.svelte",
			"esbuild.config.mjs",
			"version-bump.mjs",
			"scripts/*.mjs",
		],
	},
	...tseslint.configs.recommended,
	{
		files: ["**/*.{ts,mts,cts}"],
		languageOptions: {
			globals: {
				...globals.node,
				...globals.browser,
			},
		},
		rules: {
			// Pragmatic ruleset that matches the QuickAdd baseline: surface real
			// problems without drowning the existing codebase in churn.
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/consistent-type-imports": [
				"warn",
				{ fixStyle: "inline-type-imports" },
			],
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
			// Style-only; several settings-tab `let` bindings are declared without an
			// initializer and captured in closures, so converting them to const would
			// mean restructuring working UI code. Surface as a warning instead of
			// churning it here.
			"prefer-const": "warn",
		},
	},
);
