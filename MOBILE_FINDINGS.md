# MetaEdit Mobile Findings

Status: device-independent setup complete; real-device verification pending.

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

## Harness Added

- `scripts/mobile/metaedit_ios.py`
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

## Pending

No iPhone is currently connected over USB, and Android tooling is not installed
on this Mac. Do not deploy or run the write probes until Christian connects the
iPhone and gives explicit per-session approval to touch the real `notes` vault.
