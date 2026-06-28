# Unified Tag Editing - Design Spike

Status: Draft for review (design spike, no implementation). Adversarially reviewed.
Prompted by: issue #49 ("How to use this new feature 'Edit last value in tags'?")
Base: `origin/master`
Runtime verified against: Obsidian 1.12.7 (isolated E2E vault), current build.
Author: design spike, 2026-06-28

---

## 1. TL;DR and recommendation

MetaEdit's tag editing today operates on **body `#tags` only**, through a path
(`editTag` -> `updatePropertyLine`) that is undocumented, originally built around
the Tracker plugin, and carries **five confirmed defects** - including silent
data loss, a session-wide state leak, and an edit path that cannot tell two
identical tags apart. Issue #49 was two users who could not figure out what the
feature does; that is a symptom of the feature being both confusing and partly
broken, not evidence of demand for *more* tag features.

Modern Obsidian (verified 1.12.7) already does the two things users most want:
the native **Properties** UI edits frontmatter `tags:` with a typed tag widget
(pills, autocomplete, add/remove), and the native **Tag pane** renames a tag
vault-wide across body *and* frontmatter. MetaEdit re-implementing either would
duplicate a better-integrated native feature.

So the honest recommendation is a choice between three scoped options, not a
binary "build the unification or not" (Section 11). The recommended path:

1. **Decide the tag-operation semantics first** (rename vs append-leaf; one
   occurrence vs all) - because the correctness fix depends on it (Section 9).
2. **Fix the correctness defects** (Section 4) and **canonicalize frontmatter
   tag input** (Section 6.3). This is the high-value real work and directly
   addresses #49 by making the feature behave sanely.
3. **Treat any cross-location unification as a model-layer concern, on demand**
   (Section 6, Section 11) - never a UI-only grouping, and only if users ask for
   single-note, all-homes tag operations.

A credible **smaller** option also exists and is now first-class: **remove or
default-hide body-tag editing** and lean entirely on native Obsidian
(Section 11, Option A). The decisions Christian needs to make are in Section 12.

---

## 2. Issue #49 in context

> "I see on the release notes that you added 'Edit last value in tags' but I
> cannot see how to do it. An example would be nice."

Two users could not discover or understand the feature. The eventual answer
(forum + the close comment) was: it checks for the Tracker plugin, then lets you
choose Tracker or MetaEdit before replacing the final tag segment
(`src/metaController.ts:124-153`). That is an accurate description of the code -
and it confirms the feature is opaque. The discoverability problem is real, and
underneath it the feature is also defective (Section 4).

The framing for this spike: "there's clearly behavior expected re. tags being
able to be both in the note body and YAML frontmatter." That is true - but the
gap is mostly **correctness and clarity**, not a missing unification layer.

---

## 3. How tag editing works today (precise map)

### 3.1 Two disconnected data sources

`getPropertiesInFile` concatenates three independently-parsed sources
(`src/metaController.ts:39-45`):

```ts
const yaml = await this.parser.parseFrontmatter(file);
const inlineFields = await this.parser.parseInlineFields(file);
const tags = await this.parser.getTagsForFile(file);
return [...tags, ...yaml, ...inlineFields];
```

- `getTagsForFile` reads **`cache.tags`** and emits `MetaType.Tag` entries -
  **discarding `TagCache.position`**, keeping only `{key, content, type}`
  (`src/parser.ts:49-58`). This dropped position is the root of BUG-3.
- `parseFrontmatter` reads frontmatter and emits `MetaType.YAML` entries
  (`src/parser.ts:60-65`), so a frontmatter `tags:` list becomes
  `{key: "tags", content: [...], type: MetaType.YAML}`.

**`cache.tags` contains body tags only.** Verified live for a note with
`tags: [alpha, nested/beta]` in frontmatter and `#gamma #delta` (mid-line) plus
`#epsilon` (line start) in the body:

```jsonc
// app.metadataCache.getFileCache(file)
"cacheTags":   [ {"tag":"#gamma","line":7}, {"tag":"#delta","line":7}, {"tag":"#epsilon","line":8} ],
"frontmatter": { "tags": ["alpha","nested/beta"], "status":"open" }
```

So the two homes never meet in MetaEdit's model:

