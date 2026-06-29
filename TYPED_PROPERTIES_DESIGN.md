# Typed Properties Design Spike

Status: design spike for Christian approval. No production code has been changed by
this document.

Scope: MetaEdit should edit YAML frontmatter values with editors that feel native
to Obsidian's Properties panel for text, list/multitext, number, checkbox, date,
datetime, `tags`, and `aliases`. The storage shape must stay compatible with
Obsidian and with MetaEdit's existing parser/write invariants.

## Executive Recommendation

Use MetaEdit-owned typed editors as the supported product, styled to feel native
with Obsidian classes and interaction patterns. Do not mount Obsidian's internal
`registeredTypeWidgets` in the first production PR.

1. Add a typed-value modal boundary that returns a discriminated result:
   `{kind: "submit"; value: unknown}` or `{kind: "cancel"}`. Do not use
   `unknown | null`, because `null` can be a submitted value.
2. Start with top-level YAML arrays only, excluding frontmatter `tags`/`tag` and
   `aliases` until their special semantics are handled in the next slice.
3. Build a MetaEdit-owned pill/list editor that preserves order, duplicates,
   wikilinks, commas, and untouched mixed-list element values.
4. Use Obsidian's own CSS classes where they are stable enough
   (`multi-select-container`, `multi-select-pill`, `multi-select-input`,
   `metadata-input-*`) so the UI feels native without depending on internal
   widget lifecycle.
5. Write the returned value through the existing controller write path
   (`updatePropertyInFile` -> `processFrontMatter` for YAML), but add typed-path
   stale-value protection so a long-lived modal does not clobber a concurrent
   frontmatter edit.
6. Treat `metadataTypeManager` and native widget mounting as optional future
   enhancements after the supported editors are proven with write/read
   roundtrips, mobile checks, and lifecycle cleanup evidence.

This changed during adversarial review. The runtime probe on Obsidian 1.12.7
shows native widgets are mountable, but reviewers correctly pointed out that the
native path creates a second editor stack, has no public disposal contract, is
unverified at the 1.5.7 floor, can silently drift without throwing, and may
stringify mixed arrays. Therefore the first implementation should fix the user
pain with owned UI first. Native widget reuse remains a research-backed option,
not the first production dependency.

The minimal first PR should be narrow: a top-level YAML list/multitext editor
only. Number, checkbox, date, datetime, tags, aliases, Obsidian-assigned type
detection, one-edit type override, and any persisted type assignment can follow
once the list editor proves the modal seam and write invariants.

## Evidence Collected

### Repository and Version Baseline

- Current branch for this spike: `chhoumann/typed-props-design`, based on
  `origin/master` at `5f8e713 fix(controller): make inline-field writes
  fence-aware`.
- Current plugin manifest version is `1.8.4`, and `manifest.json` declares
  `minAppVersion: "1.5.7"` (`manifest.json:4-5`).
- Dev typings are `obsidian@1.13.1` (`package.json:40`). These are current
  public typings, not proof that internal runtime fields exist at the 1.5.7
  floor.
- `versions.json` still maps released `1.8.4` to Obsidian `1.4.1` and future
  `1.9.0` to `1.5.7` (`versions.json:7-8`). Any implementation PR that ships
  under `1.9.0` should keep that release-history intent aligned with the
  manifest. This design does not change release metadata.

### Public Obsidian API Boundary

The installed public typings expose the primitives MetaEdit should continue to
use:

- `App.metadataCache` is public (`node_modules/obsidian/obsidian.d.ts:425-434`).
- `CachedMetadata.frontmatter`, `frontmatterPosition`, and `frontmatterLinks`
  are public; `frontmatterPosition` and `frontmatterLinks` are marked since
  Obsidian 1.4.0 (`node_modules/obsidian/obsidian.d.ts:1446-1458`).
- `FileManager.processFrontMatter` is public and documented as an atomic
  frontmatter mutation primitive
  (`node_modules/obsidian/obsidian.d.ts:2933-2942`).
- `getFrontMatterInfo(content)` is public and marked since Obsidian 1.5.7
  (`node_modules/obsidian/obsidian.d.ts:3337-3344`).

The same public typings do not expose `app.metadataTypeManager`,
`getAssignedWidget`, `getTypeInfo`, `registeredTypeWidgets`, or a typed
Properties widget contract. Current MetaEdit code already treats
`metadataTypeManager` as untyped runtime API and feature-detects it
(`src/Modals/GenericPrompt/valueSuggest.ts:196-230`).

Design implication: use `metadataTypeManager` for hints and optional native
rendering only behind guards. Do not make it a hard runtime requirement unless
Christian explicitly approves a higher, empirically verified Obsidian floor.

### Live Runtime Probe

Probe mode:

- Vault: isolated worktree vault `metaedit-typed-props-design`.
- Vault path:
  `.obsidian-e2e-vaults/metaedit-typed-props-design`.
- Obsidian runtime: user agent reported `obsidian/1.12.7`; Electron 39.8.3,
  Chrome 142.0.7444.265, Node 22.22.1.
- MetaEdit loaded: `true`, version `1.8.4`.
- `pnpm run obsidian:e2e -- dev:errors`: `No errors captured.`

