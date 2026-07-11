# Repository Guidelines

## Project Overview
MetaEdit is an Obsidian community plugin for managing note metadata. It edits
YAML frontmatter and inline `key:: value` fields, and provides Auto Properties,
Progress Properties, Ignored Properties, edit-mode handling (single/multi
values), a Kanban board helper that updates linked notes when a card changes
lane, and a small public API for other plugins.

## Project Structure & Module Organization
Source lives in `src/`. Plugin registration and lifecycle wiring are in
`src/main.ts`; metadata read/write logic is in `src/metaController.ts` and
`src/parser.ts`; the public API is in `src/MetaEditApi.ts` / `src/IMetaEditApi.ts`;
settings are under `src/Settings/`; Svelte modal UI is under `src/Modals/`;
on-modify automators (Kanban helper, progress properties) are under
`src/automators/`; logging is under `src/logger/`; shared types are under
`src/Types/`.

Tests live next to the code (`src/**/*.test.ts`), in `__tests__/`, and alongside
the E2E harness scripts (`scripts/**/*.test.ts`). The shared jsdom-safe Obsidian
stub is `tests/obsidian-stub.ts`. The live Obsidian E2E suite is under
`tests/e2e/`.

Generated artifacts: `main.js` (and its source map) are git-ignored and built
into the repo root for release packaging, not hand-edited. `styles.css` is a
hand-written, committed release asset.

## Tooling & GitHub
- Use `pnpm` for package management and scripts. Avoid npm/yarn/bun.
- Use the GitHub CLI (`gh`) for issues, PRs, and releases.
- When resolving a GitHub issue, use `gh issue develop <issue-number>` to
  create/link the working branch before implementation.
- Follow Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`) so
  the shared release pipeline can determine versions. The PR title becomes the
  squash-merge commit and drives the released version.
- GitHub does not allow approving your own PR from the same account; do not block
  merge waiting for self-approval.

## Build, Test, and Development Commands
- `pnpm run dev`: watch-mode Rollup build, regenerating `main.js` as you edit.
- `pnpm run build`: production Rollup bundle (`main.js`).
- `pnpm run lint`: ESLint over the TypeScript sources.
- `pnpm run test`: Vitest unit suite (jsdom-free, `node` environment).
- `pnpm run test:coverage`: unit suite with V8 coverage.
- `pnpm run test:e2e`: build, then run the live Obsidian E2E suite (`tests/e2e/`).
- `pnpm run obsidian:e2e -- <command>`: run an `obsidian` CLI command against an
  isolated, auto-provisioned worktree instance (see below).

Before opening a PR, run the CI-equivalent checks locally:

```bash
pnpm run lint
pnpm run build
pnpm run test
```

## Coding Style & Naming Conventions
Tab indentation, LF endings, UTF-8 (see `.editorconfig`). Use camelCase for
variables and functions, PascalCase for classes and Svelte components, and
kebab-case for directories where practical. Prefer type-only imports and route
logging through `src/logger`. ESLint lints TypeScript only; `.svelte` files are
not linted.

## Testing Guidelines
Vitest runs in the `node` environment and aliases `obsidian` to
`tests/obsidian-stub.ts`; it cannot load real Obsidian modules. Structure
production code so Obsidian dependencies sit behind interfaces; unit tests target
pure logic (parser, controller helpers, queues, the Kanban helper) and swap in
adapters or the stub. Co-locate specs with their source or group them under a
feature folder. Add regression coverage for every bug fix, and ensure
`pnpm run test` passes before pushing.

When a bug depends on real Obsidian runtime behavior - frontmatter position,
metadata cache, file writes, settings migration, the link menu, or the Kanban
helper reacting to file modifications - reproduce it in Obsidian before changing
code and verify it there after the fix. Record the exact Obsidian version,
platform, vault setup, command or API call invoked, console/runtime errors, and
plugin state before and after.

## Obsidian Runtime Workflow
Agents with the `verify-in-obsidian` skill get the generic workflow there:
vault-mode choice, the runner script quartet, the `--print-env` HOME remap,
instance teardown, and the dev-tools loop. This section is the MetaEdit-specific
brief that a skill-less agent still needs.

- Plugin id `metaedit`. Reload with `obsidian vault=<vault> plugin:reload
  id=metaedit`; probe liveness with `Boolean(app.plugins.plugins.metaedit)`.
  Command id for the main action: `metaedit:metaEditRun`.
- The four runner scripts - `provision:e2e-vault`, `start:e2e-obsidian`,
  `stop:e2e-obsidian`, `obsidian:e2e` - run the shared `obsidian-e2e` bin,
  configured by `obsidian-e2e.config.mjs` at the repo root (plugin id, the three
  symlinked artifacts `main.js`/`manifest.json`/`styles.css`, and the
  `DEFAULT_SETTINGS`-shaped `data.json` seed).
- Worktrees use the isolated vault (`.obsidian-e2e-vaults/metaedit-<worktree>`)
  and must not race the shared `dev` vault. The canonical
  `/Users/christian/Developer/MetaEdit` checkout uses the shared `dev` vault
  (root `/Users/christian/Developer/dev_vault/dev`); only one checkout can own
  its plugin symlinks at a time.
- Always pass the `vault=` selector as a **prefix** argument, never a suffix -
  suffix form can resolve to the wrong vault.

```bash
pnpm run build                              # produce root main.js + manifest.json + styles.css first
pnpm run obsidian:e2e -- eval code='Boolean(app.plugins.plugins.metaedit)'
pnpm run obsidian:e2e -- dev:errors
pnpm run stop:e2e-obsidian                  # stop this worktree's instance on wrap-up