| Tag location          | Parsed by          | Property.type     | Edited by                         |
|-----------------------|--------------------|-------------------|-----------------------------------|
| Body `#tag`           | `getTagsForFile`   | `MetaType.Tag`    | `editTag` -> `updatePropertyLine` |
| Frontmatter `tags:`   | `parseFrontmatter` | `MetaType.YAML`   | generic YAML / multi-value editor |

A frontmatter `tags:` key is just another YAML property to MetaEdit - no `#`
handling, no nested-segment logic, no dedupe with body tags. This sameness is
also relied upon deliberately: `hideFileTags` removes body `MetaType.Tag` entries
but **keeps** the frontmatter `tags:` key editable (`src/Modals/menuFilter.ts:26`,
`:30-39`).

### 3.2 The body-tag edit flow

`editMetaElement` routes `MetaType.Tag` to `editTag`
(`src/metaController.ts:96-100`). `editTag` (`src/metaController.ts:124-153`):

1. Splits the tag on `/`; `allButLast` = everything before the last segment.
2. If the Tracker plugin is installed, asks "Use Tracker" vs "Use MetaEdit"
   (`:131-132`).
3. On "Use Tracker": prompts for a value and **sets `this.useTrackerPlugin =
   true`** (`:136-138`).
4. On "Use MetaEdit": if an Auto Property is configured for `allButLast`, runs
   it; otherwise free-text prompt (`:139-147`).
5. Writes via `updatePropertyFromUi` -> `updatePropertyInFile` ->
   `updatePropertyLine`.

`updatePropertyLine` for `MetaType.Tag` (`src/metaController.ts:434-447`):

```ts
case MetaType.Tag:
    if (this.useTrackerPlugin) {
        newLine = `${property.key}:${newValue}`;            // Tracker: #tag:value
    } else {
        const splitTag = property.key.split("/");
        if (splitTag.length === 1)
            newLine = `${splitTag[0]}/${newValue}`;          // #foo  -> #foo/value (append leaf)
        else if (splitTag.length > 1) {
            const allButLast = splitTag.slice(0, -1).join("/");
            newLine = `${allButLast}/${newValue}`;           // #a/b  -> #a/value (replace leaf)
        } else newLine = property.key;
    }
```

The matched line is **replaced wholesale** with `newLine`
(`src/metaController.ts:390-396`):

```ts
const newFileContent = fileContent.split("\n").map(line => {
    if (this.lineMatch(property, line)) return this.updatePropertyLine(property, newValue, line);
    return line;
}).join("\n");
```

The same `updatePropertyLine` is also reached from `updateMultipleInFile`
(`src/metaController.ts:477-481`); any fix to the Tracker flag must account for
every caller (Section 4, BUG-1).

### 3.3 Line matching (`lineMatch`, `src/metaController.ts:406-421`)

```ts
const tagRegex = new RegExp(`^\s*${this.escapeSpecialCharacters(property.key)}`);
if (property.key.contains('#')) return tagRegex.test(line);
```

The template literal `` `^\s*...` `` does **not** mean "start, optional
whitespace." In a JS string/template literal `\s` is an unknown escape and
collapses to the literal character `s`, so the compiled source is `^s*\#tag`
(verified). Effects:

| Line                      | `^s*\#gamma` (actual) | `^\s*\#gamma` (intended) |
|---------------------------|-----------------------|--------------------------|
| `#gamma at start`         | matches               | matches                  |
| `  #gamma` (indented)     | **no match**          | matches                  |
| `- #gamma` (list item)    | **no match**          | no match (line-start only)|
| `text #gamma` (mid-line)  | **no match**          | no match (line-start only)|
| `s#gamma`, `ss#gamma`     | **matches (false +)** | no match                 |

So tags are only rewritten at an unindented line start, and the broken `s*` even
introduces a false-positive on lines that begin with literal `s` characters
before the tag. (The same broken `\s` appears at `deleteProperty`,
`src/metaController.ts:203`; the correctly-escaped `\\s` is used at `:419` for
non-tag properties.)

### 3.4 What MetaEdit does with frontmatter tags today

