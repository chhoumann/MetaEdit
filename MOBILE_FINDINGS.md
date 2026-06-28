# MetaEdit Mobile Findings

Status: harness and repro probes prepared; real-device verification pending.

## Scope

This investigation starts from issue #99, where MetaEdit failed on Obsidian
mobile because desktop exposed newer frontmatter range APIs while mobile still
surfaced the older `frontmatter.position` shape. PR #119 replaced YAML writes
with `app.fileManager.processFrontMatter`, and PR #136 moved frontmatter reads to
Obsidian's `getFrontMatterInfo(content)`. Those changes are plausible root
fixes, but they are not a real-mobile verdict until the probes below pass on an
actual device.

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
  writes, but that does not prove the behavior inside Obsidian iOS or Android.

## Harness Added

- `scripts/mobile/metaedit_ios.py`
- `scripts/mobile/metaedit_android.py`
- `scripts/mobile/README.md`
- `scripts/mobile/probes/issue99_frontmatter.js`
- `scripts/mobile/probes/core_smoke.js`

The iOS deploy path requires `--confirm-real-vault`, creates a local backup of
the existing phone plugin folder before writing, byte-verifies pushed artifacts,
verifies the backup before writing, asserts that the AFC target vault matches the
vault open in Obsidian, and supports restore.

## Device-Independent Repro Plan

Build the local plugin artifacts first:

```bash
pnpm run build
```

The issue #99 probe is committed at
`scripts/mobile/probes/issue99_frontmatter.js`. It creates a scratch note named:

```text
MetaEdit Mobile Debug/issue-99-frontmatter.md
```

The scratch note begins with YAML frontmatter that includes:

```yaml
mobile_status: initial
mobile_empty:
mobile_keep: stay
```

The probe then runs these MetaEdit API operations inside Obsidian mobile:

- read `mobile_empty`;
- create `mobile_new` with value `created-on-mobile`;
- update `mobile_status` to `updated-on-mobile`;
- create `mobile_clear` and then set it to JavaScript `null`;
- read all values back through MetaEdit;
- inspect MetaEdit's parsed property keys;
- read the raw note content.

The probe fails if any of the two issue #99 mobile regressions appear:

- `mobile_empty` or `mobile_clear` read back as the literal string `"null"`
  instead of JavaScript `null`;
- MetaEdit exposes `position` as a parsed property key or writes a top-level
  `position:` line into the note.

It also fails if the normal read/write assertions do not hold:

- `mobile_status` must read back as `updated-on-mobile`;
- `mobile_new` must read back as `created-on-mobile`;
- `mobile_keep` must remain `stay`.

Obsidian's raw frontmatter cache keys are returned only as diagnostics because
older mobile APIs may keep an internal cache key named `position`. The failure is
MetaEdit surfacing that key to users or writing it into the note.

The scratch note is deleted after the probe collects the evidence returned in
JSON.

## Core Smoke Plan

The broader smoke probe is committed at
`scripts/mobile/probes/core_smoke.js`. It creates scratch files under:

```text
MetaEdit Mobile Debug/core-smoke/
```

It checks:

- the Edit Meta command opens and lists YAML and inline fields;
- an inline `key:: value` field updates through the public API;
- the Auto Properties value prompt opens and writes a selected value;
- Progress Properties update YAML without rewriting matching body text;
- the Kanban helper updates a linked note when a card moves lanes.

The smoke probe keeps settings mutations in memory, restores the in-memory
settings snapshot in `finally`, and deletes the scratch files it created after
collecting evidence.

## Planned iPhone Commands

Prerequisites:

- iPhone connected over USB, unlocked, and trusted by this Mac.
- Obsidian open on the phone.
- Settings > Apps > Safari > Advanced > Web Inspector enabled.
- A clearly named scratch vault is open on the phone when possible.
- Christian explicitly approves the vault target for this session.

Read-only diagnosis first:

```bash
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py diagnose --vault MetaEditMobileScratch
```

After Christian explicitly approves deployment to that target vault:

```bash
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py deploy --vault MetaEditMobileScratch --confirm-real-vault
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py eval --file scripts/mobile/probes/issue99_frontmatter.js
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py eval --file scripts/mobile/probes/core_smoke.js
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py logs --seconds 60
uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py restore
```

If no scratch vault is available and Christian approves using the primary
`notes` vault instead, omit `--vault MetaEditMobileScratch`. That path still
snapshots and restores the real `notes/.obsidian/plugins/metaedit` folder.

## Planned Android Commands

Android is secondary for this investigation. The Android harness requires `adb`,
an Android emulator or device, Obsidian running, and a scratch vault open.

```bash
uv run --no-project --with websockets python scripts/mobile/metaedit_android.py diagnose
uv run --no-project --with websockets python scripts/mobile/metaedit_android.py deploy
uv run --no-project --with websockets python scripts/mobile/metaedit_android.py eval --file scripts/mobile/probes/issue99_frontmatter.js
uv run --no-project --with websockets python scripts/mobile/metaedit_android.py eval --file scripts/mobile/probes/core_smoke.js
```

## Verdict Criteria

Issue #99 is fixed on real mobile only if `issue99_frontmatter.js` returns
`ok: true` on an actual iPhone or Android device/emulator after deploying the
local MetaEdit build.

The broader mobile smoke test is clean only if `core_smoke.js` returns `ok: true`
on the same mobile runtime.

Until that happens, this report deliberately does not conclude that #99 is fixed
on real mobile.

## Pending iPhone Verification

Do not deploy or run the write probes on an iPhone until Christian connects it
and gives explicit per-session approval to touch the target vault. The harness
will snapshot and restore the target vault's real `metaedit` plugin folder
around the test.
