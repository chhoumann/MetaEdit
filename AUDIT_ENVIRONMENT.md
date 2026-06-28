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
  - `evalJsonAsync` breaks if the eval'd plugin code emits `console.log` output. For code paths that log (e.g. the Run no-op), drive the side effect with `obsidian.dev.eval` and assert via `obsidian.dev.runtimeErrors()`.
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
