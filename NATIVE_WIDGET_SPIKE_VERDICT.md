# Native Widget Spike Verdict

Status: decision spike complete. No PR, GitHub issue comment, or production
implementation is part of this artifact.

## Up-Front Decision Rule

Recommend **GO-NATIVE** only if all of the following hold under live runtime
evidence:

- Full `mount -> edit -> clear -> close -> reopen -> write via
  app.fileManager.processFrontMatter -> metadata cache re-read` roundtrip is
  clean for all core types: text, multitext, number, checkbox, date, datetime,
  tags, and aliases.
- Lifecycle cleanup is achievable by MetaEdit owning and removing the host
  container, with no measured orphaned suggesters, hover popovers, modal DOM, or
  document/listener growth after close.
- Mixed-array and value-fidelity cases are safe as-is or safely guardable:
  mixed YAML arrays, wikilinks containing commas, `0`, `false`, `""`, `null`,
  datetime seconds, tag leading-`#` handling, duplicate values, and ordering.
- Silent `onChange` drift is detectable enough for a production guard; a widget
  that renders but stops emitting changes must not silently save stale values.
- The real Obsidian version floor for `registeredTypeWidgets` plus
  `render(container, value, ctx)` is acceptable for MetaEdit, and any
  `minAppVersion` raise is explicit.
- Mobile plugin-modal mounting is at least non-broken for multitext, date, and
  checkbox.

Recommend **DISCARD -> build-first** if any hard kill criterion fails or cannot
be proven well enough for production. Recommend **PARTIAL** only if the evidence
identifies exact native-safe types and exact MetaEdit-owned fallback types.

## Baseline

- Worktree: `/Users/christian/orca/workspaces/MetaEdit/typed-props-native-spike`
- Branch: `chhoumann/typed-props-native-spike`
- Base: `origin/master` at `c00795e15fdd4b32ad3996458f346506861f95dd`
- Prior design read completely:
  `/Users/christian/orca/workspaces/MetaEdit/typed-props-design/TYPED_PROPERTIES_DESIGN.md`
- Prior design result: native desktop rendering and `onChange` were already
  proven on Obsidian 1.12.7, but production roundtrip, cleanup, version floor,
  silent drift, and mobile remained unproven.

## Desktop Runtime Evidence

Harness:

- Command: `pnpm run build`
- Command:
  `pnpm run obsidian:e2e -- eval code="$(< .obsidian-e2e-artifacts/native-widget-spike/desktop-probe.js)"`
- Follow-up lifecycle/drift command:
  `pnpm run obsidian:e2e -- eval code="$(< .obsidian-e2e-artifacts/native-widget-spike/desktop-followup.js)"`
- Vault:
  `/Users/christian/orca/workspaces/MetaEdit/typed-props-native-spike/.obsidian-e2e-vaults/metaedit-typed-props-native-spike`
- Runtime:
  `obsidian/1.12.7`, Chrome `142.0.7444.265`, Electron `39.8.3`
- MetaEdit: loaded, version `1.8.4`
- Registry: `registeredTypeWidgets` present with
  `aliases`, `checkbox`, `date`, `datetime`, `file`, `folder`,
  `multitext`, `property`, `number`, `tags`, `text`
- All tested widget `render.length` values were `3`; all tested
  `validate.length` values were `1`.
- `pnpm run obsidian:e2e -- dev:errors` after probing:
  `No errors captured.`

The POC mounted each widget in a modal-shaped host, drove real DOM events, wrote
the last `onChange` value through `app.fileManager.processFrontMatter`, waited
for `metadataCache.getFileCache(file).frontmatter[key]`, and reopened the widget
against the cache value.

## Per-Type Roundtrip Results