Nothing tag-specific. A `tags:` list is a `MetaType.YAML` property; because its
content is an array, `shouldUseMultiValueEditor` returns true
(`src/multiValue.ts:27-44`) and it opens the element-aware list editor
(`src/metaController.ts:245-313`). That editor is decent for lists in general,
but it has no notion of the `#` convention or nested tag segments. So a user who
types `#alpha` into the YAML list editor gets a literal `#alpha` stored in
frontmatter (wrong convention) - see Section 6.3. Frontmatter writes go through
`processFrontMatter` (`src/metaController.ts:368-400`, the #119 path), preserving
the rest of the YAML block. This YAML-tags-as-list editing is already exercised
by tests (`tests/e2e/multi-value.test.ts`), i.e. it is live, core behavior - not
a future concern.

### 3.5 Tests

`getTagsForFile` is *indirectly* covered: `tests/e2e/metaedit-runtime.test.ts`
asserts a body `#mytag` surfaces from `getPropertiesInFile` (`:212`). What is
**uncovered** is the part that matters here: `editTag`, the `MetaType.Tag`
write path, the Tracker branch, and tag deletion. Adjacent unit coverage exists
for `filterMenuItems` (`src/Modals/menuFilter.test.ts`), tag value suggestions
(`src/Modals/GenericPrompt/valueSuggest.test.ts`), `isMultiValueYamlProperty`
(`src/multiValue.test.ts:21`), and that frontmatter `tags:` parses as YAML
(`src/parser.test.ts:69`).

---

## 4. Defects found (confirmed, with live evidence)

All reproduced in an isolated Obsidian 1.12.7 vault against the current build.

### BUG-1 - `useTrackerPlugin` leaks across the whole session (correctness, high)

`this.useTrackerPlugin` is an instance field (`src/metaController.ts:29`), set to
`true` when a user picks "Use Tracker" (`:138`) and **never reset**. The
controller is a session singleton (`src/main.ts:33`). So after anyone picks "Use
Tracker" once, every later tag edit that session writes Tracker `#tag:value`
syntax - even when the user explicitly picks "Use MetaEdit" - until reload.

Live proof - forcing the leaked state and writing through the real controller:

```jsonc
// controller.useTrackerPlugin = true (the post-"Use Tracker" state)
{ "leakedBefore": false, "afterWrite": "#epsilon:5" }   // got Tracker syntax, MetaEdit was not chosen
```

**Fix:** derive the choice per-edit and thread it through the write call; never
store it on the instance. Audit *all* callers of `updatePropertyLine` -
`editTag -> updatePropertyFromUi` (`:150-151`, `:501-503`) and
`updateMultipleInFile` (`:477-481`), plus the public API update paths in
`src/MetaEditApi.ts`. Non-UI callers must default to MetaEdit syntax. Do **not**
add a new setting for this (Section 6.5).

### BUG-2 - Editing a body tag destroys the rest of its line (data loss, high)

`updatePropertyLine` returns a freshly-built tag string and the caller replaces
the **entire** matched line with it (`src/metaController.ts:390-396`,
`:434-447`). Any prose sharing the line is lost.

Live proof:

```text
BEFORE:  #epsilon at line start with trailing prose.
AFTER:   #epsilon/newleaf
```

" at line start with trailing prose." was deleted - silent, unrecoverable data
loss on an ordinary note.

**Fix:** rewrite only the tag token's span in place. The pattern exists for
inline fields in `replaceInlineFieldValue` (`src/parser.ts:393-404`), which
splices `[start, valueEnd)` rather than rebuilding the line - but note that
helper is **line-local** while `TagCache.position` is **document-global**
(offsets into the whole file). A sound implementation must therefore (Section 9):
carry tag position on the `Property`, splice by document offset (or locate the
token within the resolved line), validate the offset against current content
before writing, and decide the duplicate-occurrence policy (BUG-3).

### BUG-3 - The edit path has no tag-occurrence identity (correctness, high)

This is the linchpin defect and is deeper than "mid-line tags are a no-op."
Because `getTagsForFile` discards position (`src/parser.ts:49-58`) and the writer
matches by key regex across all lines (`src/metaController.ts:390-396`,
`:406-421`), MetaEdit cannot tell two occurrences of the same tag apart. Three
distinct failures follow:

1. **Mid-line / indented tag, no line-start twin -> silent no-op.** The selected
   tag is never rewritten. Live proof (editing mid-line `#zeta`):
   ```text
   BEFORE:  Mid-line tag #zeta should be editable too.
   AFTER:   Mid-line tag #zeta should be editable too.   (unchanged)
   ```
2. **Same tag appears twice -> the wrong one is edited.** If `#zeta` is mid-line
   on one line and at line-start on another, selecting the mid-line occurrence
   still rewrites the line-start one (the only `lineMatch`). With two line-start
   occurrences, **both** are rewritten.
3. **False-positive match.** The `^s*` escape bug (Section 3.3) can rewrite an
   unrelated line that happens to start with literal `s` before the tag.

**Fix:** give tag Properties stable occurrence identity (position from
`cache.tags`) and edit that specific span; correct `\s` -> `\\s` at `:409` and
`:203` regardless. If carrying position is out of scope for the first slice, the
honest fallback is to **filter non-rewritable / ambiguous tags out of the picker
and disable structure edits on tags** so nothing is silently mis-edited
(Section 11, Option A/B).

### BUG-5 - Deleting or transforming a body tag is broken (correctness, medium)

The suggester shows ❌ Delete and 🔃 Transform buttons on every non-nested
property, including body tags (`src/Modals/metaEditSuggester.ts:50-53`,
`:139-141`). But `deleteProperty` matches `` `^\s*${property.key}:` `` -
requiring a trailing colon (`src/metaController.ts:201-205`), which a `#tag`
line does not have. Live proof: deleting `#epsilon` left the file **unchanged**
(`deleted_no_op: true`). And 🔃 Transform on a tag calls `deleteProperty` (no-op)
then `addYamlProp("#tag", "#tag", ...)` (`src/Modals/metaEditSuggester.ts:122-130`),
creating a literal frontmatter key named `#tag`.

**Fix (minimal):** disable the structure buttons for `MetaType.Tag`
(`canStructureEdit` already exists as the gate at `:139-141`), or implement a
real position-based tag delete. Disabling is the smallest correct step.

### DESIGN-1 - "Edit last value" appends a child to a flat tag (UX, not a bug)

For a flat tag, `updatePropertyLine` writes `` `${splitTag[0]}/${newValue}` ``
(`src/metaController.ts:438-440`): `#epsilon` edited to `newleaf` becomes
`#epsilon/newleaf` - it appends a child segment rather than renaming. Live proof:
`#epsilon` -> `#epsilon/newleaf`.

This is **intended behavior**, not a defect: the feature is literally "Edit last
value in tags," and `valueSuggest` documents and depends on it - it suggests only
leaf segments precisely because the writer replaces the last segment
(`src/Modals/GenericPrompt/valueSuggest.ts:24-33`). It is, however, the single
most confusing thing about the feature and a likely root of the #49 confusion: a
user expecting to **rename** `#epsilon` instead gets a nested child. This is a
product decision to settle (Decision D), and - critically - it must be settled
**before** the correctness slice, because the writer, prompt copy, tests, and
`valueSuggest` all encode the current semantics.

---

## 5. The design question, assessed critically

**What native Obsidian already does well (verified 1.12.7):**

- Frontmatter `tags:` - the native Properties editor renders a dedicated tag
  widget (pills, vault-aware autocomplete, click-to-remove). This is the
  convention users know and is better than a modal picker.
- Vault-wide rename - the Tag pane's right-click "Rename tag" rewrites every
  occurrence across body and frontmatter. The canonical "edit a tag everywhere"
  flow.
- Body `#tag` entry - inline `#` autocomplete while typing.

**What is genuinely unserved:** a *single-note* operation that treats "this
note's tags" as one set regardless of home (e.g. "add `#x` to this note",
"remove `#x` wherever it is in this note"). Native tools are either per-field
(Properties) or vault-wide (Tag pane); neither is "this one note, all its tags."
MetaEdit's "Run" command is already a file-scoped all-metadata entry point
(`src/main.ts:88`) and its API advertises returning tags + YAML + inline fields
together (`README.md:85`), so this single-note niche is a natural fit - *if* it
is built at the model layer (Section 6.1), not bolted onto the picker.

