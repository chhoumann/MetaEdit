import globals from "globals";
import { defineConfig } from "eslint/config";
import svelte from "eslint-plugin-svelte";
import tseslint from "typescript-eslint";

const sharedGlobals = {
	...globals.node,
	...globals.browser,
	activeDocument: "readonly",
	activeWindow: "readonly",
};

// Obsidian developer-policy / guideline checks, expressed with core rules so we
// don't pull in eslint-plugin-obsidianmd's dependency tree for seven rules. Each
// entry mirrors the obsidianmd rule named in its message. Keep this scoped to
// production plugin source: tests and harness code legitimately stub Obsidian
// globals and should not inherit plugin-review restrictions.
const timerFunctions = ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "requestAnimationFrame"];
const obsidianGuidelineRules = {
	"no-restricted-globals": [
		"error",
		...timerFunctions.map((name) => ({
			name,
			message: `Use 'window.${name}()' for popout window compatibility (obsidianmd/prefer-window-timers).`,
		})),
		{
			name: "document",
			message: "Use 'activeDocument' for popout window compatibility (obsidianmd/prefer-active-doc).",
		},
		...["global", "globalThis"].map((name) => ({
			name,
			message: "Use 'window' or 'activeWindow' for popout window compatibility (obsidianmd/no-global-this).",
		})),
	],
	"no-restricted-syntax": [
		"error",
		{
			selector: `CallExpression > MemberExpression.callee[object.name='activeWindow'][property.name=/^(${timerFunctions.join("|")})$/]`,
			message: "Use 'window' for timers, not 'activeWindow' (obsidianmd/prefer-window-timers).",
		},
		...[
			"AssignmentExpression[right.type='Literal'][left.object.property.name='style']",
			"CallExpression[callee.property.name='setProperty'][callee.object.property.name='style'][arguments.1.type='Literal']",
			"CallExpression[callee.property.name='setAttribute'][arguments.0.value='style'][arguments.1.type='Literal']",
			"CallExpression[callee.property.name=/^setCss(Props|Styles)$/] > ObjectExpression > Property > Literal.key[value=/^(?!--)/]",
		].map((selector) => ({
			selector,
			message: "Avoid static inline styles; use CSS classes, or setCssProps with CSS variables (obsidianmd/no-static-styles-assignment).",
		})),
		{
			selector: "MethodDefinition[key.name='onunload'] > FunctionExpression > BlockStatement > ExpressionStatement > CallExpression[callee.property.name='detachLeavesOfType']",
			message: "Don't detach leaves in onunload (obsidianmd/detach-leaves).",
		},
		{
			selector: "ClassDeclaration[superClass.name='PluginSettingTab'] CallExpression[callee.property.name='createEl'][arguments.0.value=/^h[1-6]$/]",
			message: "Use new Setting(containerEl).setName(...).setHeading() instead of HTML headings (obsidianmd/settings-tab/no-manual-html-headings).",
		},
		{
			selector: "CallExpression[callee.property.name='addCommand'] > ObjectExpression > Property[key.name='name'] > Literal.value[value=/metaedit/i]",
			message: "Obsidian already prefixes command names with the plugin name (obsidianmd/commands/no-plugin-name-in-command-name).",
		},
	],
};

export default defineConfig(
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
	tseslint.configs.recommended,
	svelte.configs.recommended,
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
		rules: obsidianGuidelineRules,
	},
);