# point the Vitest tests/e2e suite at the isolated instance:
eval "$(pnpm run --silent start:e2e-obsidian -- --print-env)"
export HOME="$OBSIDIAN_E2E_OBSIDIAN_HOME"   # re-point the CLI socket, then: pnpm run test:e2e
```

The runner emits canonical `OBSIDIAN_E2E_*` env names, plus legacy
`METAEDIT_E2E_*` aliases during the migration (harness reads canonical first).

## Evidence-First Bug Triage
- Default workflow: reproduce in Obsidian first, then implement the fix, then
  verify in Obsidian again, then add/adjust unit tests for regression coverage.
- Do not assume a reported bug still exists; confirm current behavior before
  changing code. Issues may already be fixed by unrelated changes.
- Prefer real user conditions over synthetic tests (commands, right-click "Edit
  Meta" menu, settings state, frontmatter vs inline fields, platform specifics).
- When debugging command-triggered behavior, test both paths: hotkey execution
  and direct command execution (`obsidian command id=metaedit:metaEditRun`).
- If not reproducible after solid evidence gathering, respond with the exact
  tested setup and ask for a fresh issue with versions, config, and repro
  artifacts.

## Release & PR Expectations
Releases run on the shared forensic PR-to-release pipeline in
[`chhoumann/obsidian-plugin-workflows`](https://github.com/chhoumann/obsidian-plugin-workflows),
consumed via the three caller stubs in `.github/workflows/`
(`release-prepare.yml`, `release-trigger.yml`, `release.yml`). After every green
push to `master`, the `metaedit-release-bot` App opens or refreshes one standing
release PR containing only the synchronized version files (`package.json`,
`manifest.json`, `versions.json`) and generated notes; **merging that PR is the
sole release act.** There is no auto-release and no manual dispatch on the happy
path. The shared pipeline materializes the version files and keeps
`manifest.json` / `versions.json` in sync with the package version and Obsidian
`minAppVersion`. Release assets are `main.js`, `manifest.json`, and `styles.css`.
Treat unexpected diffs in `package.json`, `manifest.json`, or `versions.json` as
blockers until understood.

Pull requests should include: a concise summary of the user-facing change;
linked issues when relevant; screenshots or recordings for visible UI changes;
the exact commands run and whether Obsidian runtime verification was performed;
and release/migration impact (especially for settings, storage, or API changes).
Keep changes scoped - do not mix unrelated formatting, dependency churn, or
generated-artifact changes into a feature or bug-fix commit.

## Agent Playbook
Scripted or automated work should rerun `pnpm run lint`, `pnpm run build`, and
`pnpm run test` to keep the tree green, and surface disruptive operations in the
PR description. Treat unexpected diffs in `main.js`, `manifest.json`, or
`versions.json` as blockers until a maintainer approves. For runtime-affecting
changes, attach evidence from the isolated Obsidian E2E harness.