**Implication.** The strongest case is correctness of what exists plus, at most,
a small model-level single-note convenience. A large merged tag-management UI
would duplicate native features, re-introduce the "which one am I editing?"
confusion #49 reported, and create maintenance that chases Obsidian's evolving
native tag UX. The native-handoff claim is load-bearing, so PR-level work should
**document** exactly what MetaEdit handles vs. what it defers to native, against
a stated Obsidian version.

---

## 6. Unification: design notes (deferred; for decision only)

Kept deliberately short. This is **not** implementation-ready scope; it exists so
the build/don't-build decision (Section 11/12) is informed. Build only on demand.

### 6.1 If unified, it belongs at the model layer - not the picker

The tempting shape is a grouped picker that lists body and frontmatter tags
together. That is the wrong boundary: grouping, `#` normalization, cross-home
dedupe, and write rules would live only in `MetaEditSuggester` and be missing
from the API metadata events (`src/MetaEditApi.ts`), the settings/menu filters
(`src/Modals/menuFilter.ts:26`), value suggestions, and any future bulk/automation
surface. A coherent unification introduces a parser/controller-level concept
(e.g. a `TagOccurrence`/tag-service that knows location + position) while keeping
the public `Property[]` API backward-compatible. Without that, "one tag set, two
homes" is unenforceable.