Observed `app.metadataTypeManager` shape in Obsidian 1.12.7:

- Own keys:
  `_`, `assignedWidgets`, `lastSave`, `properties`, `_loaded`,
  `onConfigFileChange`, `app`, `registeredTypeWidgets`.
- Prototype methods:
  `load`, `registerListeners`, `onRaw`, `updatePropertyInfoCache`,
  `getAllProperties`, `getAssignedWidget`, `getWidget`, `getTypeInfo`,
  `getPropertyInfo`, `loadData`, `save`, `setType`, `unsetType`, `trigger`,
  `on`.
- `getAssignedType` was absent.
- `types` was absent.
- `getTypeInfo.length === 2`.

Observed property type behavior:

- `getAssignedWidget(name)` returns widget ids such as `text`, `multitext`,
  `number`, `checkbox`, `date`, `datetime`, `tags`, `aliases`, or `null`.
- `getAllProperties()` and `properties` contain objects shaped like
  `{ name, widget, occurrences }`.
- `getTypeInfo(name, value?)` returns `{ expected, inferred }`, where each side
  is a widget descriptor. Examples from the probe:
  - unknown `rating` with value `42` inferred and expected `number`;
  - assigned `count` with value `"not-a-number"` had expected `number` and
    inferred `text`;
  - mixed array `[1, "two"]` inferred and expected `unknown`;
  - `tags` returned reserved type metadata with `reservedKeys: ["tags"]`.

Observed native widget registry:

- `registeredTypeWidgets` keys:
  `aliases`, `checkbox`, `date`, `datetime`, `file`, `folder`, `multitext`,
  `property`, `number`, `tags`, `text`.
- Each widget exposes `name`, `type`, `icon`, `validate`, and `render`.
  Some expose `reservedKeys`.
- `validate.length === 1`.
- `render.length === 3`.
- Descriptor examples:
  - `number`: icon `lucide-binary`, validates numbers only.
  - `checkbox`: icon `lucide-check-square`, validates booleans only.
  - `date`: icon `lucide-calendar`, validates empty/null and valid date-like
    values.
  - `datetime`: icon `lucide-clock`, validates empty/null and valid
    datetime-like values.
  - `multitext`: icon `lucide-list`, validates strings and arrays.
  - `tags`: icon `lucide-tags`, `reservedKeys: ["tags"]`.
  - `aliases`: icon `lucide-forward`, `reservedKeys: ["aliases"]`.

Observed native render contract in Obsidian 1.12.7:

```ts
widget.render(containerEl, rawStoredValue, {
	app,
	sourcePath: file.path,
	key: property.key,
	onChange(nextValue) { ... },
	blur() { ... },
});
```

This rendered all requested editor shapes in a disposable DOM container when the
second argument was the raw stored value:

- `text` -> `div.metadata-input-longtext[contenteditable=true]`.
- `number` -> `input.metadata-input.metadata-input-number[type=number]`.
- `checkbox` -> `input.metadata-input-checkbox[type=checkbox]`.
- `date` -> `input.metadata-input.metadata-input-text.mod-date[type=date]`.
- `datetime` ->
  `input.metadata-input.metadata-input-text.mod-datetime[type=datetime-local]`.
- `multitext` -> `div.multi-select-container` with removable pills and a
  contenteditable `.multi-select-input`.
- `tags` -> `div.multi-select-container` with tag-specific pill rendering.
- `aliases` -> `div.multi-select-container` with alias pills.

When synthetic edit events were dispatched with explicit `onChange`/`blur`
callbacks:

- `text` called `onChange("changed")`.
- `number` called `onChange(123)` and called `onChange(null)` when cleared.
- `checkbox` called `onChange(false)`.
- `date` called `onChange("2026-08-03")` and `onChange("")` when cleared.
- `datetime` called `onChange("2026-08-03T12:34:00")`.
- `multitext` called `onChange(["a", "b", "changed"])`.
- `tags` called `onChange(["area/test", "changed"])`.
- `aliases` called `onChange(["Alias", "changed"])`.

`render` returned internal widget instance objects with fields like `inputEl`,
`checkboxEl`, `multiselect`, `hoverPopover`, and `ctx`. Their prototypes exposed
methods such as `setValue`, `onFocus`, `parse`, and `format`, but no obvious
public `dispose`, `destroy`, or `unload` method. The adapter should therefore
own a disposable container and remove it on modal close, close any known
suggesters/popovers defensively only when a method is present, and avoid calling
undocumented widget instance methods for normal operation.

This proves MetaEdit can probably mount native widgets on current Obsidian, but
it does not prove compatibility at Obsidian 1.5.7 or future Obsidian releases.
The contract is internal and minified.

## Current MetaEdit Editing Flow

The current interactive edit flow is source-shape based, not Obsidian
property-type based:

- `MetaEdit.runMetaEditForFile` opens the property suggester after
  `controller.getPropertiesInFile`.
- `MetaEditSuggester.onChooseItem` sets a one-shot `promptValueContext`, calls
  `controller.editMetaElement`, and clears the context in `finally`
  (`src/Modals/metaEditSuggester.ts:115-124`).
