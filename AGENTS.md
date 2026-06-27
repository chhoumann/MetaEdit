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
- Follow Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`,
  `release(version): ...`) so semantic-release can determine versions. The PR
  title becomes the squash-merge commit and drives the released version.
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

### Shared dev vault (main checkout)
For work in the canonical `/Users/christian/Developer/MetaEdit` checkout, use the
shared `dev` vault and target it explicitly with the `obsidian` CLI:

```bash
pnpm run dev
# reload MetaEdit in the dev vault after a rebuild:
obsidian vault=dev plugin:reload id=metaedit
# inspect plugin state / errors:
obsidian vault=dev eval code='app.plugins.plugins.metaedit?.manifest?.version'
obsidian vault=dev dev:errors
```

- Always pass the vault selector as a **prefix** argument
  (`obsidian vault=dev <command> ...`), never as a suffix - suffix form can
  resolve to the wrong vault due to CLI parsing.
- Dev vault root: `/Users/christian/Developer/dev_vault/dev`.
- MetaEdit plugin folder in the vault:
  `/Users/christian/Developer/dev_vault/dev/.obsidian/plugins/metaedit`, whose
  `main.js`/`manifest.json`/`styles.css` are symlinked to this checkout's
  artifacts. Only one checkout can own those symlinks at a time, so the shared
  `dev` vault is for the main checkout. Worktrees must use the isolated wrapper.

### Isolated worktree vault (parallel worktrees)
In a worktree, do **not** race the shared `dev` vault - multiple worktree agents
would clobber each other on the plugin symlink, `data.json`, and
`plugin:reload`. Use the isolated worktree wrapper instead. It provisions a
worktree-local vault under `.obsidian-e2e-vaults/metaedit-<worktree>`
(git-ignored), starts or reuses a private-`HOME` Obsidian instance bound to that
vault, disables Restricted Mode, waits until MetaEdit is live, and then runs your
command with the right `vault=<worktree vault>` and private `HOME` applied:

```bash
pnpm run build                              # produce root main.js + manifest.json + styles.css first
pnpm run obsidian:e2e -- eval code='app.vault.getName()'
pnpm run obsidian:e2e -- eval code='Boolean(app.plugins.plugins.metaedit)'
pnpm run obsidian:e2e -- dev:errors
```

- The wrapper links the worktree's own `main.js` / `manifest.json` / `styles.css`
  and seeds a clean `DEFAULT_SETTINGS`-shaped `data.json` on first provision; it
  never touches `/Users/christian/Developer/dev_vault/dev`.
- `pnpm run provision:e2e-vault` and `pnpm run start:e2e-obsidian` expose the
  provision/launch steps individually; both accept `--help`.
- To point the Vitest `tests/e2e` suite at the isolated instance, the `obsidian`
  CLI routes by `$HOME` (it talks to `$HOME/.obsidian-cli.sock`), so you must
  remap `HOME` as well as the vault name:

  ```bash
  pnpm run build                                # provisioning links main.js
  eval "$(pnpm run --silent start:e2e-obsidian -- --print-env)"
  export HOME="$METAEDIT_E2E_OBSIDIAN_HOME"     # re-point the CLI socket
  pnpm run test:e2e
  ```

### Stopping an isolated instance (avoid leaks)
Each started instance is a real Obsidian process tree plus a private profile
directory under `/private/tmp/metaedit-obsidian-e2e/<vault>-<hash>/`. Removing a
worktree does **not** stop it. Stop it explicitly:

```bash
pnpm run stop:e2e-obsidian            # stop THIS worktree's instance + remove its tmp dir
pnpm run stop:e2e-obsidian -- --dry-run   # show what would be stopped/removed
pnpm run stop:e2e-obsidian -- --prune     # also reap orphaned instances (worktree gone)
```

The teardown targets only this worktree's instance by its private
`--user-data-dir` token; the shared `dev` vault, other worktrees, and
quickadd/podnotes instances are untouched. Two layers keep instances from
leaking, so you rarely need `stop` by hand:

- **Orca archive hook** - `orca.yaml` runs the teardown for the worktree being
  removed. Remove worktrees with `orca worktree rm --worktree <selector>
  --run-hooks` so the hook fires.
- **Reap on next start** - `start:e2e-obsidian` and `obsidian:e2e` reap any
  orphaned instance (whose backing worktree no longer exists) before launching.

### Obsidian DevTools
Developer commands are available through `obsidian`: `dev:debug`, `dev:errors`,
`dev:console`, `dev:screenshot`, `eval`, and more. Keep the `vault=` selector as
a prefix on every command. `dev:console` / `dev:errors` are most reliable while
debugger capture is attached (`obsidian vault=dev dev:debug on`). For non-trivial
`eval` code, pass it via `code=...` from a file/heredoc to avoid shell-quoting
corruption.

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
Releases are semantic-release based and cut manually via the Release workflow
(Actions tab or `gh workflow run release.yml`); pushes to `master` do not
auto-release. `version-bump.mjs` keeps `manifest.json` and `versions.json` in sync with the
package version and Obsidian `minAppVersion`. Release assets are `main.js`,
`manifest.json`, and `styles.css`. Treat unexpected diffs in `package.json`,
`pnpm-lock.yaml`, `manifest.json`, or `versions.json` as blockers until
understood.

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