| Type | Result | Evidence |
| --- | --- | --- |
| `text` | Pass for basic value loop; lifecycle not a hard blocker. | Edit emitted `"changed text"` and raw YAML became `text: changed text`; clear emitted `""` and raw YAML became `text: ""`; cache matched both. First broad run briefly saw one `.suggestion-container` / `document:scroll` listener at 120 ms after close, but the focused follow-up ended at body delta `0`, orphan delta `0`, active global listeners `0` after 1.35 s. |
| `multitext` | **Fail.** | Clear emitted `[]` and wrote `multitext: []`, but adding `[[A, B]]` in the desktop modal left the value in `.multi-select-input` and emitted no `onChange`; cache stayed `["alpha", "beta"]`. Mixed-array test emitted `["1", "two", "[[A, B]]", "[[A, B]]"]` from initial `[1, "two", "[[A, B]]"]`, stringifying `1` and duplicating the wikilink item. |
| `number` | Pass for event/write loop; clear semantics still product-sensitive. | Edit emitted `0`, cache read `0`, raw YAML `number: 0`. Clear emitted `null`, cache read `null`, raw YAML serialized as blank `number:`. |
| `checkbox` | Pass. | Edit emitted `false`, cache read `false`, raw YAML `checkbox: false`. Clear-equivalent stayed `false`; there is no null/empty checkbox state. |
| `date` | Pass. | Edit emitted `"2026-08-03"`, cache matched, raw YAML `date: 2026-08-03`. Clear emitted `""`, cache matched, raw YAML `date: ""`. |
| `datetime` | Pass. | Edit emitted `"2026-08-03T12:34:56"`, preserving seconds; cache matched and raw YAML kept `datetime: 2026-08-03T12:34:56`. Clear emitted `""`, cache matched. |
| `tags` | **Fail.** | Adding `#area/next` emitted `["area/test", "dup", "dup", "#area/next"]`; raw YAML stored `"#area/next"` with the leading hash. Reopen displayed the pill as `area/next`, hiding that stored mismatch. Clear emitted `[]` and wrote `tags: []`, not MetaEdit's current delete-on-empty behavior. |
| `aliases` | Pass for tested values. | Edit emitted `["Alias, One", "[[A, B]]", "Next, Alias"]`; cache and raw YAML preserved commas and the wikilink as single list items. Clear emitted `[]` and wrote `aliases: []`. |

## Kill Criteria

| Criterion | Result | Proof |
| --- | --- | --- |
| Full roundtrip all core types | **Fail.** | `multitext` did not emit `onChange` for desktop add of `[[A, B]]`; `tags` stored a leading `#`; mixed array was corrupted. |
| Lifecycle/leak | Pass with caveats. | Widget instances exposed no public `dispose`, `destroy`, or `unload`. Host removal plus wait left body child delta `0`, orphan delta `0`, and active global listeners `0` in focused text/tags/aliases follow-up. The first broad run observed transient suggester/listener state shortly after close, so cleanup is containable but not contractually owned. |
| Mixed-array safety | **Fail.** | Native `multitext` roundtrip from `[1, "two", "[[A, B]]"]` emitted and stored `["1", "two", "[[A, B]]", "[[A, B]]"]`. |
| Value fidelity | **Fail overall.** | `0`, `false`, `""`, `null`, aliases with commas, and datetime seconds survived. Tags failed leading-`#` canonicalization; native multitext failed the wikilink-with-comma add path and corrupted mixed arrays. |
| Silent `onChange` drift | **Fail as a production foundation.** | A wrapper can observe DOM `input`/`change` activity and fail closed when no `onChange` arrives, but it cannot generically recover the edited value or detect wrong-shape `onChange` values without per-type readers and validators. That is no longer a simple native foundation; it is a second editor implementation boundary. |
| Version floor | **Fail for current floor.** | See below. Raw-value `render(container, value, ctx)` is not proven until Obsidian `1.9.10`; MetaEdit currently declares `minAppVersion: "1.5.7"`. |
| Mobile | Pass for requested smoke only. | Android emulator smoke mounted `multitext`, `date`, and `checkbox` inside a MetaEdit modal; all rendered, had hittable boxes, emitted changes, and produced no JS errors. This does not rescue the desktop/data-contract failures. |