- `MetaController.editMetaElement` branches into:
  - body tag edit;
  - nested YAML parent refusal;
  - Auto Properties;
  - current multi-value editor;
  - standard string prompt
  (`src/metaController.ts:121-147`).
- `standardMode` calls `GenericPrompt.Prompt(...)`, which resolves
  `string | null`, then writes via `updatePropertyFromUi`
  (`src/metaController.ts:316-323`,
  `src/Modals/GenericPrompt/GenericPrompt.ts:12-14`).
- `GenericPromptContent.svelte` currently consumes the context, can show
  suggestions, and has partial date/datetime awareness, but still submits a
  string (`src/Modals/GenericPrompt/GenericPromptContent.svelte:31-91`).
- `multiValueMode` preserves real YAML arrays by editing one selected element
  against the original array. It preserves untouched element types/order/spelling
  and only changes the selected element (`src/metaController.ts:326-397`,
  `src/multiValue.ts:22-83`).
- `MetaType` currently models storage/source category only:
  `YAML`, `Dataview`, `Tag`, `Option` (`src/Types/metaType.ts:1-3`).

Write invariants already worth preserving:

- YAML writes go through `updatePropertyInFile` and
  `app.fileManager.processFrontMatter` (`src/metaController.ts:477-508`,
  `src/metaController.ts:726-728`).
- All MetaEdit file writes are serialized per file
  (`src/metaController.ts:701-735`).
- Frontmatter `tags` and `tag` are canonicalized into a YAML list and strip
  leading `#` (`src/tagEditing.ts:156-188`,
  `src/metaController.ts:497-503`).
- Inline Dataview fields are line-based text and are written by parsed spans, not
  by broad regex replacement (`src/parser.ts:216-239`,
  `src/parser.ts:438-488`).
- Nested YAML exact-key behavior is preserved by preferring exact non-virtual
  properties before virtual nested leaves (`src/MetaEditApi.ts:284-287`).

## Build vs Reuse Decision

### Option A: Reuse Native `registeredTypeWidgets`

Benefits:

- Best native feel. The runtime widgets render the same classes and DOM
  structures as Obsidian's Properties panel.
- Least styling chase. Theme, density, pill styling, checkbox styling, and
  platform-specific date/datetime input behavior come from Obsidian.
- Strongest near-term coverage. On current Obsidian 1.12.7, one adapter can
  mount text, multitext, number, checkbox, date, datetime, tags, and aliases.
- Better a11y likelihood for complex widgets because Obsidian owns keyboard and
  screen-reader behavior for its own controls.

Costs and failure modes:

- It is not public API. The public `obsidian` typings do not expose
  `metadataTypeManager`, `registeredTypeWidgets`, or a widget context type.
- It may not exist at the current `minAppVersion` 1.5.7.
- Signature drift can break runtime mounting without TypeScript warning.
- The callback contract is inferred, not documented. The probe observed
  `onChange` and `blur`, but future widgets may need additional context fields.
- Native widgets may persist or normalize values in ways MetaEdit does not want
  if used outside the Properties panel. Example risk: tag duplicate handling,
  datetime seconds normalization, or null/empty conversion.
- Native widgets may allocate suggesters/listeners outside the modal. MetaEdit
  must own cleanup and must close any dropdowns when the modal closes.
- Mobile behavior is unknown. MetaEdit is not desktop-only (`manifest.json:9`).

### Option B: Build MetaEdit-Owned Svelte Widgets

Benefits:

- Stable contract. The UI returns exactly the typed value MetaEdit intends to
  write.
- Full fallback across old/new Obsidian versions.
- Easier to unit-test in the repo's existing node/jsdom-safe patterns.
- Easier to enforce MetaEdit invariants: preserve array order/duplicates,
  preserve untouched mixed-list element types, never flatten wikilinks, never
  treat inline Dataview values as typed frontmatter.
- Accessibility and mobile behavior are under MetaEdit's control.

Costs and failure modes:

- More code. List pills, tag/alias suggestions, keyboard behavior, remove
  buttons, invalid states, and date/datetime details are not trivial.
- Ongoing styling chase. Obsidian themes can change class names, spacing, and
  interaction details.
- Harder to match native autocomplete for file/tag/property values.
- More surface for subtle divergence from the Properties panel.

### Recommendation: Build First, Reuse Later Only If Proven

Build MetaEdit-owned widgets for the supported path. Use Obsidian CSS classes
and native HTML controls to get close to the Properties panel, but do not mount
`registeredTypeWidgets` in the first implementation.

Why this wins after review:

- The fallback must exist anyway for older Obsidian versions, mobile failures,
  and internal API drift. If the fallback is complete, native mounting is a
  second editor stack, not a free enhancement.
- The native widgets expose no documented cleanup method. Removing MetaEdit's
  host element may not remove document-level suggesters, hover popovers, or
  event listeners.
- Arity and `try/catch` guards catch only synchronous mount failure. They do not
  catch a widget that renders but no longer calls MetaEdit's `onChange`, or that
  calls it with a subtly different value shape.
- The native multitext widget emits string arrays. That is unsafe for mixed YAML
  arrays unless MetaEdit wraps it in a value-preserving normalizer, at which
  point the fallback list editor has already done the hard part.
