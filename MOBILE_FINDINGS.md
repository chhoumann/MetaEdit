# MetaEdit Mobile Findings

Status: issue #99 failure modes did not reproduce on a real current iPhone with
the post-#119/#136 build; broader iPhone smoke passed. Android was not run in
this session.

## Scope

This investigation starts from issue #99, where MetaEdit failed on Obsidian
mobile because desktop exposed newer frontmatter range APIs while mobile still
surfaced the older `frontmatter.position` shape. PR #119 replaced YAML writes
with `app.fileManager.processFrontMatter`, and PR #136 moved frontmatter reads to
Obsidian's `getFrontMatterInfo(content)`.

The real-device result below supports the root-fix hypothesis for iOS: the issue
#99 read/write failures did not reproduce with the post-#119/#136 MetaEdit build
on current Obsidian iOS. This run does not reproduce the original iOS 1.4.7 /
API 1.3.7 environment, so it proves current real-iPhone behavior rather than a
same-runtime before/after control.

## Current Evidence

- Issue #99 remains open and describes Obsidian iOS TestFlight 1.4.7 / API 1.3.7
  failing with `right side of assignment cannot be destructed`.
- The issue comment by xt0rted identified two concrete old-mobile failure modes:
  unset values could surface as the literal string `"null"`, and Obsidian's
  legacy `frontmatter.position` data could leak into MetaEdit as a real property.
- PR #119 was merged on 2026-06-27 and removed raw frontmatter substring writes
  in favor of `processFrontMatter`.
- PR #136 was merged on 2026-06-28 and changed frontmatter reads to
  `getFrontMatterInfo(content)`, with a modern Obsidian runtime floor.
- Desktop/local isolated Obsidian E2E coverage exists for frontmatter reads and
  writes, but the iPhone result below is the mobile runtime proof.

## Harness Added

- `scripts/mobile/metaedit_ios.py`
- `scripts/mobile/metaedit_android.py`
- `scripts/mobile/README.md`
- `scripts/mobile/probes/issue99_frontmatter.js`
- `scripts/mobile/probes/core_smoke.js`

The iOS harness follows the `/Users/christian/Developer/safdeb` pattern:
House Arrest AFC for Obsidian's Documents container plus Web Inspector eval for
runtime state, plugin enable/reload, probes, and console/error streaming.

The deploy path requires `--confirm-real-vault`, creates a local backup of the
existing phone plugin folder before writing, byte-verifies pushed artifacts,
verifies the backup before writing, asserts that the AFC target vault matches the
vault open in Obsidian, and supports restore.

## iPhone Environment

- Device/runtime: iPhone WebView, `navigator.platform` = `iPhone`
- User agent: `Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148  obsidian`
- Obsidian iOS app: `1.13.1` build `339` (`md.obsidian`)
- `window.apiVersion`: `null`
- Vault: `notes`
- AFC vault path: `/Documents/notes`
- MetaEdit under test: local `1.8.4` build from this worktree
- Web Inspector target: `<Obsidian(15176) TYPE:WIRTypeWebPage URL:capacitor://localhost>`
- Pre-deploy phone state: MetaEdit installed but disabled, `manifest.json`
  `minAppVersion: 1.4.1`

## Snapshot And Deploy

Command:

```bash
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py deploy --vault notes --confirm-real-vault
```

Snapshot:

```text
~/.metaedit-mobile-backups/metaedit/<device>/notes/20260628T160849Z
```

The snapshot was created before any write to the phone and covered the existing
`/Documents/notes/.obsidian/plugins/metaedit` folder, including
`main.js`, `manifest.json`, `styles.css`, and `data.json`.

Deploy result:

- Target: `/Documents/notes/.obsidian/plugins/metaedit`
- `main.js`: 339923 bytes, SHA-256 verified
  `3f39253ca69b0f48f54dc0b530c14ea6c42ce20d8e9431e3d423de080afba35b`
- `manifest.json`: 253 bytes, SHA-256 verified
  `7f93db770dfb3385c28cac356edf355edad3f15807727afa9af2493458e1002e`
- `styles.css`: 1231 bytes, SHA-256 verified
  `1834d22e99ebedb9df5112e80bdcbe1e3afc324d6ad8d2e1c87b0f6b5702be29`