## Version Floor

Current MetaEdit state:

- `manifest.json` declares `minAppVersion: "1.5.7"`.
- `versions.json` maps the upcoming `1.9.0` release line to Obsidian `1.5.7`.
- Public typings are `obsidian@1.13.1`, but they still do not expose
  `app.metadataTypeManager` or `registeredTypeWidgets`.
- Official API changelog says `getFrontMatterInfo` was added in `v1.5.7`; the
  public API changelog's `v1.4.0` section covers Properties metadata/cache
  changes, not a public typed widget contract:
  https://raw.githubusercontent.com/obsidianmd/obsidian-api/master/CHANGELOG.md
- Obsidian's public `1.4 Desktop` changelog says Properties became public on
  August 31, 2023, with typed property values stored as YAML frontmatter:
  https://obsidian.md/changelog/2023-08-31-desktop-v1.4.5/

Static inspection of official desktop release ASAR assets:

```text
1.5.8: registeredTypeWidgets FOUND; .render(this.valueEl,this.entry, ...) FOUND; .entry.value missing
1.8.10: registeredTypeWidgets FOUND; .render(this.valueEl,this.entry, ...) FOUND; .entry.value missing
1.9.10: registeredTypeWidgets FOUND; .render(this.valueEl,this.entry.value, ...) FOUND; .entry object call missing
```

Commands used:

```bash
curl -fL -o obsidian-1.5.8.asar.gz https://github.com/obsidianmd/obsidian-releases/releases/download/v1.5.8/obsidian-1.5.8.asar.gz
curl -fL -o obsidian-1.8.10.asar.gz https://github.com/obsidianmd/obsidian-releases/releases/download/v1.8.10/obsidian-1.8.10.asar.gz
curl -fL -o obsidian-1.9.10.asar.gz https://github.com/obsidianmd/obsidian-releases/releases/download/v1.9.10/obsidian-1.9.10.asar.gz
```

Release dates from `gh release view obsidianmd/obsidian-releases`:

- `v1.5.8`: 2024-02-22
- `v1.8.10`: 2025-04-22
- `v1.9.10`: 2025-08-18,
  https://github.com/obsidianmd/obsidian-releases/releases/tag/v1.9.10

Conclusion: the simple raw-value adapter proven on Obsidian `1.12.7` requires a
real floor of at least `1.9.10`, unless MetaEdit supports both internal second
argument shapes. I found no official public user-share-by-Obsidian-version data,
so the excluded share cannot be honestly quantified. Raising from `1.5.7` to
`1.9.10` would exclude users pinned to Obsidian releases before August 18, 2025;
the share is likely small but non-zero and must not be guessed as zero.

## Mobile Result

Harness:

- Android emulator: `MetaEditMobileApi35`, Android `15`, `1080x2400`
- Obsidian package: `md.obsidian`
- Scratch vault: `/storage/emulated/0/Documents/MetaEditMobile`
- Deploy command:
  `uv run --no-project --with websockets python scripts/mobile/metaedit_android.py deploy --vault-path /storage/emulated/0/Documents/MetaEditMobile --confirm-scratch-vault`
- Smoke command:
  `uv run --no-project --with websockets python scripts/mobile/metaedit_android.py eval --timeout 180 --file .obsidian-e2e-artifacts/native-widget-spike/mobile-smoke.js`
- Post-smoke diagnose: `loadedVersion: "1.8.4"`, `apiReady: true`

Mobile smoke result:

```json
{
  "ok": true,
  "runtime": {
    "userAgent": "Mozilla/5.0 (Linux; Android 15; sdk_gphone64_arm64 Build/AE3A.240806.043; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.219 Mobile Safari/537.36",
    "vault": "MetaEditMobile",
    "pluginVersion": "1.8.4",
    "apiReady": true
  },
  "widgets": {
    "multitext": {"rendered": true, "touchTarget": true, "changes": [["alpha", "beta", "gamma"]]},
    "date": {"rendered": true, "touchTarget": true, "changes": ["2026-08-03"]},
    "checkbox": {"rendered": true, "touchTarget": true, "changes": [true]}
  },
  "errors": []
}
```