- The first user pain is a list editing experience. A MetaEdit pill editor
  styled with Obsidian's classes can fix that without any internal API.

Native widget mounting should become a later experiment only after these
conditions are met:

- The MetaEdit-owned editor exists for that type and is already covered by
  tests.
- The target Obsidian version floor is explicitly probed for that widget.
- A write -> `processFrontMatter` -> metadata-cache re-read roundtrip is proven
  for normal edits, clear edits, and mismatch values.
- The returned widget instance and any popovers/suggesters can be closed without
  leaks.
- The native and fallback paths share the same `widgetValue -> writeValue`
  normalizer, so users get one storage behavior.

Until then, `metadataTypeManager` should be used only as a read-only hint for
future type detection, never as the first PR's rendering dependency.

## Type Detection Model

Only YAML frontmatter gets typed-property editing by default. Inline Dataview
fields (`key:: value`) and body tag occurrences are line-based text/token edits,
not Obsidian Properties rows. They should keep their existing editors unless a
future feature explicitly adds a separate inline-value type system.

Slice 1 does not need the full type resolver. It should route only:

- `property.type === MetaType.YAML`;
- `!property.isVirtual && !property.isNested`;
- `Array.isArray(property.content)`;
- `!isTagsKey(property.key)`;
- `property.key.toLowerCase() !== "aliases"`.

Everything else keeps the current `editMetaElement` routing. This avoids
breaking scalar YAML edits, frontmatter tags, aliases, Auto Properties, and
inline multi-value fields while the list editor is being proven.

The full target-state resolver, for later slices, should use this order for a
YAML property:

1. Special key override:
   - `tags` and `tag` use the tags editor. MetaEdit already treats both as
     frontmatter tag keys.
   - `aliases` uses the aliases editor.
2. Assigned Obsidian widget:
   - `metadataTypeManager.getAssignedWidget(property.key)`.
3. Registry/cache property info:
   - `metadataTypeManager.getAllProperties()?.[key]?.widget` or
     `metadataTypeManager.getPropertyInfo(key)?.widget`.
   - Look up both the exact key and a normalized/lowercase key, because runtime
     caches may normalize property names. Always write back through the original
     `Property.key`.
4. Obsidian type info:
   - `metadataTypeManager.getTypeInfo(key, property.content)?.expected?.type`.
   - If expected and inferred disagree, preserve expected as the default editor
     but show a mismatch warning and offer text/list fallback.
5. Value-shape inference when type manager is missing or unhelpful:
   - `Array.isArray(value)` -> list/multitext editor.
   - `typeof value === "boolean"` -> checkbox.
   - finite `number` -> number.
   - JavaScript `Date` object from YAML timestamp parsing -> date or datetime
     only after formatting it back to an ISO-compatible local value; otherwise
     text fallback.
   - ISO datetime string -> datetime.
   - ISO date string -> date.
   - otherwise text.
6. Unknown/mixed values:
   - mixed arrays and objects become `unknown`. Parent maps/arrays-of-objects
     should continue to be refused as scalar edits. Mixed scalar arrays can use
     the existing element-preserving list editor, not a lossy full-list text box.

Type override model for a later slice:

- The typed modal can show the resolved type in a small type control after the
  core editors are proven.
- Users can override the editor for this edit only: Text, List, Number,
  Checkbox, Date, Datetime, Tags, Aliases where applicable.
- Persisting the Obsidian property type via `metadataTypeManager.setType` is out
  of scope for the first implementation. It is internal API and affects the
  whole vault. If added later, it should be an explicit opt-in action such as
  "Also set Obsidian property type", not a side effect of editing a value.
- If the assigned type cannot represent the current value, default to the
  assigned editor only when it can preserve the value safely. Otherwise default
  to text/list fallback and surface "Obsidian says this is Number, but the
  stored value is text."

## Integration Boundary

Do not change MetaEdit's write core for this feature. Change only how the new
value is collected. The typed editor should be a new stateful modal, not an
extension of `GenericPrompt`. `GenericPrompt` should remain the one-shot
string-prompt used by tags, create-new-property, Auto Property support, and
legacy inline flows.

Slice 1 conceptual boundary:

```ts
type TypedPromptResult =
	| {kind: "submit"; value: unknown}
	| {kind: "cancel"};

interface TypedListPromptInput {
	app: App;
	file: TFile;
	property: Property;
	currentValue: readonly unknown[];
	expectedValue: unknown;
}
```

Controller flow after approval:

1. `MetaEditSuggester` should not seed `promptValueContext` for properties that
   route to the typed modal. That singleton is for legacy `GenericPrompt`
   consumers and should not coexist with explicit typed-modal arguments.
2. `editMetaElement` keeps existing early branches:
   - body tag edit;
   - YAML parent container refusal;
   - Auto Properties.
3. For Slice 1 only, if the property is a top-level non-tag, non-alias YAML
   array, call `TypedListPrompt.open(...)`.
4. If it returns cancel, do nothing.
5. If it returns submit, normalize and validate the submitted list value, then
   write through the existing YAML path.
6. All other properties use the existing `multiValueMode` or `standardMode`
   routing.

