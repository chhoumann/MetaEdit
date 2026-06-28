# Obsidian Upgrade Notes

## Runtime Validation

- Isolated vault: `metaedit-obsidian-upgrade-impl`
- Obsidian HOME: `/tmp/metaedit-obsidian-e2e/metaedit-obsidian-upgrade-impl-470611471fb4/home`
- `pnpm run build`: passed
- `pnpm run lint`: passed with the repo's existing 11 warnings
- `pnpm run test`: passed, 215 tests
- `pnpm run test:e2e`: passed, 48 live Obsidian E2E tests

## Live Checks

- Baseline/minAppVersion: plugin loaded in the isolated vault with `minAppVersion: 1.5.7`; `dev:errors` was clean.
- Frontmatter: normal, missing, malformed, CRLF, and legacy `...`-closed notes were exercised live. The `getFrontMatterInfo` path preserves those reads and improves immediate reads after `processFrontMatter` expands a YAML block.
- Native input suggesters: empty property-name suggestions, seeded value Enter, inferred date input, and the Kanban board setting picker were all exercised through live Obsidian DOM.
- Property polish: the real "New YAML property" prompt now offers curated built-ins first, including `cssclass` and `publish`, then registry-sourced property names.

## Review Notes

- The custom `src/suggest.ts` and runtime `@popperjs/core` dependency were removed after both callers moved to `AbstractInputSuggest`.
- The `files-menu` augmentation was removed because it is typed by `obsidian@1.13.1`.
- Two adversarial-review attempts were made with `claude -p`; both hung without producing reviewer output, including a no-tools prompt. No reviewer findings were available to fold in.
