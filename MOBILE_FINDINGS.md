# MetaEdit Mobile Findings

Status: Android emulator verification passed; iPhone verification pending.

## Scope

This investigation starts from issue #99, where MetaEdit failed on Obsidian
mobile because desktop exposed newer frontmatter range APIs while mobile still
surfaced the older `frontmatter.position` shape. PR #119 replaced YAML writes
with `app.fileManager.processFrontMatter`, and PR #136 moved frontmatter reads to
Obsidian's `getFrontMatterInfo(content)`. Those changes are plausible root fixes,
but they are not a mobile verdict until the probes below pass on a real device.

## Current Evidence

- Issue #99 remains open and describes Obsidian iOS TestFlight 1.4.7 / API 1.3.7
  failing with `right side of assignment cannot be destructed`.
- The issue comment by xt0rted identified two concrete old-mobile failure modes:
  unset values could surface as the literal string `"null"`, and Obsidian's
  legacy `frontmatter.position` data could leak into MetaEdit as a real property.
- PR #119 was merged on 2026-06-27 and removed raw frontmatter substring writes in
  favor of `processFrontMatter`.
- PR #136 was merged on 2026-06-28 and changed frontmatter reads to
  `getFrontMatterInfo(content)`, with a modern Obsidian runtime floor.
- Desktop/local isolated Obsidian E2E coverage exists for frontmatter reads and
  writes, but that does not prove the behavior inside Obsidian iOS.
- Android emulator verification on 2026-06-28 passed the issue #99 probe and the
  broader core smoke probe using Obsidian Android 1.12.7 and MetaEdit 1.8.4.

## Harness Added

- `scripts/mobile/metaedit_ios.py`
- `scripts/mobile/metaedit_android.py`
- `scripts/mobile/README.md`
- `scripts/mobile/probes/issue99_frontmatter.js`
- `scripts/mobile/probes/core_smoke.js`

The harness deploy path requires `--confirm-real-vault`, creates a local backup
of the existing phone plugin folder before writing, byte-verifies pushed
artifacts, verifies the backup before writing, asserts that the AFC target vault
matches the vault open in Obsidian, and supports restore.

## Planned On-Device Commands

Prerequisites:

```bash
pnpm run build
```

Read-only diagnosis first:

```bash
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py diagnose
```

After Christian explicitly approves deployment to the real `notes` vault:

```bash
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py deploy --confirm-real-vault
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py eval --file scripts/mobile/probes/issue99_frontmatter.js
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py eval --file scripts/mobile/probes/core_smoke.js
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py logs --seconds 60
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py restore
```

## Android Emulator Result

Environment:

- Emulator: `MetaEditMobileApi35`
- Android: 15 / SDK 35
- Device model: `sdk_gphone64_arm64`
- ABI: `arm64-v8a`
- WebView user agent: Chrome/124 Android WebView
- Obsidian APK: official `Obsidian-1.12.7.apk`
- Vault: `/sdcard/Documents/MetaEditMobile`
- MetaEdit: local 1.8.4 build from this worktree

Setup summary:

```bash
brew install android-platform-tools android-commandlinetools
yes | ANDROID_HOME=/opt/homebrew/share/android-commandlinetools sdkmanager --licenses
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools sdkmanager \
  "emulator" \
  "platform-tools" \
  "platforms;android-35" \
  "system-images;android-35;google_apis;arm64-v8a"
printf 'no\n' | ANDROID_HOME=/opt/homebrew/share/android-commandlinetools avdmanager create avd \
  --force \
  --name MetaEditMobileApi35 \
  --package "system-images;android-35;google_apis;arm64-v8a" \
  --device pixel_7
```

Commands run against the booted emulator:

```bash
uv run --no-project --with websockets python scripts/mobile/metaedit_android.py diagnose
uv run --no-project --with websockets python scripts/mobile/metaedit_android.py deploy
uv run --no-project --with websockets python scripts/mobile/metaedit_android.py eval --file scripts/mobile/probes/issue99_frontmatter.js
uv run --no-project --with websockets python scripts/mobile/metaedit_android.py eval --file scripts/mobile/probes/core_smoke.js
```

Issue #99 probe result: `ok: true`.

- `mobile_status` read back as `updated-on-mobile`.
- `mobile_new` read back as `created-on-mobile`.
- `mobile_empty` read back as `null`.
- `mobile_clear` read back as `null`.
- Parsed property keys were `mobile_status`, `mobile_empty`, `mobile_keep`,
  `mobile_new`, `mobile_clear`, and `inline_mobile`.
- Raw note content had no top-level `position:` line.
- Scratch note cleanup deleted
  `MetaEdit Mobile Debug/issue-99-frontmatter.md` without errors.

Core smoke result: `ok: true`.

- Edit Meta listed `status` and `inline_status`.
- Inline field content became `inline_status:: published`.
- Auto Properties wrote `ap_status: done`.
- Progress Properties wrote `readProgress: "2"` and left the matching body text
  `readProgress: 0` unchanged.
- Kanban helper changed the linked note to `status: In Progress`.
- Scratch file cleanup deleted all created smoke files without errors.

Log check:

- `adb logcat -d -t 1000` filtered for Obsidian/WebView/fatal/crash/exception
  showed no MetaEdit or Obsidian fatal errors. The remaining lines were expected
  IME, frame timing, media scanner, and MediaProvider cleanup noise.

## Issue #99 Verdict Criteria

Fixed on real mobile only if `issue99_frontmatter.js` returns `ok: true` on an
actual iPhone after deploying the local MetaEdit build. The returned evidence
must show:

- `mobile_status` changes from `initial` to `updated-on-mobile`;
- `mobile_new` reads back as `created-on-mobile`;
- `mobile_empty` and `mobile_clear` read back as JavaScript `null`, not `"null"`;
- no `position` key exists in MetaEdit parsed property keys;
- the raw scratch note does not contain a top-level `position:` line.

The probe reports Obsidian's raw frontmatter cache keys as diagnostics, but does
not fail solely because old mobile exposes an internal cache key named
`position`. The failure is MetaEdit surfacing that key to users or writing it
into the note.

The scratch note is deleted after the probe collects the evidence returned in
JSON.

## Broader Smoke Criteria

Mobile smoke is clean only if `core_smoke.js` returns `ok: true`, covering:

- Edit Meta menu lists a YAML field and an inline field;
- public API updates an inline `key:: value` field;
- Auto Properties value prompt writes a selected value;
- Progress Properties update YAML while leaving matching body text unchanged;
- Kanban helper updates a linked card note after a lane move.

The smoke probe keeps settings mutations in memory, restores the in-memory
settings snapshot in `finally`, and deletes the scratch files it created after
collecting evidence.

## Pending iPhone Verification

Do not deploy or run the write probes on an iPhone until Christian connects it
and gives explicit per-session approval to touch the real `notes` vault.