Important correctness change: the typed path must not use truthiness to decide
whether to save. Existing `standardMode` skips empty strings because it checks
`if (newValue)`. Typed values include valid falsy values such as `false`, `0`,
`""`, and `null`. The new prompt result needs an explicit cancel/submit sentinel.

Normalization owner:

- Add one small per-type normalization layer between editor state and
  `updatePropertyFromUi`.
- Both future native-widget experiments and owned fallback widgets must funnel
  through it.
- For Slice 1, the normalizer reconstructs the YAML list by preserving untouched
  original element values and replacing only elements the user actually changed.
  It must not stringify untouched numbers, booleans, nulls, objects, or wikilink
  strings.

Stale-write guard:

- The typed modal is longer-lived than the current one-line prompt. Before
  committing, the typed path should re-read the live frontmatter value and refuse
  with a Notice if it no longer matches `property.content`.
- This mirrors the existing nested-path expected-value protection in spirit and
  prevents a typed modal from clobbering a concurrent Sync, automation, or
  MetaEdit write.

The public API should not change. API methods already accept `unknown` values
and bypass interactive value collection. This feature is an interactive editing
improvement, not an API validation layer.

## Per-Type Editor UX

### Text

Default for unknown scalar strings and explicit text properties.

Future native experiment:

- Use `registeredTypeWidgets.text` when available.
- Observed native output is `metadata-input-longtext` contenteditable.

Owned editor path:

- Text input or textarea depending on current value length/newlines.
- Preserve Markdown, wikilinks, commas, colons, and bracket characters exactly.
- Commit the exact string unless the user explicitly clears it.

### List / Multitext

Default for YAML arrays and Obsidian internal `multitext`. This is the first
implementation slice.

Future native experiment:

- Use `registeredTypeWidgets.multitext`.
- Observed native output is `multi-select-container` with removable pills and a
  contenteditable input.

Owned editor path:

- Pill list with:
  - add item input;
  - remove item buttons;
  - one clear edit mechanism for an existing pill;
  - keyboard support for Enter, Backspace, Escape.
- Preserve list order and duplicates.
- Preserve untouched non-string array elements by storing each pill with its
  original value plus edited text state, then reconstructing by value on submit.
  Do not rely on object identity surviving YAML serialization.
- If the array is mixed and the user edits one element, only the edited element
  becomes the submitted text/typed value. Unchanged `1`, `true`, `null`, and
  wikilink strings stay as they were.
- Never split values on commas inside a YAML array. A value like
  `[[A, B]]` remains one item.

Interaction with existing `multiValueMode`:

- Top-level YAML arrays that are not `tags`/`tag` or `aliases` should move to
  the full list editor instead of the current two-step "choose an element, then
  prompt" flow.
- Frontmatter `tags`/`tag` and `aliases` stay on existing behavior until their
  special slices are implemented.
- Inline Dataview multi-value settings should keep existing `multiValueMode`,
  because those values are stored as line text, not YAML arrays.
- `EditMode.AllMulti` and `EditMode.SomeMulti` still matter for inline/string
  multi-value fields. They should not force a YAML typed number or checkbox into
  a list editor.

### Tags

Applies to frontmatter `tags` and `tag`.

Future native experiment:

- Use `registeredTypeWidgets.tags` for `tags` when present.
- Obsidian's internal widget reserves `tags`, while MetaEdit also treats `tag`
  as a tags key. For `tag`, prefer MetaEdit fallback unless runtime testing shows
  the native tags widget behaves correctly with key `tag`.

Owned editor path:

- Pill editor using canonical frontmatter tag values without leading `#`.
- Accept user input with or without leading `#`.
- Reject spaces/commas in a single tag pill unless the input is intentionally
  split into multiple tags.
- Preserve order and duplicates unless Christian explicitly chooses native
  dedupe behavior.
- Empty tag list follows existing MetaEdit behavior: delete the frontmatter key
  rather than write `tags: []` or `tags:`.

### Aliases

Applies to frontmatter `aliases`.

Future native experiment:

- Use `registeredTypeWidgets.aliases`.

Owned editor path:

- Pill editor like multitext, but no tag syntax validation.
- Preserve spaces and commas inside aliases.
- Empty list should probably delete or clear the key only if it matches
  Obsidian native behavior. This needs one implementation-time runtime check.

### Number

Future native experiment:

- Use `registeredTypeWidgets.number`.
- Observed native output is `input[type=number]` with `inputmode=decimal` and
  `step=any`.
- Observed `onChange` returns a number and returns `null` when cleared.

Owned editor path:

- `input[type=number]` with `step=any`.
- Submit finite numbers only.
- Reject or fall back to text for `NaN`, `Infinity`, locale-formatted numbers,
  and strings like `"4/5"`.
- If assigned type is number but current value is non-numeric text, default to
  text fallback with a mismatch warning. Do not clobber the stored value.
- Save `0` correctly. Do not use truthiness guards.

Open decision:

- What should clearing a number do? The native widget emits `null`, but
  `validate(null)` returned `false` in the probe. The implementation should
  compare native Properties panel behavior before deciding whether MetaEdit
  writes `null`, empty string, refuses save, or asks to delete the property.

### Checkbox

Future native experiment:

- Use `registeredTypeWidgets.checkbox`.
- Observed native output is `input[type=checkbox]`.
- Observed `onChange` returns booleans.

