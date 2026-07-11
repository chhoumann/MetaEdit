# Audit Test Environments

Both desktop and mobile are live and drive the same MetaEdit build (`main.js` from this worktree). Story verification records a result in the Desktop and Mobile columns of `AUDIT_TRACKER.md`.

## Desktop (isolated worktree Obsidian harness)

- Driver: this repo's isolated worktree harness (`pnpm run obsidian:e2e`, Vitest `tests/e2e/`).
- Vault: `metaedit-audit-e2e` under `.obsidian-e2e-vaults/`, private `HOME` instance.
- Build under test: the worktree `main.js` (symlinked into the vault).
- Run the suite:
  ```bash
  pnpm run build
  eval "$(pnpm run --silent start:e2e-obsidian -- --print-env)"
  export HOME="$METAEDIT_E2E_OBSIDIAN_HOME"
  pnpm run test:e2e            # or: npx vitest run --config vitest.e2e.config.ts <file>
  ```
- Harness gotchas (learned this audit):
  - `obsidian.dev.eval` returns `undefined` for a sync expression in-process; use `evalJsonAsync` (async IIFE returning an object) for return values.
  - `evalJsonAsync` results are wrapped in per-call sentinel markers (obsidian-e2e >= 0.8.2), so `console.log` output from the eval'd plugin code no longer corrupts the JSON envelope.
  - MetaType enum: `YAML = 0`, `Dataview = 1`, `Tag = 2`.

## Mobile (Android emulator + CDP)

- Device: AVD `MetaEditMobileApi35` (Pixel 7), **Android 15 (API 35)**.
- App: **Obsidian mobile 1.12.7** (`md.obsidian`), release build (no `run-as`).
- Vault: `MetaEditMobile` at `/sdcard/Documents/MetaEditMobile` (shared storage, adb-pushable).
- SDK root: `/opt/homebrew/share/android-commandlinetools` (`emulator`, `platform-tools`, `avdmanager` present; `emulator` not on PATH by default).
- Bring-up:
  ```bash
  export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
  export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"
  emulator -avd MetaEditMobileApi35 -no-snapshot-save -no-boot-anim -gpu swiftshader_indirect &
  adb -s emulator-5554 wait-for-device
  adb -s emulator-5554 shell am start -n md.obsidian/.MainActivity
  # forward CDP to the WebView:
  adb -s emulator-5554 forward tcp:9333 localabstract:webview_devtools_remote_$(adb -s emulator-5554 shell pidof md.obsidian)
  ```
- Push the current build + reload:
  ```bash
  P=/sdcard/Documents/MetaEditMobile/.obsidian/plugins/metaedit
  adb -s emulator-5554 push main.js $P/main.js
  adb -s emulator-5554 push manifest.json $P/manifest.json
  adb -s emulator-5554 push styles.css $P/styles.css
  # reload via CDP:
  cd /Users/christian/Developer/safdeb
  uv run --no-project --with websockets python android_cdp.py eval "(async()=>{await app.plugins.disablePlugin('metaedit');await app.plugins.enablePlugin('metaedit');return 'ok'})()"
  ```
- Probe: `uv run --no-project --with websockets python android_cdp.py eval '<js returning JSON.stringify(...)>'` (CDP `Runtime.evaluate`, `awaitPromise`). Drive the real `app.plugins.plugins.metaedit.controller` / `.api`, assert on `app.vault.read`. The emulator WebView gives the same plugin code path as desktop; platform-only UI affordances (right-click file/folder menus) do not exist on mobile and are marked `N/A`.

## Mobile verification methodology

The 82 cross-platform stories run the IDENTICAL plugin code on mobile as on desktop (same `controller`/`api`/parser/write-path; only platform UI affordances differ). Mobile verification therefore drove a representative sweep of every area's core code path plus every fix, on Android 15 / Obsidian 1.12.7:

- `audit/mobile-sweep.js` (11 checks): create+read YAML, getPropertyValue, getFilesWithProperty with a falsy value (API-03 fix), getPropertiesInFile on a bad path (API-07 fix), block-style YAML list delete (CTRL-07 fix), append inline field, multi-value array write, nested YAML upsert+read, body-tag rename, progress task counting `[x]/[X]` only (PROG-03 fix), bulk merge. All passed.
- `audit/mobile-ui.js` (2 checks): the Edit Meta suggester opens with rows; the settings tab renders every MetaEdit section. Both passed.

Run with `audit/mobile-eval.sh audit/mobile-sweep.js`. The 12 `desktop`-only stories (right-click file/folder/selection context menus) have no mobile entry point and are marked `N/A`.
