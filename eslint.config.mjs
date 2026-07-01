import globals from "globals";
import obsidianmd from "eslint-plugin-obsidianmd";
import svelte from "eslint-plugin-svelte";
import tseslint from "typescript-eslint";

const sharedGlobals = {
	...globals.node,
	...globals.browser,
	activeDocument: "readonly",
	activeWindow: "readonly",
};

// Obsidian developer-policy / guideline rules. Keep this scoped to production
// plugin source: tests and harness code legitimately stub Obsidian globals and
// should not inherit plugin-review restrictions.
const obsidianGuidelineRules = {
	"obsidianmd/no-static-styles-assignment": "error",
	"obsidianmd/prefer-window-timers": "error",
	"obsidianmd/prefer-active-doc": "error",
	"obsidianmd/detach-leaves": "error",
	"obsidianmd/no-global-this": "error",
	"obsidianmd/settings-tab/no-manual-html-headings": "error",
	"obsidianmd/commands/no-plugin-name-in-command-name": "error",
};

export default tseslint.config(
	{
		// Generated artifacts, vendored code, the legacy JS build tooling, and
		// release scripts are not linted.
		ignores: [
			"node_modules/**",
			"main.js",
			"**/*.js.map",
			"coverage/**",
			".obsidian-e2e-vaults/**",
			".obsidian-e2e-artifacts/**",
			"esbuild.config.mjs",
			"version-bump.mjs",
			"scripts/*.mjs",
			// The docs site (website/) is a standalone Astro project with its own
			// tooling; it is not part of the plugin's lint surface.
			"website/**",
		],
	},
	...tseslint.configs.recommended,
	...svelte.configs["flat/recommended"],
	{
		files: ["**/*.{ts,mts,cts}"],
		languageOptions: {
			globals: sharedGlobals,
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
	{
		files: ["**/*.svelte"],
		languageOptions: {
			globals: sharedGlobals,
			parserOptions: {
				parser: tseslint.parser,
			},
		},
	},
	{
		files: ["src/**/*.{ts,mts,cts}"],
		ignores: ["src/**/*.{test,spec}.{ts,mts,cts}", "src/tests/**"],
		plugins: { obsidianmd },
		rules: obsidianGuidelineRules,
	},
);