Owned editor path:

- Checkbox/toggle.
- Write real booleans, not `"true"` / `"false"` strings.
- Save `false` correctly. Do not use truthiness guards.
- If current value is not boolean and the assigned type is checkbox, show a
  mismatch warning and fall back to text unless the user explicitly converts.

### Date

Future native experiment:

- Use `registeredTypeWidgets.date`.
- Observed native output is `input[type=date]` with native Obsidian classes.
- Observed `onChange` returns `YYYY-MM-DD` or `""` when cleared.

Owned editor path:

- `input[type=date]`.
- Only use the date picker when current value is empty/null or ISO date
  compatible. Current code already follows this rule for partial date support
  (`src/Modals/GenericPrompt/valueSuggest.ts:57-90`).
- Also handle YAML parser `Date` objects deliberately. If `parseYaml` returns a
  `Date` for an unquoted YAML timestamp, format it to a safe ISO date for the
  editor or fall back to text; do not let `String(dateObject)` force an
  accidental text fallback.
- Store ISO date strings. Do not create JavaScript `Date` objects.
- If a date-typed property stores `"next Friday"` or `"TBD"`, fall back to text
  and warn. Do not erase non-ISO user content.

### Datetime

Future native experiment:

- Use `registeredTypeWidgets.datetime`.
- Observed native output is `input[type=datetime-local]`.
- Observed `onChange` returned `YYYY-MM-DDTHH:mm:00` for a minute-precision
  synthetic edit.

Owned editor path:

- `input[type=datetime-local]`.
- Preserve seconds if present. Current code already uses `step="1"` when the
  initial value contains seconds (`GenericPromptContent.svelte:43-45`).
- Store ISO local datetime strings, not `Date` objects.
- Confirm whether native Obsidian normalizes seconds before shipping this slice.

## Data Invariants and Edge Cases

### Storage Shape

No migration. Existing frontmatter values keep their storage shape unless the
user changes that exact value.

- Strings stay strings.
- Numbers stay numbers.
- Booleans stay booleans.
- Lists stay YAML lists.
- Tags stay canonical frontmatter tag lists.
- Inline Dataview fields stay line text.

### Wikilinks and Markdown

Never parse list values by naive comma splitting when the stored value is a YAML
array. Existing code explicitly protects `[[wikilinks]]` and commas inside array
elements (`src/multiValue.ts:22-26`, `src/multiValue.ts:56-66`). The new list
editor must keep that invariant.

Text and alias values may contain Markdown, wikilinks, commas, brackets, and
colons. The typed editor should not sanitize those unless a specific type, such
as tags, requires it.

### Empty Values

Cancel and submit must be different states.

- Empty text can be a submitted value.
- `false` and `0` are valid submitted values.
- Empty `tags` should preserve current MetaEdit behavior and delete the key.
- Empty date/datetime should follow native Properties behavior after runtime
  verification. Probe evidence says date/datetime widgets emit `""`.
- Empty number requires an explicit product decision.

### Value/Assigned-Type Mismatch

Examples:

- Assigned `number`, stored `"not-a-number"`.
- Assigned `checkbox`, stored `"yes"`.
- Assigned `date`, stored `"next Friday"`.
- Assigned `multitext`, stored mixed array `[1, "two"]`.

Rule: do not coerce silently. Default to the least lossy editor and present an
explicit conversion only if the user changes the value.

### Mixed Lists

Mixed arrays are common in YAML even if Obsidian's Properties panel cannot fully
represent them. The probe showed `[1, "two"]` inferred as `unknown`.

Rule: mixed arrays should not be flattened. If MetaEdit cannot render a safe
full-list editor, use the existing element-level list edit behavior and preserve
untouched items.

### Nested YAML

Obsidian property types apply to frontmatter properties, not necessarily to
MetaEdit's virtual nested leaves. MetaEdit currently exposes virtual nested
scalar leaves through `path`, while refusing parent containers as scalar edits.

Rule for v1: typed editors apply only to top-level non-virtual YAML properties.
Virtual nested scalar leaves can use value-shape fallback later, but must not
read/write Obsidian assigned types for the root key as if they applied to the
nested leaf.

### Inline Dataview

Inline `key:: value` fields are not native Properties rows and are not included
in the metadata type manager. The current parser/write path is deliberately
line-based.

Rule: typed Properties support is YAML frontmatter only in v1. Inline fields keep
the existing text/multi-value behavior.

### Auto Properties

Auto Properties own their value-entry UX and are intercepted before
standard/multi edit mode. The first typed-properties PR should not rewrite Auto
Property modals.

Later option: an Auto Property could declare a typed output, but that is a
separate feature because it changes user-defined configuration semantics.

### Mobile and Themes

MetaEdit is not desktop-only. Native HTML date/datetime inputs and checkboxes
are generally mobile-friendly, but internal Obsidian widgets are not guaranteed
to be safe inside a plugin modal on mobile.

Implementation must include at least one mobile smoke pass before claiming full
support. Owned widgets are the mobile support path; any future native-widget
experiment must prove mobile behavior separately.

Theme behavior should lean on Obsidian classes where possible:

- `metadata-input`
- `metadata-input-text`
- `metadata-input-number`
- `metadata-input-checkbox`
- `metadata-input-longtext`
- `multi-select-container`
- `multi-select-pill`
- `multi-select-input`
- `mod-date`
- `mod-datetime`

Do not copy large chunks of Obsidian CSS into MetaEdit. Prefer native classes
plus minimal local layout for the modal.

### Accessibility

Owned widgets need modal-level accessibility from the first slice:

- visible label/header tied to editor;
- keyboard Save/Cancel;
- Escape cancels;
- Enter commits only where that is not destructive to multi-select entry;
- remove buttons have labels;
- warnings are text, not color-only;
- focus returns/cleans up after close.

If a future native-widget experiment ships, it must meet the same bar and must
prove that its focus handling and popovers close cleanly inside MetaEdit's
modal.

## Slicing Plan

### Slice 1: YAML List / Multitext Editor

Goal: fix the reported pain point first.

Work:

- Add a new typed list modal that returns `{kind: "submit"; value: unknown[]}`
  or `{kind: "cancel"}`.
- Use a value-shape gate only: top-level YAML array, not `tags`/`tag`, not
  `aliases`, not nested/virtual.
- Provide a MetaEdit-owned pill-list editor styled with Obsidian classes.
- Route only those gated arrays away from `multiValueMode`.
- Keep inline Dataview multi-value behavior unchanged.
- Keep frontmatter `tags`/`tag` and `aliases` on existing behavior until Slice
  2.
- Re-read the live frontmatter value before commit and refuse stale writes.
- Add unit coverage for list reconstruction:
  - unchanged mixed elements stay typed;
  - edited elements change only at their own index;
  - duplicates and order are preserved.
- Add isolated Obsidian E2E coverage for write -> cache re-read roundtrips:
  - list edit with `[[wikilink, comma]]`;
  - duplicate list values;
  - mixed list preserving untouched numeric/null/boolean elements;
  - stale-value refusal when the frontmatter list changes while the modal is
    open.

Effort: 3 to 5 days.

Risk: medium. Most risk is modal keyboard behavior, stale-write handling, and
mixed-array preservation.

### Slice 2: Tags and Aliases

Goal: make special multi-value properties feel native.

Work:

- `tags` and `tag`: canonical tag pill editor.
- `aliases`: alias pill editor with spaces/commas preserved.
- Confirm native Properties behavior for duplicates and empty lists before
  deciding whether MetaEdit preserves, deletes, or dedupes.
- Preserve current MetaEdit tag canonicalization unless Christian explicitly
  approves a behavior change.

Effort: 2 to 4 days.

Risk: medium. Tags have canonicalization rules and body tags are a separate
MetaType; do not mix them.

### Slice 3: Number and Checkbox

Goal: typed scalar values that write real YAML numbers/booleans.

Work:

- Owned number and checkbox editors.
- Explicit submit sentinel so `0` and `false` save.
- Mismatch warnings for assigned type vs stored value.
- Decide and test number-clearing behavior.
- Add the first narrow type resolver only for number/checkbox needs:
  assigned/inferred type hints plus value-shape fallback.

Effort: 2 to 3 days.

Risk: medium-low. The UI is simple, but falsy-value writes are a common bug
source.

### Slice 4: Date and Datetime

Goal: replace current partial date/datetime support with the typed prompt
architecture.

Work:

- Move current date/datetime ISO safety rules into the resolver/editor.
- Preserve seconds for datetime when present.
- Verify native Properties panel normalization against MetaEdit's owned editor
  behavior.
- Handle YAML parser `Date` objects deliberately.
- Keep fallback to text for non-ISO date-like content.

Effort: 2 to 4 days.

Risk: medium. Datetime normalization and mobile picker behavior need live
testing.

### Slice 5: Full Type Detection and One-Edit Override

Goal: allow users to override the editor for one edit.

Work:

- Add modal type control.
- Show expected vs inferred mismatch.
- Offer one-edit conversion with warning.
- Do not persist `metadataTypeManager.setType` yet.
- Expand `metadataTypeManager` reads only after every resolved type has an owned
  editor and normalizer.

Effort: 2 to 4 days.

Risk: medium. The risk is product complexity, not code difficulty.

### Slice 6: Optional Native Widget Experiment

Goal: decide whether actual Obsidian native widget mounting is worth shipping.

Work:

- Christian approval required before this slice.
- Probe the exact target Obsidian floor and current Obsidian release.
- For each candidate widget, prove mount, edit, clear, close, reopen, write,
  cache re-read, and mobile behavior.
- Prove lifecycle cleanup for popovers/suggesters/listeners.
- Use the same normalizer as owned widgets.
- Ship only if it materially improves UX over the owned editor.

Effort: 3 to 6 days of research and proof before any production use.

Risk: high because the widget API is internal and lifecycle ownership is unclear.

### Slice 7: Optional Persisted Type Assignment

Goal: optionally let users also set the Obsidian property type.

Work:

- Christian approval required before this slice.
- Runtime-gate `metadataTypeManager.setType`.
- Confirm availability and persistence across supported Obsidian versions.
- Add clear UI copy that this changes the vault-level Properties type.

Effort: 2 to 3 days after research.