### 6.2 Operations (sketch)

- **Add**: prompt with vault-tag autocomplete (already exists for `MetaType.Tag`),
  then write to frontmatter (recommended default) or body. A body insert needs
  editor/cursor context the current `TFile`-only boundary does not carry
  (`src/main.ts:49,88`, `src/Modals/LinkMenu.ts`), so it requires a separate
  editor-aware command or an explicit "append to note" file operation - do not
  leak editor state into the controller.
- **Rename/remove**: frontmatter via `processFrontMatter` (preserve list form,
  `#`-less convention); body via position-based span splice (BUG-2/BUG-3 fixes).
- **Nested** (`a/b/c`): offer "rename whole tag" and "rename last segment";
  for a flat tag only "rename" is meaningful (Decision D).
- **Cross-location write ordering**: a single-note "rename everywhere" must
  serialize the two writers - a `processFrontMatter` rewrite shifts every body
  document offset, so recompute body positions after the frontmatter write (or
  do one validated full-content transform that preserves the `processFrontMatter`
  invariant). Naive parallel writes corrupt offsets.

### 6.3 Frontmatter `tags` input canonicalization (small; fold into PR scope)

Independent of any picker, frontmatter `tags`/`tag` deserve tag-aware input *now*
(Section 3.4): strip a leading `#` on input so a user typing `#alpha` stores
`alpha`. Obsidian also accepts `tags:` as a scalar or comma/space string, and
`tags: null | 5 | {nested}` are valid YAML mappings that pass the non-mapping
guard (`src/parser.ts:114-118`) and are emitted as properties (`:123-131`) - so a
tag-aware editor must handle those shapes explicitly rather than assume a list.
(Note: the malformed-YAML *parse-exception* guard is separately at
`src/parser.ts:216-229`, not `114-118`.)

### 6.4 The `#` prefix convention

Frontmatter stores without `#` (canonical); body stores with `#`; display
normalized without `#`, location shown by group; moving a tag across homes adds
or strips `#`.

### 6.5 Tracker integration (and BUG-1)

Tracker's `#tag:value` is body-only and is reached **only** through `editTag`
(`src/metaController.ts:96`, `:124`); frontmatter tags parse as YAML
(`src/parser.ts:60`). So the only real work is the BUG-1 leak fix: a per-edit
local choice plus clearer prompt copy. A dedicated "enable Tracker syntax"
setting + migration would be manufactured optionality for a single call site -
do not add it. Decision B is only "keep (fixed) vs deprecate."

### 6.6 Data invariants

1. **Round-trip:** editing one tag changes only that occurrence - never another
   tag, never surrounding prose, never unrelated YAML (today violated by BUG-2,
   BUG-3).
2. **No silent no-ops / mis-edits:** any tag shown is editable and maps to the
   selected occurrence, or it is not shown (today violated by BUG-3, BUG-5).
3. **Frontmatter via `processFrontMatter` only; body via validated span splice
   only; cross-home writes serialized (Section 6.2).**

---

## 7. Edge cases

- Tag appears multiple times in the body - decide one-occurrence vs all (Decision
  D / BUG-3); whichever, it must be deterministic and shown to the user.
- Tag inside code - `cache.tags` already excludes code spans (good).
- `tags` vs `tag` frontmatter key; scalar/CSV/list shapes (Section 6.3).
- Frontmatter `tags:` that is null/number/object - never throw (parser guards
  non-mapping at `src/parser.ts:114-118`, parse errors at `:216-229`).
- Case-only / trailing-slash differences - normalize for compare, preserve for
  write.