Logcat during the smoke contained IME/frame warnings but no fatal/crash lines.
This proves the requested Android mobile smoke is non-broken for those three
widgets. It is still a CDP DOM-event smoke, not a full physical-touch Appium
test and not a production MetaEdit code path.

## Adversarial Review

Method:

- Required opposite-model review was run with `claude -p`.
- Review directory: `/tmp/native-widget-adversarial.Balqyp`
- `architect.md` and `minimalist.md` completed with substantive findings.
- Two `skeptic` attempts stalled/returned only `Execution error`; this is
  recorded as an incomplete reviewer, not silently counted as approval.
- The installed adversarial-review skill referenced a missing
  `brain/principles.md`; the available reviewer lenses were used.

Reviewer verdict:

- Both completed reviewers contested the draft's initial **DISCARD** framing.
- They argued the evidence satisfies the document's own **PARTIAL** branch:
  native-safe evidence exists for `text`, `number`, `checkbox`, `date`,
  `datetime`, and `aliases`, while `multitext` and `tags` have concrete failure
  evidence.
- They also argued some failures in the raw POC are adapter-boundary issues, not
  necessarily intrinsic widget defects: tag `#` stripping, empty-list deletion,
  and old/new render-argument support could be normalized by MetaEdit.
- They accepted the strongest structural risk: the widget API is private,
  untyped, and demonstrably drifted between Obsidian releases.

Lead judgment:

- Accepted: the initial all-or-nothing **DISCARD** conclusion was too broad.
  The evidence is a better fit for **PARTIAL**.
- Accepted: the version finding should be framed precisely as "raw-value-only
  adapter requires at least `1.9.10`; a dual-shape adapter would be required to
  keep the `1.5.7` floor." The spike did not runtime-prove that dual-shape
  adapter.
- Accepted: mobile is not a kill criterion for the requested smoke; it passed.
- Rejected: native `multitext` should not be treated as production-safe. Even if
  the no-`onChange` add case is partly a synthetic-event artifact, the mixed
  array result shows native `multitext` is unsafe as MetaEdit's list foundation
  without MetaEdit-owned reconstruction. At that point the owned list editor is
  the production path.
- Rejected: native `tags` should ship with "trivial" normalization now. The
  spike proved the native callback can emit a value that is misleadingly
  displayed differently on reopen (`"#area/next"` stored, `area/next` shown),
  and empty tag semantics differ from MetaEdit's current behavior. Tags should
  stay MetaEdit-owned until a dedicated tag normalizer is built and tested.

## Final Verdict

**VERDICT: PARTIAL.**

Do **not** use Obsidian native widgets as the full production foundation for
MetaEdit typed-property editors.

Native widgets are production-candidates only for this exact subset, after a
small guarded adapter is built and tested:

- `text`
- `number`
- `checkbox`
- `date`
- `datetime`
- `aliases`

MetaEdit should build/own these editors first:

- `multitext` / ordinary YAML lists
- `tags`
- mixed arrays, regardless of assigned Obsidian type

Conditions before shipping any native subset:

- Either raise the Obsidian floor to at least `1.9.10` or implement and runtime
  test a dual-shape adapter for old `render(container, entry, ctx)` and new
  `render(container, entry.value, ctx)` contracts.
- Fail closed if DOM edit activity occurs without `onChange`.
- Validate per-type callback shapes before writing.
- Keep MetaEdit-owned fallbacks for every native type because the API is
  private and absent from public typings.

Short form: **PARTIAL: native scalars + aliases are viable candidates; build
MetaEdit-owned list/tags editors first.**