Risk: high because `setType` is internal API.

## Minimal First PR Definition

The smallest useful first PR:

- Adds no public API changes.
- Adds no GitHub automation/release metadata changes unless needed for tests.
- Adds a typed list modal with an explicit submit/cancel result.
- Supports top-level YAML arrays with:
  - MetaEdit-owned pill editor styled with Obsidian classes;
  - preservation of order, duplicates, wikilinks, commas, and untouched mixed
    element types.
- Excludes `tags`/`tag`, `aliases`, nested/virtual YAML, and inline Dataview
  fields from the new typed path.
- Re-reads live frontmatter before commit and refuses stale list writes.
- Keeps inline Dataview fields and Auto Properties on existing flows.
- Defers `tags`, `aliases`, number, checkbox, date, datetime, and type override
  UI to follow-up slices unless Christian explicitly approves expanding the
  first PR.
- Includes unit tests for list reconstruction.
- Includes isolated Obsidian E2E proof for real YAML list write/read
  roundtrips.
- Documents that full scalar coverage is intentionally deferred to later slices.

This PR would be user-visible and releasable on its own because it fixes the
highest-pain list case while establishing the architecture for the remaining
types.

## What Stays Out of Scope

- Production implementation before Christian approves this design.
- PR creation, issue comments, or GitHub posting.
- Changing `processFrontMatter` or parser semantics.
- Changing public MetaEdit API contracts.
- Persisting Obsidian property type assignments with `setType`.
- Full Obsidian Properties panel embedding.
- Bulk editor typed-value support.
- Auto Property typed configuration.
- Inline Dataview typed-property support.
- Nested YAML object/map editors.
- Release version bumping.

## Implementation Risks to Keep Visible

1. Internal widget drift. Native widget reuse is powerful but unsupported. It is
   a later experiment, not a first-PR dependency.
2. Falsy values. The new prompt cannot use truthiness to decide whether to save.
3. Mixed arrays. The owned list editor must preserve untouched values by
   reconstruction, not by stringifying the displayed pills.
4. Empty semantics. Number/date/datetime clearing needs product decisions based
   on native Properties behavior.
5. Tags vs body tags. Frontmatter `tags`/`tag` and body `#tag` occurrences are
   different systems.
6. Stale writes. A longer-lived typed modal widens the read-to-write window, so
   typed commits need live-value checks.
7. Mobile. Owned widgets need real mobile smoke coverage before MetaEdit claims
   full support.
8. Version floor. Runtime evidence is from Obsidian 1.12.7. The current manifest
   floor is 1.5.7. The feature must degrade cleanly on older versions unless the
   floor is deliberately raised after testing.

## Adversarial Review Summary

Reviewer method:

- Required opposite-model review was run through `claude -p`.
- The first combined three-reviewer command was terminated and produced empty
  files, so the reviews were rerun with smaller file-path prompts.
- Completed reviewers: Skeptic, Architect, Minimalist.
- No reviewer edited files or posted to GitHub.

Verdict: the initial native-first hybrid was rejected as too risky for the first
production slice. The final recommendation above accepts that critique and
switches to MetaEdit-owned editors first.

Accepted findings:

- The prompt result must be a discriminated submit/cancel union. `unknown | null`
  is wrong because `null` may be a submitted value.
- Native-widget render probes are not enough. Production use would need full
  write -> `processFrontMatter` -> cache re-read roundtrips.
- Native `multitext` can emit string arrays, so it is unsafe as the default path
  for mixed YAML arrays.
- Native widgets expose no public disposal/lifecycle contract, and removing the
  host element may not close popovers or document-level listeners.
- A `try/catch` around `render()` does not catch silent `onChange` contract
  drift.
- Slice 1 must not reroute every YAML edit. It should intercept only top-level
  non-tag, non-alias YAML arrays.
- The full `metadataTypeManager` resolver should not ship as unused Slice 0
  code. It should be introduced only when a supported editor needs it.
- Typed modals are longer-lived than current prompts, so the design needs stale
  frontmatter checks before commit.
- `GenericPrompt` should remain a string prompt. Typed editing should use a new
  stateful modal.
- Native widget mounting should be a later experiment only if owned widgets are
  not native-feeling enough.

Rejected or deferred findings:

- The per-type UX catalog remains in the document even though many slices are
  deferred, because the deliverable explicitly asks for full typed-property
  design coverage. The implementation plan keeps the first PR narrow.
- Persisted Obsidian type assignment remains documented as a possible future
  slice because Christian asked for the type-detection/override model, but it is
  out of scope until explicitly approved.

## Approval Decisions for Christian

1. Accept the revised build-first recommendation, or require actual native
   widget mounting despite the lifecycle/version risks?
2. Should the first PR focus narrowly on YAML lists, or include tags/aliases in
   the same slice?
3. For clearing a typed value, should MetaEdit write empty/null, delete the
   property, or refuse save per type?
4. Should any future slice be allowed to persist Obsidian property type
   assignments via internal `metadataTypeManager.setType`, or should MetaEdit
   always treat assigned types as read-only hints?
5. Is support for Obsidian 1.5.7 still a hard floor for this feature, or can a
   later implementation raise the minimum version if native widgets are not
   present there?