- Auto Property configured against `allButLast` for a nested tag
  (`src/metaController.ts:140-144`) must keep working.

---

## 8. Out of scope

- Vault-wide tag rename / merge (native Tag pane owns this; verified 1.12.7).
- Reinventing tag autocomplete or the native Properties tag widget.
- Tracker's own data/rendering behavior.
- A large tag-management UI (Section 6.1 explains why grouping at the UI layer is
  the wrong boundary).

---

## 9. Sequencing constraint (read before slicing)

Two dependencies force ordering:

1. **Semantics before correctness.** The body-tag writer encodes "append/replace
   last segment" (`src/metaController.ts:438-446`) and `valueSuggest` depends on
   it (`:24-33`). Decision D (rename vs leaf vs both) must be settled first, or
   the correctness slice will land tests that the semantics change later undoes.
2. **Occurrence identity before span writes.** BUG-2's span-splice fix is only
   correct once BUG-3's occurrence identity is resolved (position carried,
   duplicate policy chosen). Otherwise the writer still cannot target the right
   token. The cheaper alternative is to *not* build span writes and instead
   filter ambiguous tags out and disable tag structure edits.

---

## 10. Migration and back-compat

- Correctness fixes change observed behavior: edits no longer destroy line prose
  (BUG-2); deletion/transform on tags stops mis-firing (BUG-5); if Decision D
  flips to rename, flat tags rename instead of nesting. These are corrections -
  call them out in release notes.
- API: `getPropertiesInFile` output shape stays. Adding optional `position`/
  `location` to tag `Property` objects is additive; keep `IMetaEditApi` stable.
- Settings: no new setting is required for the correctness work or the Tracker
  fix (Section 6.5). Any future "default add location" rides the existing
  `mergeSettings` migration. No stored-data migration is required for the fixes.

---

## 11. Options, slicing, effort, and risk

Three honest options, smallest first. They are alternatives, not a fixed staircase.

### Option A - Subtract: remove or default-hide body-tag editing (smallest)

Lean entirely on native Obsidian + frontmatter editing. `hideFileTags` already
removes body `MetaType.Tag` entries while keeping frontmatter `tags:` editable
(`src/Modals/menuFilter.ts:14`, `:30-39`; `src/Settings/metaEditSettingsTab.ts`).
Minimal version: disable tag structure edits (BUG-5), fix the Tracker leak
(BUG-1, since the path still exists), default `hideFileTags` on or deprecate the
"Edit last value in tags" command, and document the native handoff.
- Effort: **Low.** Risk: **Low.** Value: removes the buggy surface entirely.
- Cost: abandons a (niche) capability native does not exactly replicate
  (single-note last-segment / Tracker editing).

### Option B - Repair + clarify (recommended)

Keep body-tag editing, make it correct and honest.
- Settle Decision D (Section 9) -> BUG-1 (per-edit Tracker flag, all callers) ->
  BUG-3 (occurrence identity / position) -> BUG-2 (validated span splice) ->
  BUG-5 (disable or implement tag delete) -> `\s` fix -> frontmatter `tags`
  `#`-canonicalization (Section 6.3) -> regression tests for each -> docs + an
  in-modal hint + documented native handoff.
- Effort: **Medium.** Risk: **Low-Med** (touches the write path; mitigated by
  tests and the existing span-splice pattern). Value: **High** - fixes data loss
  and the leak, resolves #49 by correctness + clarity.
- If carrying tag position proves heavy, fall back to the Option-A picker filter
  for ambiguous tags within this same slice.

### Option C - Model-level single-note tag operations (on demand)

The coherent middle: a controller/parser tag-service exposing list/rename/remove
across both homes for the current note (Section 6.1, 6.2), reusing Option B's
correct writers. No big UI, no native duplication.
- Effort: **Medium-High.** Risk: **Medium** (new model boundary, cross-home
  write ordering). Value: **Medium, demand-gated.**

### Not recommended - Option D: a full grouped tag-management UI (Section 6.1).

Recommended order: settle Decision D -> Option B. Consider Option A if the
maintainer would rather shrink surface than maintain it. Hold Option C for
explicit demand.

---

## 12. Recommendation and decisions for Christian