- `.hotreload`: 0 bytes, SHA-256 verified
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- Runtime after deploy: `enabled: true`, `instantiated: true`,
  `loadedVersion: 1.8.4`, `apiReady: true`

## Issue #99 Probe

Command:

```bash
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py eval --file scripts/mobile/probes/issue99_frontmatter.js
```

Result: `ok: true`.

Evidence returned by the probe:

- Scratch note:
  `MetaEdit Mobile Debug/issue-99-frontmatter.md`
- `mobile_status` read back as `updated-on-mobile`.
- `mobile_new` read back as `created-on-mobile`.
- `mobile_empty` read back as JavaScript `null`.
- `mobile_clear` read back as JavaScript `null`.
- Parsed MetaEdit property keys were `mobile_status`, `mobile_empty`,
  `mobile_keep`, `mobile_new`, `mobile_clear`, and `inline_mobile`.
- Raw note content contained no top-level `position:` line.
- Scratch note cleanup deleted
  `MetaEdit Mobile Debug/issue-99-frontmatter.md` without errors.

Verdict for #99 on this iPhone: the two reported mobile regressions did not
reproduce in the post-#119/#136 build. Blank/cleared YAML values did not become
the literal string `"null"`, and no `position` property appeared in MetaEdit's
parsed properties or the note text.

## Core Smoke Probe

Command:

```bash
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py eval --timeout 180 --file scripts/mobile/probes/core_smoke.js
```

Result: `ok: true`.

Evidence returned by the probe:

- Scratch root:
  `MetaEdit Mobile Debug/core-smoke-20260628160922`
- Edit Meta listed `status` and `inline_status`.
- Inline field content became `inline_status:: published`.
- Auto Properties wrote `ap_status: done`.
- Progress Properties wrote `readProgress: "2"` and left the matching body text
  `readProgress: 0` unchanged.
- Kanban helper changed the linked note to `status: In Progress`.
- Scratch file cleanup deleted all created smoke files without errors.

The approved run used a unique `core-smoke-<timestamp>` folder. That matters
because MetaEdit's automator manager caches the last content by file path;
rerunning the Kanban smoke against the same path and identical board content can
correctly suppress a duplicate modify event. After the approved run, the
committed probe was hardened further to use a unique Kanban board basename too,
so the temporary automator cannot match an existing board name in the real vault
during the test window.

## Console Check

Commands:

```bash
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py eval '(()=>{console.clear(); return "cleared";})()'
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py logs --seconds 10
```

Fresh post-probe result: no console errors or uncaught errors streamed.

## Restore

Command:

```bash
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py restore --backup ~/.metaedit-mobile-backups/metaedit/<device>/notes/20260628T160849Z
```

Restore result:

- `/Documents/notes/.obsidian/plugins/metaedit` restored from the local backup.
- MetaEdit enabled state restored to disabled.
- Final diagnosis showed `enabled: false`, `instantiated: false`,
  `loadedVersion: null`, `apiReady: false`, and plugin files `styles.css`,
  `data.json`, `main.js`, `manifest.json`.
- Final diagnosis showed `manifest.json` metadata back to `minAppVersion: 1.4.1`
  and no `.hotreload` file.

## Android

Android is secondary for this investigation and was not run in this session. The
Android harness is committed for a future pass where `adb`, an emulator/device,
and an open disposable scratch Obsidian vault are available. Android deploy has
no backup/restore path, so it requires an explicit scratch-vault confirmation:

```bash
uv run --no-project --with websockets python scripts/mobile/metaedit_android.py diagnose
uv run --no-project --with websockets python scripts/mobile/metaedit_android.py deploy --confirm-scratch-vault
uv run --no-project --with websockets python scripts/mobile/metaedit_android.py eval --file scripts/mobile/probes/issue99_frontmatter.js
uv run --no-project --with websockets python scripts/mobile/metaedit_android.py eval --file scripts/mobile/probes/core_smoke.js
```

## Conclusion

On the approved real iPhone run, issue #99's two reported failure modes are
fixed/not reproducible in the post-#119/#136 build. The run exercises the current
read/write paths introduced by #119/#136 and found no real iOS product bug
requiring a root-cause code fix. It does not prove a same-runtime before/after
against the original Obsidian iOS 1.4.7 / API 1.3.7 environment.

Christian should decide whether and when to close #99. No issue comments or
closures were made by this investigation.