**Recommendation:** Settle the semantics (Decision D), then ship **Option B**.
It fixes real data loss, a state leak, and broken delete/transform, and resolves
the #49 confusion by making tag editing correct and documented. If you would
rather not own a feature that overlaps native Obsidian, **Option A** is a
legitimate, smaller call. Hold the cross-location unification (Option C) unless
users specifically ask for single-note, all-homes tag operations - native
already covers frontmatter editing and vault-wide rename better than we can.

**Decisions needed (D first - it gates the work):**

- **D. "Edit last value" semantics** (DESIGN-1): keep append-leaf, switch the
  primary action to rename-tag, or offer both? This also dictates whether an edit
  hits one occurrence or all. *Recommend: primary = rename whole tag; offer
  "edit last segment" only for nested tags; edit a single, identified
  occurrence.* Settle before any code.
- **A. Scope:** Option A (subtract), Option B (repair), or commit to Option C?
  *Recommend: Option B.*
- **B. Tracker's future:** keep `#tag:value` (leak fixed, body-only) or
  deprecate it? *Recommend: keep, fixed; no new setting.*
- **C. Occurrence-identity investment** (gates BUG-2/BUG-3 fix quality): carry
  tag `position` on `Property` and edit the exact span, or take the smaller route
  (filter ambiguous tags out + disable tag structure edits)? *Recommend: carry
  position; it is the root fix and unblocks Option C later.*
- **E. Empty frontmatter `tags:`** after removing the last tag: leave `tags: []`
  or remove the key? *Recommend: remove the key.*

---

## Appendix A - evidence index

- Disconnected sources / dropped position: `src/metaController.ts:39-45`,
  `src/parser.ts:49-58`, `:60-65`; live cache probe (Section 3.1).
- Body-tag flow: `src/metaController.ts:96-100`, `:124-153`, `:434-447`,
  `:390-396`, `:477-481`.
- `lineMatch` line-start-only + `\s`->`s` escape (incl. `s#gamma` false +):
  `src/metaController.ts:406-421`; node repro (Section 3.3).
- BUG-1 Tracker leak: `src/metaController.ts:29`, `:138`, `:435-436`,
  `src/main.ts:33`; live proof `#epsilon:5`.
- BUG-2 data loss: live proof `#epsilon at line start...` -> `#epsilon/newleaf`.
- BUG-3 occurrence identity: `src/parser.ts:49-58`, `src/metaController.ts:390-396`,
  `:406-421`; live no-op proof (`#zeta` unchanged).
- BUG-5 broken delete/transform: `src/metaController.ts:195-211` (`:203` regex),
  `src/Modals/metaEditSuggester.ts:50-53`, `:122-130`, `:139-141`; live proof
  `deleted_no_op: true`.
- DESIGN-1 leaf semantics by design: `src/metaController.ts:438-446`,
  `src/Modals/GenericPrompt/valueSuggest.ts:24-33`; live proof
  `#epsilon` -> `#epsilon/newleaf`.
- Frontmatter tag handling: `src/multiValue.ts:27-44`,
  `src/metaController.ts:245-313`, `:368-400`; `tests/e2e/multi-value.test.ts`.
- Parser guards: non-mapping `src/parser.ts:114-118`, `:123-131`; parse-exception
  `src/parser.ts:216-229`.
- Test coverage: `tests/e2e/metaedit-runtime.test.ts:212` (body tag surfaces);
  edit/write/Tracker/delete paths uncovered.
- Native Obsidian 1.12.7 verified in the isolated E2E vault.

## Appendix B - adversarial review

Reviewed by three opposing-model (Codex) reviewers - Skeptic, Architect,
Minimalist. Accepted findings folded into this revision: occurrence-identity is
the linchpin (BUG-3 reframed; PR ordering in Section 9); the wrong
malformed-YAML citation corrected (Section 6.3); BUG-4 reclassified as intended
behavior (DESIGN-1); a fifth defect added (BUG-5, broken tag delete/transform,
verified live); the unified model demoted to a deferred sketch and re-homed at
the model layer (Section 6.1); a "subtract the feature" path added as a
first-class option (Section 11, Option A); the Tracker setting dropped as
manufactured optionality (Section 6.5); the span-splice fix tightened for
document-global offsets (Section 4 BUG-2, Section 9); the test-coverage claim
narrowed (Section 3.5); and the native-handoff claim verified against Obsidian
1.12.7 and flagged for documentation.
</content>
