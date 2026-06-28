# MetaEdit Audit - Story Notes

Full code-derived expected behavior, edge cases, and pre-test risk hypotheses for each story in `AUDIT_TRACKER.md`. Generated from `audit/canonical-stories.json`.

## Run command + Edit Meta suggester

### RUN-01 - Open Edit Meta suggester via Run command

- **Story:** As a user, I want to invoke the MetaEdit Run command (or hotkey) on the active markdown file so that a fuzzy-search modal listing all editable properties opens.
- **Entry point:** command | **Platform:** both
- **Expected behavior:** The 'MetaEdit: Run' command (id metaEditRun) calls getActiveMarkdownFile; if no markdown file is active it silently returns. Otherwise it calls controller.getPropertiesInFile; if that returns falsy it also silently returns. When data is obtained a MetaEditSuggester modal is constructed and opened. The footer shows three hints: 'Delete property', 'Transform to YAML/Dataview', and a '#tag Select to rename here / vault-wide rename: Obsidian Tag pane' hint.
- **Edge cases:**
  - No active markdown file: command no-ops silently with no notice.
  - getPropertiesInFile returns null/undefined: modal never opens, no feedback.
  - Active file is non-markdown (canvas, graph view, settings): silently no-ops.
  - File with zero properties: modal opens showing only the two option rows.
- **Risks / test focus:**
  - Silent no-op when no active file (main.ts:53-57) and when getPropertiesInFile is falsy (main.ts:89-90) gives the user no feedback.
  - getActiveMarkdownFile in utility.ts:8 calls this.logError(...) but is a plain exported function, so `this` is undefined in strict mode and logError will throw a TypeError instead of aborting silently when no active markdown file.

### RUN-02 - List properties in the suggester and filter YAML parent containers

- **Story:** As a user, I want the suggester to display all parseable properties of the active file (frontmatter, inline, body tags) with nested YAML container objects hidden, so I am presented with leaf-level editable values plus the two new-property options.
- **Entry point:** command | **Platform:** both
- **Expected behavior:** getItems() returns [...MAIN_SUGGESTER_OPTIONS, ...this.data]. The two option rows ('New YAML property', 'New Dataview field') appear first with the CSS class metaedit-suggester-command. this.data is whatever survived the ignored-properties filter and a .filter(item => !isYamlParentContainer(item)) pass, in getPropertiesInFile order (tags, YAML, Dataview). isYamlParentContainer is true when type is YAML, isVirtual is falsy, and isYamlParentContainerValue(content) is true (a plain object, or an array containing at least one plain object or nested array); flat scalar arrays remain.
- **Edge cases:**
  - All properties filtered out: only the two option rows remain.
  - A YAML value that is a plain array of scalars is shown.
  - Virtual YAML rows bypass the parent-container filter and are shown.
  - If a parent-container item reaches onChooseItem (e.g. via API), it silently returns (metaEditSuggester.ts:98).
- **Risks / test focus:**
  - The two option rows are always at the top and are fuzzy-matchable, so typing 'new'/'yaml'/'dataview' surfaces them alongside property names.
  - A YAML property with isNested:true but isVirtual:false that is also a parent container passes the filter and is shown with no buttons; choosing it calls editMetaElement, which may not handle a parent-container value safely (metaEditSuggester.ts:157-160).

### RUN-03 - Create a new YAML frontmatter property from the suggester

- **Story:** As a user, I want to select 'New YAML property' from the suggester so that I can create a new frontmatter key-value pair in the current file.
- **Entry point:** suggester | **Platform:** both
- **Expected behavior:** When item.content === newYaml, onChooseItem calls controller.createNewProperty(this.suggestValues). If falsy (cancelled) the handler returns. Otherwise it destructures {propName, propValue} and calls controller.addYamlProp(propName, propValue, this.file), which adds the key via processFrontMatter unless it already exists.
- **Edge cases:**
  - User cancels the name/value prompt: no write occurs.
  - Property name already exists: addYamlProp shows a Notice and does not add.
- **Risks / test focus:**
  - onChooseItem returns null (not undefined) when createNewProperty is falsy (metaEditSuggester.ts:83), a type mismatch with the Promise<void> signature.
  - No guard prevents choosing a key that already exists on the note; controller dedup is the only protection.

### RUN-04 - Create a new Dataview inline field from the suggester

- **Story:** As a user, I want to select 'New Dataview field' from the suggester so that I can append a new inline key:: value field to the file body.
- **Entry point:** suggester | **Platform:** both
- **Expected behavior:** When item.content === newDataView, onChooseItem calls controller.createNewProperty(this.suggestValues), then controller.appendDataviewField(propName, propValue, this.file) if the user did not cancel.
- **Edge cases:**
  - User cancels the prompt: no write occurs.
  - Frontmatter-only file: appendDataviewField inserts at start of body, not in frontmatter.
- **Risks / test focus:**
  - Same null-return type mismatch as the YAML branch (metaEditSuggester.ts:92).
  - The field is always appended, never inserted at a chosen location.

### RUN-05 - New-property name autocomplete from vault property names

- **Story:** As a user, I want the 'new property' name prompt to suggest property names already used in my vault (plus Obsidian built-ins) so I can add a consistently-named property without remembering exact spelling.
- **Entry point:** suggester | **Platform:** both
- **Expected behavior:** setSuggestValues() builds a Set from: non-tag AutoProperty names (excluding names starting with '#'); getKnownPropertyNames(app), which is five hardcoded Obsidian built-ins (aliases, cssclass, cssclasses, publish, tags) plus all keys/names from metadataTypeManager.getAllProperties(); minus names already present in this.data. The result is passed as suggestValues to createNewProperty for both new-YAML and new-Dataview paths.
- **Edge cases:**
  - metadataTypeManager absent (Obsidian < 1.4) or getAllProperties() throws: falls back to only the five hardcoded names.
  - AutoProperty names beginning with '#' are excluded from name suggestions.
  - Properties already present in the file are excluded.
  - Same suggestions are offered for both YAML and Dataview new-property actions.
- **Risks / test focus:**
  - suggestValues uses the filtered this.data as the 'existing' set, so an ignored/hidden property is treated as not-present and can be re-offered as a 'new' name even though it exists, requiring controller dedup (metaEditSuggester.ts:175).
  - getKnownPropertyNames adds both registry key and info.name, so a property may appear twice with different casing (valueSuggest.ts:97-114).
  - getAllProperties runs synchronously on modal open and may return hundreds of entries for large vaults.

### RUN-06 - Delete a property via the X button in the suggester

- **Story:** As a user, I want to click the X button on a property row so that the property is removed from the file and the modal closes.
- **Entry point:** suggester | **Platform:** both
- **Expected behavior:** renderSuggestion adds an X button only when canStructureEditProperty is true (type is not Tag, isNested false, isVirtual false). Clicking X calls evt.stopPropagation(), awaits controller.deleteProperty(item.item, this.file), then this.close().
- **Edge cases:**
  - Tag rows, nested/virtual YAML rows, and the two option rows: no X button rendered.
  - Modal closes after each delete, so multiple deletes need re-opening.
- **Risks / test focus:**
  - No try/catch around deleteProperty in deleteItem (metaEditSuggester.ts:112-118): if it throws, close() never runs and the modal stays open with no error feedback.
  - The modal is visually open during the async delete.

### RUN-07 - Transform a property between YAML and Dataview via the transform button

- **Story:** As a user, I want to click the transform button on a YAML property or Dataview field row so that it is converted to the other format, preserving key and value.
- **Entry point:** suggester | **Platform:** both
- **Expected behavior:** When item is YAML and canStructureEditProperty is true, the transform button calls toDataview: deleteProperty(property, file) then appendDataviewField(property.key, property.content, file). When item is Dataview, it calls toYaml: deleteProperty(property, file) then addYamlProp(property.key, property.content, file). The modal is closed after either. canStructureEditProperty is re-checked defensively inside transformProperty.
- **Edge cases:**
  - property.content may be an object/array/complex string; the controller must serialize it.
  - If addYamlProp finds the key already exists, it shows a Notice and does not add, so the field is lost after the delete.
  - Defensive double-guard of canStructureEditProperty.
- **Risks / test focus:**
  - Delete-then-write is two sequential writes (metaEditSuggester.ts:137-143); if the second write fails or no-ops (key exists) after delete succeeds, the property/field is silently lost with no rollback.
  - this.close() runs unconditionally after the await even on failure (no try/catch), masking the error.
  - Complex YAML value passed to appendDataviewField may produce malformed Dataview syntax.

### RUN-08 - Disambiguate duplicate body #tag occurrences in the suggester list

- **Story:** As a user with the same #tag appearing multiple times in a note body, I want each occurrence labeled with line number and ordinal so that I can pick which one to edit.
- **Entry point:** suggester | **Platform:** both
- **Expected behavior:** getItemText: for a Tag item with a position, it collects all this.data items with the same key that have a position, sorts by position.start, and if more than one returns '<key> (line N, M/total)' (N = position.line+1, 1-indexed). The 'line N' prefix is omitted when position.line is undefined. Single occurrence returns item.key.
- **Edge cases:**
  - Two identical tags on the same line: same line label, ordinals 1/2 and 2/2.
  - Tag with undefined position is treated as non-duplicate and shown as plain key.
  - Non-tag properties always return item.key.
  - Disambiguation only considers post-filter this.data, so hidden duplicates change ordinals.
- **Risks / test focus:**
  - If two tags share the same position.start (malformed parse), findIndex returns the same index for both and both get ordinal 1 (metaEditSuggester.ts:65-69).
  - If hideFileTags hides all body tags, this code is dead but harmless.

## MetaController read/write core

### CTRL-01 - Aggregate property read across frontmatter, inline, and body tags

- **Story:** As a user or API caller, I want to retrieve all properties from a file in one call so that I can see every piece of metadata regardless of storage location, including notes that use the legacy `...` frontmatter close marker.
- **Entry point:** api | **Platform:** both
- **Expected behavior:** getPropertiesInFile calls parseFrontmatter, parseInlineFields, and getTagsForFile, returning [...tags, ...yaml, ...inlineFields]. Properties are never deduplicated; the same key can appear in YAML and inline. Nested YAML appears both as a root container entry and as flat entries with path/rootKey set. getTagsForFile reads cache.tags so each body tag becomes a Property of type Tag with a {start, end, line} position; multiple occurrences are separate entries and frontmatter tags are not returned here. Frontmatter parsing supports the legacy `...` close: getLegacyDotCloseFrontmatterInfo scans for /^\.\.\.\s*$/ after the opening `---`, and getFrontmatterInfo prefers the legacy result when its contentStart is earlier than the standard one.
- **Edge cases:**
  - No metadata cache: getTagsForFile returns [] silently; a newly-created/unindexed note appears to have no tags until the cache populates.
  - Malformed YAML: parseFrontmatterContent returns null, falling back to the Obsidian metadata cache.
  - File with no frontmatter returns only inline + tags.
  - CRLF line endings handled in splitContentLines so offsets stay correct.
  - A standard `---` close before a later `...` uses the standard close; a `...` before any `---` is ignored.
- **Risks / test focus:**
  - Order tags > yaml > inline is an implicit contract; index-based callers break if it changes.
  - parseFrontmatterObject does cachedRead then checks the cache, so stale cache vs fresh disk can disagree in a race.
  - If both frontmatter close forms have equal contentStart the standard form wins, undocumented (parser.ts:266); splitContentLines re-parses the whole file per check (O(n)).
  - Tag positions can be stale after a rapid edit (validated at write time by spliceTag, parser.ts:86).

### CTRL-02 - Parse inline Dataview fields (bracketed and full-line)

- **Story:** As a user who writes Dataview inline fields, I want MetaEdit to read both [key:: value]/(key:: value) bracketed fields and full-line key:: value fields so all my inline metadata is editable.
- **Entry point:** automatic | **Platform:** both
- **Expected behavior:** parseInlineContent skips frontmatter lines and fenced code blocks. Bracketed fields take priority on a line; if any are found, full-line detection is skipped for that line. Overlapping bracketed fields are deduplicated keeping the earliest start. Full-line fields strip a single leading blockquote/list marker via FULL_LINE_PREFIX. Fields inside fences (``` or ~~~, indented up to 3 spaces) are never returned. On write, replaceInlineFieldValue uses parseLineFields and splices right-to-left, replacing chars from field.sepEnd to field.valueEnd with ' '+newValue (full-line valueEnd is end-of-line; bracketed valueEnd is just before the closing bracket), preserving everything outside the span byte-for-byte and rewriting all same-key fields on a line.
- **Edge cases:**
  - A line with both bracketed and full-line patterns yields only the bracketed fields.
  - Keys containing brackets are rejected.
  - Nested brackets tracked so [key:: [[wikilink]]] resolves to [[wikilink]].
  - A closing fence of a different char or shorter length does not close the block.
  - Keys with regex metacharacters handled literally via indexOf.
  - Two same-key bracketed fields on one line are both replaced in one call.
- **Risks / test focus:**
  - FULL_LINE_PREFIX strips only ONE list marker; a double-nested list item leaves an inner '-' in the key, making it unmatchable on write (parser.ts:46).
  - Backslash is deliberately not an escape, so \] inside a bracketed value does not escape the bracket (parser.ts:376), consistent with Dataview but undocumented.
  - paren-wrapped square-bracket fields like ([key:: v]) can produce unexpected overlap-dedup results (parser.ts:319).
  - replaceInlineFieldValue always inserts a leading space after :: and assumes left-to-right ordered matches for the right-to-left splice (parser.ts:433).

### CTRL-03 - Add a new YAML frontmatter property (addYamlProp)

- **Story:** As a user or API caller, I want to add a new property to a file's YAML frontmatter so that I can attach structured metadata to a note.
- **Entry point:** api | **Platform:** both
- **Expected behavior:** addYamlProp checks Object.prototype.hasOwnProperty; if the key exists, it skips and shows a Notice. Otherwise it sets frontmatter[propName]=propValue inside processFrontMatter. A tags/tag key is normalized via splitFrontmatterTags first. In AllMulti or SomeMulti (key in scope) a scalar value is promoted to a single-element array unless an AutoProperty forces scalar mode and the value is not already an array.
- **Edge cases:**
  - A tags array is re-normalized per element (strips '#', splits on commas/whitespace).
  - A value already an array is never re-wrapped.
  - Duplicate detection uses hasOwnProperty.
- **Risks / test focus:**
  - The 'already has property' Notice has a misplaced period inside the quoted key: '<key>. Will not add.' (metaController.ts:79).
  - addYamlProp returns void: callers cannot distinguish 'added' from 'already existed'.
  - The SomeMulti check uses settings.EditMode.properties.contains() (Obsidian-only) while every other site uses .includes(), which throws outside Obsidian (metaController.ts:62).

### CTRL-04 - Append a new inline Dataview field instance (appendDataviewField)

- **Story:** As a user or API caller, I want to append a new key:: value inline field to a note body without touching existing same-named fields so that I can accumulate multiple values for a key.
- **Entry point:** api | **Platform:** both
- **Expected behavior:** appendDataviewField serializes array values to a comma-joined string and detects the file's newline convention (CRLF vs LF). computeInlineInsertIndex picks the line: 'afterLastMatch' (default) inserts after the last body line declaring the same key, else end-of-body; 'end' inserts after the last body content line or trailing closed fence. Insertion never lands in frontmatter or a fenced code block. The write goes through the per-file queue.
- **Edge cases:**
  - Empty file: inserted at index 0.
  - Frontmatter-only file: inserted at start of body.
  - Trailing blank lines: 'end' inserts before them.
  - Unclosed code fence at EOF: 'end' inserts before the opening fence.
  - Fields inside fences are not counted as matches.
  - CRLF preserved via /\r?\n/ split and \r\n join.
  - When no match exists, 'afterLastMatch' and 'end' both resolve to lastAnchorIdx+1.
- **Risks / test focus:**
  - 'afterLastMatch' fallback and 'end' converge to lastAnchorIdx+1 with no match, blurring the two locations (parser.ts:487).
  - Trailing blank lines treated as non-anchors so the field lands between content and blanks (parser.ts:481).
  - Array input becomes a single comma-joined line, not one line per element.

### CTRL-05 - Delete a property; block nested/virtual YAML deletes (deleteProperty)

- **Story:** As a user, I want to delete a top-level metadata property so I can remove unwanted keys, while MetaEdit refuses to delete a nested or virtual YAML sub-key so I do not corrupt structured frontmatter.
- **Entry point:** edit-meta-menu | **Platform:** both
- **Expected behavior:** deleteProperty reads raw content, splits on '\n', finds the first line matching ^\s*<escaped-key>\s*: and removes it via filter, then writes back. Nested or virtual YAML properties (isNested or isVirtual true) are blocked with a Notice ('Nested YAML property cannot be deleted by MetaEdit yet.'). The suggester also suppresses the X button for these rows via canStructureEditProperty.
- **Edge cases:**
  - Indented YAML keys still match (leading-whitespace allowance).
  - No matching line: file written back unchanged.
  - Only the FIRST matching line is removed.
  - A nested YAML property that is also a parent container is shown without buttons; choosing it edits its value, not deletes it.
- **Risks / test focus:**
  - Splits on '\n' only, not /\r?\n/, so CRLF files are silently converted to LF (metaController.ts:253).
  - The regex ^\s*<key>\s*: can match a body line like 'status: done' and delete the wrong line; the key is not always escaped (pre-existing bug).
  - deleteProperty does NOT use enqueueFileWrite, so it races with all queued writes (lost update).
  - Multi-line YAML values (block scalars/sequences) leave orphaned continuation lines that corrupt frontmatter.
  - The only nested-delete guard is canStructureEditProperty plus the deleteProperty Notice; bypassing both would delete by raw key-line regex (menuFilter.test.ts BUG-5).

### CTRL-06 - Batch update multiple properties in one write (updateMultipleInFile)

- **Story:** As an API caller or automation (e.g. progress properties), I want to update several properties with as few file writes as possible so the file is written once per batch.
- **Entry point:** automatic | **Platform:** both
- **Expected behavior:** updateMultipleInFile partitions properties into yamlProperties (no path), yamlPathProperties (path), tagProperties, and textProperties. Tag writes run first (highest-offset-first), then YAML via one processFrontMatter call, then text/inline via one vault.modify. The whole batch runs inside a single enqueueFileWrite slot. Failed tag spans are logged and skipped. Path-based YAML writes use setYamlPath with createParents:false, createLeaf:false.
- **Edge cases:**
  - Empty tag/yaml/text partitions skip their respective write.
  - A YAML-only batch results in exactly one processFrontMatter call.
  - Dataview-typed props land in textProperties and use lineMatch + updatePropertyLine.
- **Risks / test focus:**
  - If processFrontMatter fails, the subsequent text write still proceeds against a file with only the tag changes applied, partially corrupting the batch.
  - yamlProperties (plain keys) are written before yamlPathProperties, with no guard against one being the parent of the other ('is not an object' error).
  - Skipped-tag log does not say which tag in a multi-tag batch (metaController.ts:566).

### CTRL-07 - Serialize concurrent writes per file (enqueueFileWrite)

- **Story:** As a user or automation author triggering rapid successive edits to the same file, I want writes serialized so edits never overwrite each other.
- **Entry point:** automatic | **Platform:** both
- **Expected behavior:** enqueueFileWrite maintains a module-level Map<normalizedPath, Promise>. Each new write chains onto the previous via .catch(()=>undefined).then(task). After resolution, if the entry is still this call's, it is removed. A failure in one queued task does not block subsequent tasks.
- **Edge cases:**
  - deleteProperty bypasses the queue and races with it.
  - A single queued updateMultipleInFile callback issues multiple internal vault.modify calls; an external edit between them is not prevented.
  - The queue is module-level, shared across MetaController instances for the same file.
- **Risks / test focus:**
  - deleteProperty is the only write method that bypasses the queue, the most dangerous for lost updates (metaController.ts:253-264).
  - Three vault reads inside one queued updateMultipleInFile task make the slot footprint large.

### CTRL-08 - Create a new property interactively (name + value prompt)

- **Story:** As a user, I want to be prompted for a property name and then a value so that I can create a new metadata field through the UI.
- **Entry point:** command | **Platform:** both
- **Expected behavior:** createNewProperty prompts for a name (with optional suggestions). Empty name returns null. If an AutoProperty exists for the name, handleAutoProperties supplies the value (string or string[]); otherwise GenericPrompt asks for a free-text value. The result is {propName, propValue} with string propValue trimmed. The caller decides whether to addYamlProp or appendDataviewField.
- **Edge cases:**
  - Empty name (blank Enter) returns null.
  - Cancelled AutoProperty returns null.
  - Array propValue (AutoProperty) returned as-is; string trimmed.
- **Risks / test focus:**
  - If GenericPrompt resolves with undefined rather than null, the null check (entered === null) misses it and propValue is undefined, so callers receive {propName, propValue: undefined} (metaController.ts:237-239).
  - createNewProperty does not write; a caller using the wrong write method is not type-guarded.

## Single vs Multi value editing

### MULTI-01 - AllSingle mode: edit a scalar property as plain text

- **Story:** As a user with Edit Mode AllSingle, I want to click a non-array property so that I can type a new value in a single text prompt.
- **Entry point:** edit-meta-menu | **Platform:** both
- **Expected behavior:** When EditMode is AllSingle and the property is not a YAML array and not a tags/tag key, shouldUseMultiValueEditor returns false and editMetaElement routes to standardMode: a GenericPrompt pre-filled with the current value. A non-empty submission writes the new scalar via updatePropertyInFile; cancelling or submitting an empty string is a no-op.
- **Edge cases:**
  - A YAML array is never routed to standardMode even in AllSingle (isMultiValueYamlProperty short-circuits).
  - tags/tag key is always multi-value even in AllSingle.
  - Empty-string submission silently no-ops.
- **Risks / test focus:**
  - Empty-string no-op (metaController.ts:294) is silent: deliberately clearing a field gives no feedback.
  - if (newValue) treats '0' and 'false' as empty, so a user cannot set a literal '0'/'false' scalar via standardMode (correctness bug).

### MULTI-02 - AllMulti mode: edit as a list and wrap new YAML values in a list

- **Story:** As a user with Edit Mode AllMulti, I want every property to open the element-aware list editor and newly created YAML properties to be wrapped in a list automatically.
- **Entry point:** edit-meta-menu | **Platform:** both
- **Expected behavior:** shouldUseMultiValueEditor returns true for any property when EditMode is AllMulti, routing to multiValueMode for all non-Auto, non-Tag, non-parent-container properties. A true YAML array is persisted as an array; a YAML scalar routed via AllMulti is comma-split for display and re-joined with ', ' on write (not promoted to a YAML list). On creation, addYamlProp wraps a non-array value as [propValue] when no AutoProperty keeps it scalar and the mode is AllMulti (or SomeMulti with the key opted in). Auto Properties short-circuit before the editor check.
- **Edge cases:**
  - A YAML scalar edited in AllMulti is written back as a comma string, not a real YAML list.
  - Auto Properties are not forced to the list editor by AllMulti.
  - tags/tag is always a list regardless of EditMode; an existing property's create is skipped with a Notice.
- **Risks / test focus:**
  - No UX indication that a scalar edited in AllMulti is stored as a comma string rather than a YAML list; users expecting [] promotion are surprised.
  - The SomeMulti create-wrapping path uses .contains() (Obsidian-only), so it throws outside Obsidian (metaController.ts:62).
  - An AutoProperty with no explicit type may still cause wrapping via isMultiAutoProperty; the interaction is subtle and untested.

### MULTI-03 - SomeMulti mode: per-property opt-in list and matching

- **Story:** As a user with Edit Mode SomeMulti, I want to designate specific property names as multi-value via a settings table so only those open the list editor while others use the plain text prompt.
- **Entry point:** settings | **Platform:** both
- **Expected behavior:** shouldUseMultiValueEditor returns true only when EditMode is SomeMulti AND EditMode.properties.includes(property.key) (exact, case-sensitive). A real YAML array still goes to the list editor regardless of opt-in. The gear button (visible only in SomeMulti) toggles a SingleValueTableEditorContent table bound to EditMode.properties: 'Add' appends an empty string and immediately saves; per-keystroke onchange saves; the X button removes a row by index and saves. No confirmation.
- **Edge cases:**
  - Case-sensitive exact match: 'Status' does not match opt-in 'status'.
  - A true YAML array overrides the mode check.
  - 'Add' saves an empty-string entry before the user types, matching a property keyed ''.
  - Panel visibility is a CSS toggle; re-opening the tab starts collapsed.
  - No confirmation/undo on remove.
- **Risks / test focus:**
  - addYamlProp uses Array.prototype.contains (Obsidian-only) while multiValue.ts uses .includes(); the SomeMulti create path throws outside Obsidian (metaController.ts:62).
  - No case-insensitive matching: renaming a property's casing silently breaks its opt-in.
  - Every Add click and every keystroke writes settings to disk (no debounce) (SingleValueTableEditorContent.svelte:19-45).
  - bDivToggle can desync after AllSingle/AllMulti -> SomeMulti round-trip so the first gear click does the opposite of expected.
  - Duplicate names accepted silently.

### MULTI-04 - Multi-value: select and replace an existing list item

- **Story:** As a user with multi-value editing active, I want to pick an existing value from the suggester so I can change it to a new string.
- **Entry point:** edit-meta-menu | **Platform:** both
- **Expected behavior:** multiValueMode shows a GenericSuggester. For 2+ elements the order is 'Add to end', the values, then 'Add to beginning'. Selecting an existing value opens a GenericPrompt seeded with it; a non-empty submission dispatches {kind:'replace', index} to applyMultiValueEdit, which replaces base[index]. Only the touched element changes; others keep their type.
- **Edge cases:**
  - Out-of-range index at apply time replaces the whole list with [value] (multiValue.ts:77).
  - The edited element is always written as a string, so numbers/booleans become strings when touched.
- **Risks / test focus:**
  - parsedSelectedIndex via Number(substring) makes Number('') === 0 a valid index, a latent index-zero corruption path (metaController.ts:341-344).
  - Out-of-range index (-1/NaN) silently replaces the entire list (data-loss path).
  - Touching a numeric/boolean YAML element silently changes its type to string.

### MULTI-05 - Multi-value: append to end or prepend to beginning of the list

- **Story:** As a user with multi-value editing active, I want to choose 'Add to end' or 'Add to beginning' and type a value so it is appended after the last item or prepended before the first.
- **Entry point:** edit-meta-menu | **Platform:** both
- **Expected behavior:** Selecting 'Add to end' or 'Add to beginning' opens an empty GenericPrompt; a non-empty submission dispatches {kind:'append', value} returning [...base, value] or {kind:'prepend', value} returning [value, ...base]. A YAML array is written as a list; a comma-scalar or inline field is joined with ', '. A tags key strips a leading '#' before adding.
- **Edge cases:**
  - Empty-string submission is a silent no-op (metaController.ts:357).
  - A tags entry that strips to '' aborts with a second early return.
  - Single-element list order is [value, 'Add to end', 'Add to beginning'] while multi-element is ['Add to end', ...values, 'Add to beginning'] - the add options move depending on list length.
- **Risks / test focus:**
  - The no-op on empty entry gives no feedback (same as standardMode).
  - The 'Add to beginning'/'Add to end' positions change between single- and multi-element lists, inconsistent UX.

### MULTI-06 - Multi-value: add the first value to an empty/blank property

- **Story:** As a user editing a property whose value is empty or blank, I want the suggester to show only 'Add new value' so I can initialize the property.
- **Entry point:** edit-meta-menu | **Platform:** both
- **Expected behavior:** When displayValues is empty OR length 1 with displayValues[0]==='' , the suggester shows only 'Add new value'. Selecting it and entering a value dispatches {kind:'addFirst', value} returning [value], discarding the empty base.
- **Edge cases:**
  - A whitespace-only YAML scalar is filtered to empty by toValueArray, correctly triggering the 'Add new value' path.
  - The empty-check only matches the exact string '' for a single element.
- **Risks / test focus:**
  - applyMultiValueEdit's addFirst returns [value] regardless of base; if invoked on a non-empty list (API path) it silently discards all existing values (multiValue.ts:71).
  - Label 'Add new value' does not communicate that it discards existing content.

### MULTI-07 - YAML true-array vs comma-scalar write-back distinction

- **Story:** As a user, I want editing a YAML list to keep it a YAML list and editing a scalar in multi mode to keep it a comma string so that property types are not silently changed.
- **Entry point:** edit-meta-menu | **Platform:** both
- **Expected behavior:** editsArray is true for a tags key OR a YAML array. When true, the result is written back as an array. When false (non-array YAML scalar or inline field routed via AllMulti/SomeMulti), writeBase is comma-split strings and the result is re-joined with ', '; never promoted to a YAML list. toValueArray trims and strips surrounding brackets for the scalar case.
- **Edge cases:**
  - A scalar 'a,b,c' is re-joined uniformly as 'a, b, c', lossy for varied spacing.
  - toValueArray strips surrounding [ ] from a scalar before splitting.
- **Risks / test focus:**
  - toValueArray strips surrounding brackets from a scalar, so editing a value literally '[a, b]' loses the brackets on write-back (data corruption for unusual YAML scalar values) (autoProperties.ts:119-120).

## Auto Properties

### AUTO-01 - Enable/disable Auto Properties globally

- **Story:** As a user, I want to toggle Auto Properties on or off globally so I can suspend the preset-value UX without deleting my configured properties.
- **Entry point:** settings | **Platform:** both
- **Expected behavior:** The settings toggle reads/writes AutoProperties.enabled and saves immediately. When disabled, getActiveAutoProperty short-circuits to undefined and all auto-property paths fall through to standard editing. The stored properties list is untouched. Toggling does NOT call toggleAutomators.
- **Edge cases:**
  - Disabling preserves stored properties; they reactivate when re-enabled.
  - The Svelte panel is mounted into the hidden div even when disabled.
- **Risks / test focus:**
  - AutoPropertiesModalContent is mounted into the DOM even when disabled (a memory/perf concern) (metaEditSettingsTab.ts:104).
  - The Auto Properties toggle does not call toggleAutomators while Progress/Kanban do; if an automator were ever needed it would not register until reload.

### AUTO-02 - Configure an Auto Property entry (add, name, description, choices, delete)

- **Story:** As a user, I want to add, name, describe, manage preset choices for, and delete Auto Property entries so I can define named properties with curated value lists.
- **Entry point:** settings | **Platform:** both
- **Expected behavior:** 'Add auto property' appends {name:'', choices:[''], type:'Single'} and immediately saves. The name input saves on change; findAutoProperty matches by strict case-sensitive equality with no trimming. A description input saves on change and renders as a muted subtitle in the picker only when truthy. 'Add value' appends an empty choice and saves; the X icon removes a choice by index; normalizeChoices trims, drops blanks, and de-dupes before display. The trash icon removes the entry by reference. No confirmation on any deletion.
- **Edge cases:**
  - A blank-name entry and blank choices are saved immediately before the user types.
  - Duplicate names/choices are not detected (findAutoProperty returns the first; normalizeChoices de-dupes at display).
  - Tag-backed Auto Properties must be named with leading '#'.
  - Description snapshotted via untrack at picker mount, so concurrent edits show the old description.
  - No delete confirmation; no undo.
- **Risks / test focus:**
  - New entries and each 'Add value' click persist empty name/choices to disk before typing, piling up invisible blanks (AutoPropertiesModalContent.svelte:46,61).
  - Name matching is case-sensitive but Obsidian keys are case-insensitive, so 'Status' never matches a 'status' field (autoProperties.ts:19).
  - Leading/trailing whitespace in the name silently disables the property.
  - No delete confirmation anywhere; no undo.

### AUTO-03 - Set Auto Property selection type (Single vs Multi) with legacy fallback

- **Story:** As a user, I want to choose whether an Auto Property picks one or multiple values, and I want my pre-type-field entries to keep working under my global EditMode.
- **Entry point:** settings | **Platform:** both
- **Expected behavior:** A Single/Multi dropdown sets property.type and saves. The explicit type is authoritative: Multi is always multi-select, Single always single-select even overriding global AllMulti. autoPropertyType returns 'Single' for a missing type; isMultiAutoProperty treats a missing type as inheriting the global EditMode (AllMulti -> true; SomeMulti with the property listed -> true; else false). New entries always set type:'Single'.
- **Edge cases:**
  - Legacy entries without type are treated as Single but inherit EditMode for multi-ness.
  - Under SomeMulti, a legacy entry is multi only if its name is in EditMode.properties.
  - Explicit type:'Single' overrides AllMulti.
  - API validateAutoProperties does not add a type to legacy entries.
- **Risks / test focus:**
  - A Single-typed Auto Property on a key globally set to AllMulti stays scalar (intentional) but may surprise.
  - A new UI-created entry always gets type:'Single', silently overriding AllMulti, so old vs new entries behave differently under the same global setting.

### AUTO-04 - Paste a newline- or comma-separated list into a choice field

- **Story:** As a user, I want to paste a list of values into one choice input so an entire list is imported at once.
- **Entry point:** settings | **Platform:** both
- **Expected behavior:** On paste, pasteChoices() calls splitPastedChoices(): fewer than 2 tokens falls through as normal text; 2+ tokens calls preventDefault and withChoicesPasted to replace the pasted row with the token list, dropping tokens duplicating existing or within-paste choices. Splitting: any newline -> split on lines (preserving comma values); otherwise split on commas. Saves immediately.
- **Edge cases:**
  - Single-token paste falls through to default browser paste.
  - A comma-containing value on its own line is preserved when pasted with other newline-separated values.
  - A lone 'Doe, Jane' with no newline splits into two tokens.
- **Risks / test focus:**
  - A single comma-containing value pasted without newlines (e.g. '1,000') is silently split into two tokens (autoProperties.ts:84).
  - An all-blank paste returns [] (length < 2) and falls through, entering the empty string literally.

### AUTO-05 - Pick a single preset value, or use/save a custom value (single mode)

- **Story:** As a user, I want a filterable picker when I edit a Single-type Auto Property so I can choose a preset value, or type a custom value and either use it once or permanently add it to the choice list.
- **Entry point:** edit-meta-menu | **Platform:** both
- **Expected behavior:** editAutoProperty opens AutoPropertyValueModal in single mode with the property name as title and optional description. Typing filters choices case-insensitively (substring); arrow keys/hover move highlight; Enter or click selects and writes the value. When no exact match exists, a 'Use "<query>"' row (kind='use') submits without persisting, and a 'Save "<query>" as a choice' row (kind='save') calls persistChoices([value]) before submit. persistChoices invokes persistAutoPropertyChoices, which locates the Auto Property in live settings (by reference, then by name), calls withChoiceAdded per value, and saveSettings(). Persistence is best-effort: on failure the error is logged but the value is still written.
- **Edge cases:**
  - No choices: empty-state message 'No choices defined - type a value and press Enter.'
  - Empty query lists all choices.
  - Enter with a non-empty query but no filtered matches submits the trimmed query.
  - Use/Save rows appear only when the trimmed query is non-empty with no exact case-insensitive match.
  - withChoiceAdded trims and skips duplicates.
  - If the Auto Property was deleted while open, persist silently no-ops (idx === -1).
- **Risks / test focus:**
  - Case-insensitive exact-match suppresses the Use/Save rows ('Todo' vs 'todo') (AutoPropertyValueModalContent.svelte:46).
  - Choices snapshotted via untrack at mount; concurrently added choices are invisible.
  - If the Auto Property is renamed while the picker is open, both the by-reference and by-name lookups miss and the save silently does nothing (metaController.ts:416).
  - persistChoices rejection is swallowed; the modal still closes and the value is still written with no feedback the save failed.

### AUTO-06 - Pick, confirm, and optionally persist multiple values (multi mode)

- **Story:** As a user, I want a checkbox list when an Auto Property is Multi so I can select/deselect multiple values, add new ones inline, confirm them as a list, and optionally persist the new ones back to the choice list.
- **Entry point:** edit-meta-menu | **Platform:** both
- **Expected behavior:** multiSelectOptions builds current property values first (existing order), then defined choices not already present; values not in the defined choices show a 'new' badge. Pressing Enter appends the trimmed value to options (if absent, case-sensitive) and to checkedValues. Confirm filters options to checkedValues (preserving option-list order, not check order). When any checked value is not a snapshotted choice, an 'Also add new values to this property's choice list' checkbox appears; checking it calls persistChoices(newCheckedValues) before submit. YAML properties store a real array; inline/tag fields join with ', '.
- **Edge cases:**
  - Pre-existing non-choice values appear first and are never dropped.
  - Null/empty current value starts with defined choices.
  - Unchecking all submits an empty array.
  - A blank/whitespace inline-add query is rejected.
  - The 'save new' checkbox appears only when newCheckedValues.length > 0; saveNew defaults to false.
- **Risks / test focus:**
  - Submission order follows option order, not check order, so checking B before A still writes [A, B] (AutoPropertyValueModalContent.svelte:122).
  - checkedValues initialized via toValueArray splits a CSV scalar, so 'item one, item two' becomes two checked values.
  - options.includes for inline add is case-sensitive, so 'todo' when 'Todo' exists adds a distinct entry (svelte:109).
  - No options filtering while typing in multi mode; no Select all / Clear all affordance.
  - newCheckedValues compares against the mount-time choices snapshot, so a concurrently added choice can be re-persisted as a duplicate (deduped on write).

### AUTO-07 - Cancel the value picker without changing the property

- **Story:** As a user, I want to dismiss the value picker without changing the property so accidental opens do not modify my notes.
- **Entry point:** edit-meta-menu | **Platform:** both
- **Expected behavior:** Closing without submitting (Escape, backdrop, X) calls onClose(); didSubmit is false so resolvePromise(null) fires. editAutoProperty returns early when result === null and the file is not written.
- **Edge cases:**
  - result is initialized to null, so a close without submit always resolves null.

### AUTO-08 - Auto Property hook for editing a nested tag's last segment

- **Story:** As a user, I want the value picker to appear when I choose 'Edit last segment' on a nested body tag whose parent path has an Auto Property, so I can pick a preset leaf value.
- **Entry point:** edit-meta-menu | **Platform:** both
- **Expected behavior:** In editTag, when mode is 'leaf' and getActiveAutoProperty(tagParent(tag)) (e.g. '#area') matches, handleAutoProperties is called instead of GenericPrompt. The returned value (string, or string[] joined with ', ') becomes the new leaf and is fed to computeTagRewrite.
- **Edge cases:**
  - The Auto Property must be named with leading '#' to match.
  - Cancelling the modal returns null and editTag returns early.
  - A multi-select join with ', ' can produce an invalid tag name.
- **Risks / test focus:**
  - A multi-select leaf joined with ', ' produces an invalid tag (e.g. '#area/val1, val2'); the leaf-mode auto-property path can short-circuit before isValidTagToken validation, writing an invalid tag silently (metaController.ts:179).

### AUTO-09 - Read and write Auto Properties via the public API

- **Story:** As a plugin developer, I want to read and write Auto Properties programmatically so I can automate preset-choice management.
- **Entry point:** api | **Platform:** both
- **Expected behavior:** getAutoProperties() returns a deep clone of the current array. setAutoProperties(arr) validates (throws TypeError for non-array, non-object entries, non-string-array choices, non-string names, invalid type), then replaces the live settings and saveSettings(); on save failure it rolls back. Writes are serialized through settingsWriteQueue. type must be 'Single', 'Multi', or undefined.
- **Edge cases:**
  - Empty array clears all Auto Properties.
  - Validation strips unknown fields (only name, choices, description, type survive).
  - Undefined description/type are not copied, preserving legacy entries.
  - getAutoProperties returns all entries regardless of the enabled flag.
- **Risks / test focus:**
  - TypeError propagates out of enqueueSettingsWrite; external plugins not catching it get an unhandled rejection (MetaEditApi.ts:293).
  - Empty choices array and empty-string name are accepted, creating a silently inoperative Auto Property (MetaEditApi.ts:302-306).
  - setAutoProperties replaces the entire list (no merge/patch), so concurrent callers overwrite each other even through the queue.
  - No API to read the enabled flag, so callers cannot tell whether the feature is active.

## Progress Properties automator

### PROG-01 - Enable/disable Progress Properties globally

- **Story:** As a user, I want to toggle Progress Properties on or off so automatic property updates only run when I want them.
- **Entry point:** settings | **Platform:** both
- **Expected behavior:** The toggle reads/writes ProgressProperties.enabled. On change it calls plugin.toggleAutomators(): true attaches a ProgressPropertyHelper to the automator manager; false detaches by type. Then saveSettings(). A same-value guard prevents double saves; attaching the same type twice is guarded with a warning.
- **Edge cases:**
  - Disabling while a debounced update is pending does not cancel the in-flight notifyAutomators.
  - Repeated rapid toggles are safe due to the isExist guard.
- **Risks / test focus:**
  - An external settings change (e.g. sync) that sets enabled without the toggle UI is ignored until the tab is re-opened (metaEditSettingsTab.ts:58).
  - A startup race where attach runs before startAutomators registers the vault event is possible if load order changes (main.ts:76-85).

### PROG-02 - Add, name, type, and remove progress property rules

- **Story:** As a user, I want to add, name, type (Total/Completed/Incomplete), and remove progress property rules so each configured frontmatter key gets the right task count.
- **Entry point:** settings | **Platform:** both
- **Expected behavior:** 'Add' pushes {name:'', type:'Total Tasks'} and immediately saves. The name input saves on change (blur/Enter), not per keystroke. A type select offers 'Total Tasks'/'Completed Tasks'/'Incomplete Tasks' mapping to counts.total/complete/incomplete. The X button removes a rule by reference and saves. No confirmation. progressPropHelper matches rules by strict prop.key === name.
- **Edge cases:**
  - New rule saved immediately with an empty name; an empty-name rule never matches but persists.
  - Name save is on change, so closing the tab without blurring can lose the last-typed name.
  - Case-sensitive exact match: 'Progress' does not match a 'progress' frontmatter key.
  - Unrecognized type values are silently skipped (default: break).
  - No remove confirmation.
- **Risks / test focus:**
  - meta.find(prop => prop.key === el.name) is case-sensitive with no trim; a trailing space silently breaks the mapping with no UI feedback (metaController.ts:268).
  - Name input saves on change not input, so unblurred edits are lost (ProgressPropertiesModalContent.svelte:47).
  - The type switch default:break swallows stale enum values silently; human-readable enum strings break configs if ever renamed.
  - Duplicate names write the property twice sequentially.

### PROG-03 - Automatically update task counts on file modify

- **Story:** As a user, I want configured progress properties updated automatically whenever I save a markdown file so task-count frontmatter stays current.
- **Entry point:** automatic | **Platform:** both
- **Expected behavior:** On vault modify, OnFileModifyAutomatorManager.onFileModify skips non-markdown and Excalidraw files, skips files with no frontmatter, dedups via UpdatedFileCache (set() returns false and bails when stored content equals the new cachedRead content, with 5-minute eviction), enqueues in UniqueQueue, and fires a 5000ms-debounced notifyAutomators. ProgressPropertyHelper then reads listItems (li.task) from the metadata cache, counts completed as li.task != ' ', and pushes matching properties into updateMultipleInFile.
- **Edge cases:**
  - Null/undefined listItems: handleProgressProps returns early with no retry.
  - Files with no frontmatter are skipped entirely, even if they have matching inline fields.
  - Debounce is a hardcoded 5000ms; rapid saves coalesce to one update.
  - A configured property absent from frontmatter is never auto-created.
  - An identical-content re-save is skipped by the content cache.
- **Risks / test focus:**
  - The 'frontmatter != null' guard means automation never fires on frontmatter-free files even if they have the property as an inline field (onFileModifyAutomatorManager.ts:62).
  - tasks.filter(i => i.task != ' ') treats any non-space char (including tab/NBSP) as complete, inflating the complete count (metaController.ts:216).
  - listItems may be stale immediately after a save (no wait/retry) (metaController.ts:211).
  - Only existing frontmatter properties are updated; missing ones are silently skipped, never created.
  - After a property write, the next modify event has different content, so the cache guard passes and re-runs; if counts differ on every save this risks a write -> re-trigger -> write loop (onFileModifyAutomatorManager.ts:68-69).

### PROG-04 - Exclude Excalidraw files from all automators

- **Story:** As a user, I want the automator to skip Excalidraw files so MetaEdit does not conflict with Excalidraw's auto-save.
- **Entry point:** automatic | **Platform:** both
- **Expected behavior:** In onFileModify, if any frontmatter key (case-insensitive substring) contains 'excalidraw', the function returns early without enqueuing. This applies to all automators (Kanban and Progress).
- **Edge cases:**
  - Substring match: a user key like 'last-excalidraw-session' triggers exclusion.
  - Exclusion applies to both automators.
- **Risks / test focus:**
  - A legitimate frontmatter key containing 'excalidraw' permanently excludes the file from all automators with no warning or override (onFileModifyAutomatorManager.ts:64).

### PROG-05 - Progress property rules persist across plugin reload

- **Story:** As a user, I want my configured progress property rules saved persistently so they remain active after restarting Obsidian.
- **Entry point:** automatic | **Platform:** both
- **Expected behavior:** Every save callback calls plugin.saveSettings() after updating ProgressProperties.properties. At load, toggleAutomators() attaches ProgressPropertyHelper when ProgressProperties.enabled is true, using the persisted properties.
- **Edge cases:**
  - If ProgressProperties is missing from stored data, the plugin must deep-merge defaults or handleProgressProps crashes on destructure.
- **Risks / test focus:**
  - No inline defaults in the settings interface; if loadSettings did not deep-merge defaults, an upgrading user without ProgressProperties would crash in handleProgressProps (metaController.ts:208).
  - ProgressPropertiesModalContent.svelte:17 throws if initialProperties is undefined; safe only because the prop default is [].

## Ignored Properties / Edit Meta menu filtering

### IGN-01 - Master toggle for Edit Meta menu filtering

- **Story:** As a user, I want a single on/off toggle for menu filtering so I can disable all property hiding without losing my configured ignore list.
- **Entry point:** settings | **Platform:** both
- **Expected behavior:** When IgnoredProperties.enabled is false, filterMenuItems returns a shallow copy of the full list unchanged (no ignored keys dropped, hideFileTags ignored). When true, both filters apply. Toggling calls this.display() to re-render and conditionally show the sub-settings (hideFileTags toggle + ignored-key table).
- **Edge cases:**
  - When disabled, a configured ignore list and hideFileTags=true have zero effect.
  - Turning the toggle off collapses the sub-panel; turning it on re-mounts the Svelte sub-panel.
- **Risks / test focus:**
  - The gear extra-button is always rendered; when disabled, div is undefined and toggleHiddenEl(undefined, ...) is a no-op, so the button is visible/clickable but does nothing (metaEditSettingsTab.ts:146).
  - this.display() destroys and re-mounts all Svelte components, losing unsaved edits in other open panels.

### IGN-02 - Hide specific properties by exact key name

- **Story:** As a user, I want to list specific property names to hide from the Edit Meta menu so internal or auto-managed keys never clutter the picker.
- **Entry point:** settings | **Platform:** both
- **Expected behavior:** When enabled, filterMenuItems builds a Set from ignoredProperties and removes any Property whose key is in the set (exact, case-sensitive). This applies to any property type, including body tags and a frontmatter tags key. The list is stored in IgnoredProperties.properties and edited via the SingleValueTableEditorContent table.
- **Edge cases:**
  - Exact, case-sensitive match: 'Status' and 'status' differ.
  - A body #tag can be hidden by exact key (e.g. '#project'), independent of hideFileTags.
  - Empty list with feature enabled only applies hideFileTags.
- **Risks / test focus:**
  - No validation/normalization of entered keys; a trailing space or case mismatch silently never matches.
  - Tag keys from the cache include '#', so entering 'done' to hide '#done' fails the exact match with no UI hint.
  - The same list hides both YAML props and body tags by key, so 'status' may unintentionally hide a body '#status'.
  - Settings changes do not refresh an already-open suggester.
  - The standalone IgnoredPropertiesModal appears to be dead code.

### IGN-03 - Hide all body #tags via hideFileTags

- **Story:** As a user, I want to hide all body #tags from the Edit Meta menu while keeping the frontmatter tags property editable so I can focus on structured metadata.
- **Entry point:** settings | **Platform:** both
- **Expected behavior:** When enabled and hideFileTags is true, filterMenuItems drops every Property whose type is Tag. A frontmatter tags key (type YAML) is unaffected. The sub-toggle is labeled 'Hide file tags' with description 'A frontmatter tags property stays editable.' and only renders when the feature is enabled. Saved immediately on change.
- **Edge cases:**
  - If all items are body tags and hideFileTags is on, the filtered list is empty but the two option rows still show.
  - hideFileTags removes only Tag entries; Dataview fields are unaffected.
  - A frontmatter tags key is always shown regardless of hideFileTags.
- **Risks / test focus:**
  - The hideFileTags sub-toggle only renders when the master toggle is on; disabling the master toggle silently re-exposes tags and hides the sub-toggle's current state (metaEditSettingsTab.ts:142).
  - hideFileTags is silently ignored when enabled is false, which can confuse users.

### IGN-04 - Structure-edit actions gated by property type (canStructureEditProperty)

- **Story:** As a user, I want the X delete and transform buttons to appear only on properties that support them so I am not offered destructive actions that would corrupt my note.
- **Entry point:** edit-meta-menu | **Platform:** both
- **Expected behavior:** canStructureEditProperty returns false for type Tag (body tags have no key: line), and for nested (isNested) or virtual (isVirtual) YAML rows. All other properties (plain YAML, Dataview) return true. renderSuggestion creates the X and transform buttons only when it returns true.
- **Edge cases:**
  - A body tag is shown (when hideFileTags off) with no action buttons.
  - YAML parent containers are filtered out of the list entirely.
  - Nested/virtual rows are excluded from structure edits even if they pass the ignore filter.
- **Risks / test focus:**
  - transformProperty re-checks canStructureEditProperty as a redundant guard, blurring where the authoritative gate is.
  - If a body tag ever passed the check, deleteProperty would do a key-based delete on a tag span (menuFilter.test.ts BUG-5).
  - MetaType.Option falls through to the !isNested && !isVirtual check and would return true, possibly incorrectly.

### IGN-05 - Filtering applied at suggester construction (snapshot semantics)

- **Story:** As a user, I want the Edit Meta menu to open with already-filtered properties so ignored keys never appear even briefly.
- **Entry point:** command | **Platform:** both
- **Expected behavior:** In the MetaEditSuggester constructor, filterMenuItems runs once with the current IgnoredProperties settings; the result (further filtered to remove YAML parent containers) is stored as this.data. getItems() returns the fixed options prepended, then this.data. All subsequent operations use this snapshot.
- **Edge cases:**
  - Settings changed while the suggester is open do not affect the open suggester.
  - suggestValues for the new-property name autocomplete is built from the filtered this.data.
- **Risks / test focus:**
  - The suggester snapshots settings at open; changing settings and re-opening without closing first may surprise users.
  - Ignored properties are treated as not-present for suggestValues, so a hidden key can re-appear as a 'new' property suggestion (metaEditSuggester.ts:175).

### IGN-06 - Migrate ignored-properties settings: auto-enable + backfill hideFileTags

- **Story:** As an existing user upgrading from before hideFileTags existed, I want my observed behavior preserved (the ignore list was always active) so my filtering is not silently lost.
- **Entry point:** automatic | **Platform:** both
- **Expected behavior:** On load, migrateIgnoredProperties fires once when the stored IgnoredProperties lacks hideFileTags. If enabled is false and the list is non-empty, it flips enabled to true. In all pre-version cases it returns true so saveSettings persists the normalized shape (with hideFileTags:false) exactly once; afterward the migration never fires again. mergeSettings separately backfills hideFileTags from defaults via a one-level-deep spread (structuredClone of defaults).
- **Edge cases:**
  - enabled:false + empty list: normalizes, enabled stays false.
  - enabled:false + non-empty list: enabled set to true.
  - Post-version data with hideFileTags present: no change.
  - Fresh install (null data): no save.
  - Entirely absent sections are backfilled in full; unknown future keys preserved.
  - Only one level of nesting is merged.
- **Risks / test focus:**
  - The migration mutates settings in place; if saveSettings fails, in-memory is migrated but disk is not, so it fires again next load (idempotent but surprising) (settingsMigration.ts:69-72).
  - Detection relies solely on hideFileTags === undefined; a future field could re-trigger an unintended enable (fragile sentinel).
  - mergeSettings is one-level-deep only; a future nested sub-field would not be backfilled (settingsMigration.ts:27).

## Value prompt + suggesters

### PROMPT-01 - Generic text prompt for value entry

- **Story:** As a user, I want a modal where I can type or edit a property value so I can change frontmatter and inline fields without leaving the note.
- **Entry point:** automatic | **Platform:** both
- **Expected behavior:** GenericPrompt.Prompt() opens an Obsidian Modal mounting GenericPromptContent.svelte with a header, optional placeholder, optional seed value, and optional suggestValues. Enter closes and resolves the typed string; Escape/close-without-submit resolves null (never rejects). The input auto-focuses and (for text inputs) auto-selects on open.
- **Edge cases:**
  - Cancel resolves null, not rejection; callers must check null.
  - Date inputs are guarded from select().
  - Empty propValue defaults to '' so the input starts empty.
- **Risks / test focus:**
  - GenericPrompt.ts:49 uses activeDocument.querySelector('.metaEditPrompt'), a global query; with two MetaEdit modals open it could focus the wrong input.
  - Double focus/select from both onOpen() and the Svelte $effect is fragile.
  - The component is mounted before the Promise is constructed, an implicit ordering assumption.

### PROMPT-02 - Native date / datetime picker for date-typed YAML properties

- **Story:** As a user, I want a native date or datetime picker when editing a YAML property typed as date/datetime in Obsidian, with seconds preserved when present.
- **Entry point:** automatic | **Platform:** both
- **Expected behavior:** getDateInputType() returns 'date' when the property is YAML, Obsidian reports its type as 'date' (assigned widget > registry > inferred), and the value is empty or matches ^\d{4}-\d{2}-\d{2}$; returns 'datetime' for type 'datetime' matching ^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$. The input renders as date or datetime-local. When the existing value has seconds, step='1' is added; otherwise step is undefined. Non-ISO free text falls back to a plain text input preserving the value.
- **Edge cases:**
  - A date-only value on a datetime property returns null (text fallback).
  - metadataTypeManager absent returns null (text).
  - Null/undefined values are treated as empty and still get the picker.
  - Only YAML gets the picker; Dataview date fields do not.
- **Risks / test focus:**
  - The seconds-step regex tests initialValue not the submitted value, so adding seconds in a minute-precision picker may be truncated by some browsers (GenericPromptContent.svelte:45).
  - The two datetime regexes are asymmetric (one allows optional seconds, the step check requires them).
  - readObsidianType calls three runtime APIs with no partial-availability guards; a thrown internal error is silently swallowed to null (valueSuggest.ts:196-210).

### PROMPT-03 - Value autocomplete for YAML properties and body tags

- **Story:** As a user, I want the value prompt to suggest values already used for a YAML property across my vault, and existing vault tag names when renaming a body tag, so I can pick consistent values rather than retyping.
- **Entry point:** suggester | **Platform:** both
- **Expected behavior:** When opened for a YAML property, setPendingValueContext sets {key, type}; GenericPromptContent calls getValueSuggestions(app, key, YAML), scanning all vault markdown files, collecting values for the key (flattening arrays, coercing numbers, skipping null/undefined/objects/empty), ranked by frequency then alphabetically. For a body-tag rename, the context has type Tag and tagMode 'rename' or 'leaf': 'rename' uses collectTagFullCounts (metadataCache.getTags(), '#'-stripped, ranked by count); 'leaf' uses collectTagLeafCounts (last '/' segment, merged across parents); 'tracker' clears the context so no tag autocomplete shows. GenericTextSuggester filters case-insensitively; the dropdown caps at 100 rendered items.
- **Edge cases:**
  - Dataview fields always return [] suggestions by design.
  - YAML array values flattened element-wise; numeric values coerced to string.
  - getTags() is accessed via type assertion; if removed, tag suggestions become empty.
  - Leaf mode merges identical leaf segments from different parent paths.
  - A sourcing error degrades to [] silently.
- **Risks / test focus:**
  - getValueSuggestions scans every markdown file synchronously on each prompt open, causing UI lag in large vaults (valueSuggest.ts:162).
  - Inline Dataview values for the same key are excluded, giving an incomplete picture.
  - collectFrontmatterValueCounts can surface metadata if a property is literally named 'position'.
  - If the tracker-mode context-clear line were removed/reordered, tracker prompts would wrongly show tag autocomplete (metaController.ts:183).
  - The current tag being renamed appears in its own suggestion list with no dedup.

### PROMPT-04 - Dropdown discovery, filtering, and acceptance behavior

- **Story:** As a user, I want the suggestion dropdown to open immediately on an empty prompt, filter as I type by case-insensitive substring, and fill the input on acceptance so I can browse and pick values quickly.
- **Entry point:** automatic | **Platform:** both
- **Expected behavior:** When the seed value is empty, refreshSuggestions() triggers an input event so the dropdown opens immediately; when seeded, it stays quiet so Enter submits the current value. getSuggestions delegates to filterSuggestions: item.toLowerCase().includes(query.toLowerCase()), sliced to MAX_RENDERED_SUGGESTIONS (100); a single match equal to the input collapses the dropdown. acceptSuggestion calls setValue(item), triggers an 'input' event to sync Svelte, and closes the dropdown; the modal stays open until Enter.
- **Edge cases:**
  - Seeded prompt: dropdown quiet on open; Enter submits the seed in one keystroke.
  - A single exact match collapses the dropdown.
  - Filtering runs over the full set before the 100-cap.
  - Substring only, no fuzzy matching.
- **Risks / test focus:**
  - The 100-item cap can hide less-common matches even for a specific query (valueSuggest.ts).
  - filterSuggestions uses strict equality for the collapse check, so typing 'reading' when only 'Reading' exists keeps a redundant entry open (valueSuggest.ts:126).
  - acceptSuggestion fires 'input' after setValue; if AbstractInputSuggest already fires it, a double-filter cycle can briefly show stale results.
  - refreshSuggestions relies on inputEl.trigger('input'), an Obsidian-specific method; its removal would silently break discovery mode.

### PROMPT-05 - promptValueContext bridge between suggester and prompt

- **Story:** As a developer, I want the property being edited to flow from the suggester to the value prompt without polluting the controller's write path, so autocomplete is correct while UI concerns stay out of core logic.
- **Entry point:** automatic | **Platform:** both
- **Expected behavior:** promptValueContext.ts holds a module-level singleton 'pending'. metaEditSuggester sets {app, key, type} before editMetaElement and clears it in a finally block. GenericPromptContent consumes (reads and nullifies) the context on mount. metaController also sets/clears the context directly for tag edits.
- **Edge cases:**
  - metaController's tag-edit set/clear has no try/finally; it relies on the prompt closing normally.
  - consumePendingValueContext is called once on Svelte mount.
  - bulk prompts open GenericPrompt without setting any context (by design).
- **Risks / test focus:**
  - metaController.ts:183-191 sets/clears context without try/finally; if GenericPrompt.Prompt throws or is interrupted, the context leaks into the next unrelated prompt (concrete bug risk).
  - The pending context is a module-level singleton; a stale context could survive a plugin reload and corrupt the first prompt.
  - Two suggesters open at once (two panes) can overwrite each other's context (metaEditSuggester onChooseItem).

### PROMPT-06 - Generic pick-one suggester (GenericSuggester)

- **Story:** As a user, I want a fuzzy-search pick-one modal for choosing an action or list position so I can quickly select an option by typing to filter.
- **Entry point:** suggester | **Platform:** both
- **Expected behavior:** GenericSuggester.Suggest(app, displayItems, items) opens a FuzzySuggestModal; displayItems are shown, items are returned on select (index-matched). onChooseItem resolves the promise with the value. On close without choosing, a queueMicrotask defers resolution to '' (empty string) so the caller gets a falsy sentinel rather than a pending promise.
- **Edge cases:**
  - The microtask deferral lets a keyboard selection settle before onClose resolves to ''.
  - Mismatched displayItems/items lengths make getItemText return undefined, rendering 'undefined' in the modal.
- **Risks / test focus:**
  - GenericSuggester resolves to '' on cancel, not null; a caller checking result === null would treat cancel as an empty-string selection (the type is Promise<string>, so TS does not enforce the check).
  - displayItems/items length mismatch silently shows 'undefined' text.

## Nested YAML path editing

### YAML-01 - Read a nested YAML value by dotted path or segment array (parse, walk, format)

- **Story:** As a plugin author, I want to read a deeply-nested frontmatter value by a dotted string ('contributors[1].role') or a segment array (for keys with literal dots), and round-trip paths, without parsing YAML myself.
- **Entry point:** api | **Platform:** both
- **Expected behavior:** parseYamlPath splits a string on '.' and reads each part as a property-name match followed by zero or more '[N]' (numeric indexes); an array is used verbatim. getYamlPath walks the live frontmatter from parseFrontmatterObject (cachedRead preferred over cache); a missing path throws YamlPathError, which the controller catches and returns undefined. formatYamlPath round-trips numeric segments as [N] and joins strings with '.'. No frontmatter returns undefined; non-YamlPathError errors are re-thrown. Bracket paths without a leading name, or non-numeric bracket content, throw.
- **Edge cases:**
  - No frontmatter -> undefined.
  - A key with dots needs the segment-array form.
  - 'contributors[1].role' -> ['contributors', 1, 'role']; 'key[1][2]' -> ['key', 1, 2].
  - '[0].name' and 'key[abc]' throw.
  - Empty/whitespace/trailing-dot path throws synchronously before any read.
  - Only leading/trailing whitespace is trimmed; internal spaces are kept.
- **Risks / test focus:**
  - A non-string/non-array path (runtime JS) throws, and the controller only catches YamlPathError, so callers get an unhandled rejection (yamlPath.ts:20).
  - Only YamlPathError is swallowed to undefined; a vault read failure inside parseFrontmatterObject is re-thrown, inconsistent with the 'undefined on miss' contract (metaController.ts:631-633).
  - 'a . b' yields ['a ', ' b'] with embedded spaces that silently fail to match rather than throwing (yamlPath.ts:22-23).
  - formatYamlPath accepts a numeric first segment and formats '[0]', which parseYamlPath then rejects, breaking the round-trip (yamlPath.ts:34-40).

### YAML-02 - Update an existing nested YAML value with update-only semantics (updateYamlPath)

- **Story:** As a plugin author, I want to overwrite a nested value I know exists, with a hard error if the path is missing rather than silently creating data.
- **Entry point:** api | **Platform:** both
- **Expected behavior:** controller.updateYamlPath calls setYamlPath with createParents:false, createLeaf:false. A missing parent or leaf throws YamlPathError ('does not exist'/'is not an object'/'out of range'), which propagates unhandled (no Notice). The write is enqueued per-file. No optimistic-concurrency (expectedValue) is applied.
- **Edge cases:**
  - Parent is a scalar -> 'is not an object'.
  - Array index out of range -> 'out of range'.
  - No frontmatter -> processFrontMatter creates empty frontmatter, then setYamlPath fails because createLeaf:false.
- **Risks / test focus:**
  - Errors bubble out of enqueueFileWrite with no Notice or logging, unlike the UI path; callers get an unhandled rejection with no user feedback (metaController.ts:637-644).
  - Unlike updatePropertyInFile, updateYamlPath does not pass validateExpectedValue, so concurrent edits to the same nested path are unguarded.

### YAML-03 - Upsert a nested YAML value with optional parent creation (addOrUpdateYamlPath)

- **Story:** As a plugin author, I want to set a nested value and have missing intermediate objects created if desired, without knowing whether the key already exists.
- **Entry point:** api | **Platform:** both
- **Expected behavior:** controller.addOrUpdateYamlPath defaults createParents to true and calls setYamlPath with {createParents}; createLeaf is not passed (uses the yamlPath default). Missing object parents are created as {} when createParents is true. Array parents cannot be auto-created: createMissingParent throws 'Cannot create array parent ... Array creation is not supported.' when the next segment is numeric, regardless of createParents. Earlier object parents created in the same call are already written to the root before the error.
- **Edge cases:**
  - No options -> createParents true (more permissive than updateYamlPath).
  - createParents:false behaves like updateYamlPath but still allows creating the leaf.
  - 'a[0].name' where 'a' is missing, or 'a.b[0].name' where 'b' is missing -> rejected.
  - Out-of-range index on an existing array -> a different 'out of range' error.
  - Overwriting an existing parent container with a scalar is allowed.
- **Risks / test focus:**
  - createParents defaults to true, silently creating missing YAML structure on a mistyped path (metaController.ts:654).
  - createLeaf is not forwarded from options and not set in the setYamlPath call; if the yamlPath default is false this contradicts the 'add or update' name (metaController.ts:658).
  - MetaEditYamlPathOptions exposes only createParents; createLeaf, expectedValue, and validateExpectedValue are not surfaced.
  - When multiple intermediate objects are created before a failing array segment, each {} is already written into the root; if Obsidian does not suppress the partial mutation, frontmatter is left partially written (yamlPath.ts:163-171).

### YAML-04 - Block interactive editing of a YAML parent-container value

- **Story:** As a user, I want the edit menu to refuse to edit a YAML key whose value is a nested object or a mixed array so I do not clobber structured data with a plain-text replacement.
- **Entry point:** edit-meta-menu | **Platform:** both
- **Expected behavior:** isYamlParentContainerValue is true for plain objects and for arrays containing at least one plain object or nested array. When a property passes this, editMetaElement shows a Notice ('Nested YAML parent cannot be edited as a text value') and returns without opening an editor. Flat scalar arrays remain editable.
- **Edge cases:**
  - Array of strings -> editable.
  - Array of objects, or mixing scalars and one object -> blocked.
  - Null -> editable (not a container).
  - Empty object {} -> blocked.
- **Risks / test focus:**
  - isYamlParentContainerValue scans only one level via .some(), so deeper nested arrays are also blocked (conservative but not wrong) (yamlPath.ts:116).
  - The guard only checks the property being edited; a virtual nested scalar leaf reaching editMetaElement (e.g. via a plugin calling update with a path property) proceeds because the isVirtual check returns false for it (metaController.ts:119-124).

### YAML-05 - Update a nested YAML leaf with optimistic concurrency (UI / update path)

- **Story:** As a plugin author or UI user, I want writes to a nested YAML leaf to use optimistic-concurrency validation so a value changed between read and write is rejected rather than silently overwritten.
- **Entry point:** api | **Platform:** both
- **Expected behavior:** updatePropertyInFile, when property.path.length > 1, calls setYamlPath with createParents:false, createLeaf:false, expectedValue:property.content, validateExpectedValue:true. If the current value does not Object.is-equal the expected, setYamlPath throws 'current value changed before update'. The UI path catches it and shows a Notice; the API path propagates it. A length-1 path falls through to a plain frontmatter[key]=value assignment with no optimistic check.
- **Edge cases:**
  - Date expectedValue uses getTime() equality.
  - NaN round-trips via Object.is.
  - undefined expectedValue + missing key is blocked earlier by createLeaf:false.
  - Length-1 path uses plain assignment, no optimistic check.
- **Risks / test focus:**
  - Optimistic check only fires for path.length > 1; top-level keys have no concurrency protection (metaController.ts:437-443).
  - yamlValuesEqual uses Object.is for non-Date values, so object/array leaf values always compare unequal by identity, making validateExpectedValue useless for non-primitive leaves (yamlPath.ts:200-203).

### YAML-06 - Bulk-write nested YAML paths without creating new keys

- **Story:** As a plugin author using the batch API, I want nested-path properties in a batch written with strict update-only semantics so bulk operations never silently create unexpected keys.
- **Entry point:** api | **Platform:** both
- **Expected behavior:** In updateMultipleInFile, setYamlPath is called with createParents:false, createLeaf:false for each property with a path of length > 1. Simple keys use plain frontmatter[key]=value. All YAML properties in a batch share one processFrontMatter call. validateExpectedValue is NOT used in the bulk path.
- **Edge cases:**
  - One failing property's exception escapes the processFrontMatter callback; partial writes are possible.
  - A plain key written before a nested path targeting the same root can overwrite the object first.
- **Risks / test focus:**
  - yamlProperties are written before yamlPathProperties with no guard against one being the parent of the other ('is not an object' error) (metaController.ts:578-586).
  - Bulk nested writes have no optimistic-concurrency protection, unlike the single-property path (metaController.ts:584).

## Tag editing

### TAG-01 - Rename a flat body tag

- **Story:** As a user, I want to rename an inline #tag in the note body so I can correct or update a tag without editing raw text.
- **Entry point:** suggester | **Platform:** both
- **Expected behavior:** Selecting a Tag item routes to editTag. For a flat tag the only action is 'Rename tag' (no action picker), opening a prompt 'Rename <tag> to' seeded with the tag minus '#'. computeTagRewrite(tag, input, 'rename') strips a leading '#' and returns #<normalized>. If the result equals the original or is empty, the write is skipped. isValidTagToken validates the token; invalid tokens show a Notice and abort. spliceTag replaces only the exact byte span from cache.tags, leaving all other text intact.
- **Edge cases:**
  - Blank input cancels silently.
  - Leading '#' is idempotent.
  - A nested path like 'area/new' is honored in rename mode.
  - No-change (newToken === tag) is skipped.
  - isValidTagToken rejects dots, spaces, commas, and purely numeric tokens.
- **Risks / test focus:**
  - The no-change guard compares full token strings, so a coincidental match silently no-ops (metaController.ts:196).
  - The tag-body character class /^[\p{L}\p{N}_/-]+$/u has an unescaped '/-' that V8 treats leniently but a stricter engine could mishandle (tagEditing.ts:115).

### TAG-02 - Rename the leaf segment of a nested body tag

- **Story:** As a user with a nested tag like #area/project, I want to rename only the last segment so I can reorganize sub-tags without retyping the hierarchy.
- **Entry point:** suggester | **Platform:** both
- **Expected behavior:** For a nested tag, the action picker includes 'Edit last segment'. It opens a prompt 'Change the last segment of <tag> to' seeded with the current leaf. computeTagRewrite(tag, input, 'leaf') builds tagParent(tag) + '/' + stripHash(input.trim()). The same validation and splice logic as rename apply. An Auto Property named after tagParent (with '#') can supply the leaf value.
- **Edge cases:**
  - A '#'-prefixed leaf is stripped.
  - Three-level tags: only the last segment is replaced.
  - Blank leaf cancels silently.
  - Auto Property hook draws the value from the auto-property flow when one matches the parent path.
- **Risks / test focus:**
  - Auto Property matching uses tagParent(tag) with '#', a case-sensitive unusual key name; a casing mismatch silently falls through (metaController.ts:175-178).
  - If isNestedTag wrongly returns true for a non-standard cache entry, leaf edit fires incorrectly.

### TAG-03 - Write an Obsidian-Tracker value onto a body tag

- **Story:** As a user with the Obsidian Tracker plugin, I want to record a value against a body tag (e.g. #weight:80) so Tracker can plot it.
- **Entry point:** suggester | **Platform:** both
- **Expected behavior:** The 'Tracker value (#tag:value)' action appears only when hasTrackerPlugin is true (detected at controller construction). Selecting it clears the value context (no tag autocomplete) and prompts 'Enter a Tracker value for <tag>'. computeTagRewrite(tag, input, 'tracker') returns <originalTag>:<value>. If the span already has a ':value' suffix, spliceTag advances cutEnd to replace it rather than stack (#weight:80 -> #weight:85). The value regex stops before adjacent punctuation.
- **Edge cases:**
  - Empty tracker value cancels silently.
  - Existing ':value' suffix is replaced, not stacked.
  - A plain rename of a tag with ':value' preserves the suffix.
  - Action hidden entirely when Tracker is absent.
- **Risks / test focus:**
  - Tracker detection is at controller construction; installing/enabling Tracker after opening the note requires a reload before the action appears (tagEditing.ts).
  - TRACKER_VALUE [A-Za-z0-9._+-]+ has an unescaped '.' that matches any char (semantically inaccurate) (tagEditing.ts:82).
  - normalizeTagToken must not touch the ':value' part; a future change could silently break Tracker writes.

### TAG-04 - Target the exact occurrence of a duplicate body tag with a stale-span guard

- **Story:** As a user with the same #tag appearing multiple times, I want to rename one specific occurrence without changing the others, and I want the write refused if the note changed since the menu opened so a misaligned splice never corrupts surrounding prose.
- **Entry point:** suggester | **Platform:** both
- **Expected behavior:** Each occurrence is a separate Property with its own TagPosition {start, end, line}; spliceTag rewrites only the targeted byte span. The suggester disambiguates duplicates as '<tag> (line N, M/total)' sorted by position.start. Before writing, spliceTag re-reads content.slice(start, end) and compares it to expectedTag (property.key); on mismatch (or out-of-range/non-integer offsets, or undefined position) it returns null. writeTagOccurrence throws on null; updatePropertyFromUi catches it and shows a Notice ('could not locate the tag - the note may have changed ... Reopen and try again.').
- **Edge cases:**
  - Two occurrences on the same line differ only by ordinal.
  - Undefined position.line omits the 'line N' part.
  - Out-of-range/non-integer offsets or undefined position return null before the comparison.
- **Risks / test focus:**
  - Two entries with the same position.start (parser bug) both get ordinal 1, visually indistinguishable (metaEditSuggester.ts:65-69).
  - Tags differing only in casing ('#Tag' vs '#tag') are distinct entries here but folded by Obsidian, confusing the user.
  - expectedTag is property.key; if Obsidian's cache ever omitted the leading '#', the comparison would always fail and permanently block tag edits (tagEditing.ts:143).
  - In a multi-tag batch, stale spans are silently skipped with a console log, not a Notice, so dropped edits may go unnoticed.

### TAG-05 - Validate the new tag token before writing

- **Story:** As a user, I want to be stopped immediately if I type an invalid tag name (spaces, commas, dots, digit-only) so MetaEdit never splices unparseable text into my note.
- **Entry point:** suggester | **Platform:** both
- **Expected behavior:** After computeTagRewrite, editTag calls isValidTagToken(normalizeTagToken(newToken)), requiring exactly one leading '#', a body matching /^[\p{L}\p{N}_/-]+$/u, at least one non-digit char (rejecting #2024), and an optional Tracker :value suffix. On failure a Notice is shown and no write occurs. writeTagOccurrence independently re-validates and throws an Error for the same invalids.
- **Edge cases:**
  - Space, comma, or dot in a tag -> invalid.
  - Purely numeric body -> invalid.
  - Unicode letters (#cafe) -> valid via \p{L}.
  - Tracker suffix peeled off before validation.
- **Risks / test focus:**
  - The unescaped '/-' range in the character class is technically malformed and could behave differently in strict engines (tagEditing.ts:115).
  - The Notice always says 'Tags cannot contain spaces or commas' even when the real failure is a dot, digit-only name, or missing '#' (metaController.ts:199).
  - editTag (Notice) and writeTagOccurrence (thrown Error) produce different messages for the same invalids, inconsistent UI vs API UX.

### TAG-06 - Edit the frontmatter tags/tag field as a canonical list

- **Story:** As a user, I want to edit the frontmatter tags/tag property as a clean YAML list with each tag individually, stripping '#' on write so Obsidian indexes them correctly.
- **Entry point:** edit-meta-menu | **Platform:** both
- **Expected behavior:** shouldUseMultiValueEditor always returns true for a YAML property keyed tags/tag (case-insensitive), forcing the multi-value editor. multiValueMode uses splitFrontmatterTags on property.content to normalize any shape (list, scalar, comma/space string) into a flat array of '#'-free tokens. On write, updatePropertyInFile re-splits via splitFrontmatterTags, drops blanks, deletes the key entirely if empty (Decision E), else stores the array. A leading '#' is stripped via canonicalizeFrontmatterTag before storing.
- **Edge cases:**
  - A scalar 'alpha beta' splits into two tags.
  - Non-primitive items in a tags list are skipped.
  - Removing all tags deletes the key, not 'tags: []'.
  - isTagsKey is case-insensitive.
  - A body Tag keyed '#tags' is NOT treated as multi-value (isTagsKey checks YAML type first).
- **Risks / test focus:**
  - splitFrontmatterTags stringifies numbers/booleans (tags: [1, true] -> '1','true') and does NOT apply isValidTagToken, so '1' is written as a frontmatter tag though '#1' in the body is rejected (tagEditing.ts:183).
  - Decision E silently deletes the tags key with no confirmation when cleared.
  - There is no way to remove a single tag from the list editor; the user must replace it or edit raw frontmatter.

## Kanban board helper

### KAN-01 - Auto-trigger sync on board file save

- **Story:** As a user, I want the Kanban helper to run automatically whenever I save a configured board file so linked-note properties stay in sync without manual action.
- **Entry point:** automatic | **Platform:** both
- **Expected behavior:** On each file-modify event, onFileModify checks whether the file's basename matches any configured boardName. No match returns immediately with no reads/writes. On a match it reads via cachedRead and processes all card links. If getFileCache returns null or has no links, it exits early.
- **Edge cases:**
  - Same basename, different extension is ignored (basename comparison).
  - Null cache or no links: early exit.
  - Debounce is the parent automator's 5-second modifier; the helper itself has none.
- **Risks / test focus:**
  - Board lookup uses file.basename (no path), so two boards with the same filename in different folders collide; only the first in settings is reachable (kanbanHelper.ts:27).
  - No internal debounce; if the parent debounce were removed, every keystroke triggers a full board scan.

### KAN-02 - Configure and remove a board + property mapping with autocomplete

- **Story:** As a user, I want to add a board (via autocomplete), set the property to keep in sync, and remove a board, so MetaEdit knows which boards to watch and which keys to update.
- **Entry point:** settings | **Platform:** both
- **Expected behavior:** The settings table has one row per board. An input backed by KanbanHelperSettingSuggester filters kanban-tagged files by case-insensitive basename substring. 'Add' looks up the typed value in initialBoards: it silently does nothing if not found or already configured, else appends {boardName: basename, property: ''} and saves. The property name is filled in a column and persisted on the onchange (blur) event. The X button removes the entry by index and immediately saves; the table re-renders. No remove confirmation.
- **Edge cases:**
  - Adding an already-configured boardName is silently rejected.
  - Typing a name not in initialBoards does nothing with no feedback.
  - A newly added board starts with empty property; until filled, each card emits a notice.
  - Remove is permanent and immediate; no undo.
- **Risks / test focus:**
  - addNewProperty searches initialBoards frozen at mount (untrack), so boards added after the modal opened cannot be added without reopening (KanbanHelperSettingContent.svelte:45).
  - The property input saves on onchange, so an unblurred edit is lost (svelte:98).
  - Autocomplete acceptSuggestion fires a synthetic 'input' event; if Svelte's bind:value does not react, clicking Add uses a stale empty inputValue and silently does nothing (KanbanHelperSettingSuggester.ts:18).
  - No validation that the property exists in any linked note.
  - The #each block keys on boardName; duplicate boardNames (via external edit) could misbehave on removal (svelte:89).

### KAN-03 - Display possible lane values in settings

- **Story:** As a user, I want the current lane headings of each board shown in the settings table so I know what values the tracked property will be set to.
- **Entry point:** settings | **Platform:** both
- **Expected behavior:** getHeadingsInBoard looks up the board file in initialBoards, reads metadataCache.getFileCache(file).headings, and joins them with ', ' for the 'Possible values' column. If the file is not found it logs a warning and returns 'FILE NOT FOUND'.
- **Edge cases:**
  - A board with no headings returns an empty string (blank column, no explanation).
  - Headings are a mount-time snapshot, not updated as lanes change.
- **Risks / test focus:**
  - getFileCache(file).headings is dereferenced with no null-check on getFileCache; if the file is unindexed, getFileCache returns null and .headings throws, crashing the settings render (KanbanHelperSettingContent.svelte:68).
  - All headings (including dividers/archive sections) are shown, not just lane headings.

### KAN-04 - Update linked-note property when a card sits under a lane (skip if matching)

- **Story:** As a user, I want the frontmatter property on a linked note set to the lane name when its card appears under that lane heading, and skipped when it already matches, so my note metadata reflects the card's board position without unnecessary writes.
- **Entry point:** automatic | **Platform:** both
- **Expected behavior:** For each board link, the helper requires: (1) the link is the leading link of a top-level task line (CARD_LINK_PREFIX); (2) a lane heading exists at or above the card line; (3) the link resolves to a markdown TFile; (4) the linked note has a non-virtual property whose key exactly matches board.property; (5) that property's content differs from the lane name. Only then is updatePropertyInFile called; if content === lane the helper returns without writing (no log/notice).
- **Edge cases:**
  - Property match is strict on prop.key; 'Status' vs 'status' fails.
  - Lane name is heading.heading verbatim (ATX-closed and setext resolved by the cache).
  - A wikilink in a lane heading is written into the property value literally.
  - Strict equality skip; whitespace differences cause a spurious update.
- **Risks / test focus:**
  - Property find performs no type coercion; trailing whitespace in a key fails silently (kanbanHelper.ts:118).
  - content !== lane is a strict string compare, so null/undefined/number stored values always differ and rewrite on every save (kanbanHelper.ts:127).
  - Lane names containing wikilinks are written verbatim into frontmatter, producing unparseable values (test at line 411).

### KAN-05 - Per-card error handling: notice on missing property, fault isolation on failure

- **Story:** As a user, I want a notice when the configured property is missing from a linked note, and broken/erroring cards silently skipped, so I know which notes need the property and the rest of the board still updates.
- **Entry point:** automatic | **Platform:** both
- **Expected behavior:** If fileProperties.find(...) returns undefined, log.logWarning runs and an Obsidian Notice is shown ('<property>' not found in "<basename>" (Kanban board '<boardName>')); updatePropertyInFile is not called. Each link is processed in a try/catch: if resolveLinkFile is null or the file is non-markdown the card is skipped with log.logMessage; thrown exceptions (e.g. malformed YAML in getPropertiesInFile) are caught, stringified, and logged with log.logMessage. Iteration continues.
- **Edge cases:**
  - The missing-property notice fires on every board save while the property is absent, potentially spamming.
  - Non-markdown linked files are logged and skipped.
  - A stale-position card is skipped by isCardLink before the fault-isolation path.
- **Risks / test focus:**
  - No rate-limiting/dedup on the missing-property Notice; rapid/auto-saves emit a notice per save per card (kanbanHelper.ts:121-124), contradicting the catch-block's logMessage anti-spam choice.
  - Errors are logged via log.logMessage (not logError), so malformed-YAML failures are only in the MetaEdit log, not surfaced as notices; users may not realize a card failed (kanbanHelper.ts:73).

### KAN-06 - Identify true card links vs trailing/embedded links and guard stale cache

- **Story:** As a user, I want only the leading linked note on a card line updated (ignoring date/reference/prose links), and a card skipped if the cache lags the file, so auxiliary links are not treated as card identities and a card is never written to the wrong lane.
- **Entry point:** automatic | **Platform:** both
- **Expected behavior:** isCardLink validates: the link has a position.start; the board line exists; the line slice from start.col starts with link.original (cross-referenced against cachedRead boardLines, guarding cache lag); and the text before start.col matches CARD_LINK_PREFIX = /^-\s+\[[^\]]?\]\s+$/ (list marker + checkbox + whitespace). Any link with prose, other content, or leading whitespace before it fails and is skipped.
- **Edge cases:**
  - '- [x] [[Note]]' passes ([^\]]? matches 'x').
  - Indented sub-checklist items fail the prefix.
  - A markdown link [Label](path) at the card position can be a card link.
  - A renamed lane heading is not detected by the link-identity guard; the old heading is used until cache update.
- **Risks / test focus:**
  - CARD_LINK_PREFIX requires whitespace before the link, so '- [ ][[Note]]' (no space) is silently skipped (kanbanHelper.ts:17).
  - [^\]]? allows only zero or one checkbox char, so '- [>>] [[Note]]' is skipped.
  - The stale-heading race is acknowledged but untreated, relying on the 5-second debounce (kanbanHelper.ts:83-85).

### KAN-07 - Resolve the linked note via three-tier fallback

- **Story:** As a user, I want MetaEdit to find the linked note regardless of short name, full path, or URL-encoded link so the helper works across card link styles.
- **Entry point:** automatic | **Platform:** both
- **Expected behavior:** resolveLinkFile tries: (1) getFirstLinkpathDest with the decoded/normalized linkpath and the '.md'-stripped form; (2) getAbstractFileByPath with '.md' appended; (3) a getMarkdownFiles basename scan, only when the linkpath has no '/'. Path-qualified links that fail the first two return null rather than falling back to basename. URL-encoded links are decoded and fragments stripped first.
- **Edge cases:**
  - Fragment identifiers (#Heading) stripped.
  - Leading '/' stripped before normalization.
  - External links resolve to null and are skipped by isMarkdownFile.
- **Risks / test focus:**
  - The basename scan returns the first match arbitrarily when multiple notes share a basename, with no warning (kanbanHelper.ts:193-202).
  - normalizeLinkpath silently catches decodeURIComponent failures and keeps the partially-encoded string, which can then fail all strategies and return null with no message (kanbanHelper.ts:148-161).

## Bulk metadata editor

### BULK-01 - Collect markdown files recursively and abort when none are found

- **Story:** As a user, I want the bulk editor to include all markdown notes nested at any depth in a folder (or expand a mixed file/folder selection) editing each once, and to show a clear message when the scope has no markdown notes.
- **Entry point:** folder-menu | **Platform:** desktop
- **Expected behavior:** collectFromFolder walks TFolder.children recursively (markdownFilesIn), keeping TFiles with extension 'md'. collectFromSelection expands folders recursively and combines with directly-selected TFiles. Both pass through dedupeByPath (Map keyed on file.path, first occurrence wins). Non-md files are excluded at collection time. At the start of run(), if files.length === 0, a Notice ('MetaEdit: no markdown notes to edit here.') is shown and the method returns before any prompts.
- **Edge cases:**
  - A file both directly selected and inside a selected folder appears once.
  - Non-md files excluded entirely; output order follows Map insertion order.
  - The zero-files abort is redundant for the folder path (folderHasMarkdown gates the menu) but reachable for selections emptied after the menu opened.
- **Risks / test focus:**
  - No depth limit/cycle guard on the recursion; a pathologically deep vault could overflow the stack (bulkMetadataEditor.ts:191-200).
  - folderHasMarkdown (menu visibility) and the run() count check are two separate vault reads across the interactive flow; files deleted between them make the notice appear after prompts have been shown (TOCTOU).

### BULK-02 - Prompt for the property name and value

- **Story:** As a user, after clicking a bulk edit menu item, I want to be prompted for a property name and then a value so I can specify what to write across the batch.
- **Entry point:** folder-menu | **Platform:** desktop
- **Expected behavior:** run() prompts via GenericPrompt.Prompt with 'Property to add/update across N note(s) in <scopeLabel>' (placeholder 'Property name'); the result is trimmed and an empty/cancelled value aborts silently. Then it prompts for the value ('Value for "<key>"', placeholder 'Value'); a null or falsy (empty) value aborts silently. No suggestValues, no context, no type coercion; the value is written as a string unless EditMode wraps it.
- **Edge cases:**
  - Whitespace-only key rejected after trim.
  - Empty string value aborts.
  - No autocomplete or date picker in bulk prompts by design.
  - value 'true' written as the string 'true' unless processFrontMatter coerces.
- **Risks / test focus:**
  - The if(!key) and if(!rawValue) guards incorrectly abort for valid values '0', 'false', 'NaN' (bulkMetadataEditor.ts:71,78).
  - No validation that the key is valid YAML; a key with ':' or quotes may produce malformed frontmatter.
  - No vault-wide property name suggestions, unlike the suggester flow.
  - A wrong property name has no go-back; cancel aborts the whole flow.

### BULK-03 - Detect conflicts and choose a policy (skip/merge/overwrite)

- **Story:** As a user, when some notes already have the target property, I want to choose how to handle them so I do not accidentally overwrite important data.
- **Entry point:** folder-menu | **Platform:** desktop
- **Expected behavior:** countExisting reads each file's live frontmatter via cachedRead + hand-rolled YAML parsing, counting notes with the key via hasOwnProperty. If conflicts > 0, BulkOptionModal.Choose offers skip/merge/overwrite; dismissing resolves null and aborts. The chosen key becomes the ConflictPolicy. With zero conflicts no modal shows and the default 'skip' policy applies (equivalent to add-only).
- **Edge cases:**
  - Zero conflicts: no modal, default 'skip'.
  - Conflict count uses cachedRead (may be stale vs unsaved buffer).
  - readLiveFrontmatter returns null for parse errors/no-frontmatter/BOM, so those files are not counted as conflicting.
- **Risks / test focus:**
  - countExisting uses cachedRead and a hand-rolled parser separate from processFrontMatter; the two can disagree on BOM, '...' vs '---' close, or edge YAML, miscounting conflicts (bulkMetadataEditor.ts:220-237).
  - The closing-delimiter regex can treat a '---' inside a YAML value as the close, truncating the parse.
  - TOCTOU: a file modified between countExisting and apply can make the applied policy differ from what the user chose.
  - Malformed-YAML files are uncounted, so a 'skip' policy may still write to them.

### BULK-04 - Apply with skip policy (add-only)

- **Story:** As a user, I want to add the property only to notes that lack it, leaving existing values untouched, so I fill in missing metadata without overwrites.
- **Entry point:** folder-menu | **Platform:** desktop
- **Expected behavior:** Under 'skip', decideBulkWrite returns {action:'skip', outcome:'skipped'} where exists is true; for missing notes it writes the new value, with wrapInArray (from EditMode) deciding scalar vs single-element array. Existence uses hasOwnProperty.
- **Edge cases:**
  - 'skip' is the default policy before the conflict modal; with zero conflicts it acts as add-everywhere.
  - Notes with the key present but null/empty are still skipped (no 'skip only if non-empty').
  - Inherited/prototype properties not treated as existing.

### BULK-05 - Apply with merge policy (append unique into list)

- **Story:** As a user, I want to append a value to existing property lists without duplicating it so I can accumulate tags/categories idempotently.
- **Entry point:** folder-menu | **Platform:** desktop
- **Expected behavior:** Under 'merge': a scalar is normalized to a one-element array and the value appended ('merged'); an existing list gets the value via uniqueConcat, skipping if present ('unchanged'); a plain-object value is left untouched ('skipped'); a missing key is seeded as a one-element list ['rawValue'] ('added') regardless of wrapInArray. Deduplication is by stable string form (numeric 5 and string '5' are the same).
- **Edge cases:**
  - Plain-object values are skipped, not merged.
  - Null/undefined existing values are treated as empty arrays.
  - merge always produces a list for both existing and new keys, ignoring wrapInArray/EditMode.
- **Risks / test focus:**
  - merge wraps the new-property case in an array unconditionally, ignoring EditMode; an AllSingle user gets a YAML list for merge-added properties, inconsistent with notes that had the property before (bulkMetadata.ts:56).
  - Object-value skips and policy skips are both bucketed as 'skipped', hiding silent failures.
  - Type-coercing dedup may surprise users with mixed-type lists.

### BULK-06 - Apply with overwrite policy behind a destructive confirmation

- **Story:** As a user, I want to replace the property value across all notes after an explicit 'cannot be undone' confirmation, so I can normalize metadata without accidental data loss.
- **Entry point:** folder-menu | **Platform:** desktop
- **Expected behavior:** When overwrite is chosen, a second BulkOptionModal with danger:true is shown ('Overwrite "<key>" across N note(s)?', 'Bulk edits cannot be undone with Ctrl+Z.') with one 'Overwrite' option; dismissing (Escape/click-away) aborts, confirming returns 'yes'. On apply, existing properties get wrapScalar(rawValue, wrapInArray); if the new value equals the current (stableStringify) the outcome is 'unchanged' with no write, else 'overwritten'. Missing notes are added like 'skip'. An existing list is fully replaced by the scalar when wrapInArray is false.
- **Edge cases:**
  - Idempotent: a re-run with the same value yields all 'unchanged'.
  - An existing list is replaced by a scalar when wrapInArray is false.
  - Equality uses stableStringify (key-order-insensitive for maps).
  - danger:true applies mod-warning styling; no explicit Cancel button (only Escape/click-away).
- **Risks / test focus:**
  - The confirmation headlines files.length (full batch) even though some notes will be 'unchanged' or 'added', overstating the destructive scope (bulkMetadataEditor.ts:115).
  - No Cancel button is a non-obvious pattern for a destructive confirmation; if backdrop-click does not dismiss in some Obsidian versions the user could feel stuck.

### BULK-07 - Apply edits per note via processFrontMatter with EditMode wrapping

- **Story:** As a user, I want each note's property updated via the same safe frontmatter mechanism as single edits, with multi-value wrapping consistent with my EditMode.
- **Entry point:** folder-menu | **Platform:** desktop
- **Expected behavior:** apply() iterates files sequentially; applyToFile wraps decide-write logic inside fileManager.processFrontMatter, reading existence via hasOwnProperty and conditionally setting frontmatter[key]=decision.value. wrapInArrayFor() is computed once before the loop: AllMulti -> true for every key; SomeMulti -> true only if the key is in EditMode.properties (case-sensitive); else false.
- **Edge cases:**
  - wrapInArray is the same for all files in a batch.
  - A 'skip'/'unchanged' decision returns without mutating frontmatter, though processFrontMatter may still touch the file.
  - Files processed sequentially, not in parallel.
- **Risks / test focus:**
  - properties.includes(key) is case-sensitive; settings 'Tags' vs user-entered 'tags' silently writes a scalar instead of a list (bulkMetadataEditor.ts:242).

### BULK-08 - Isolate per-note failures and show a summary notice

- **Story:** As a user, I want the batch to continue when one note fails and to see a concise summary afterward so a single corrupted file does not cancel the rest.
- **Entry point:** folder-menu | **Platform:** desktop
- **Expected behavior:** Each applyToFile is wrapped in try/catch; on failure summary.failed increments and {path, error} is recorded, then processing continues. After the loop, if failures occurred, one console.warn is emitted with the full array. formatSummary lists only non-zero buckets (added, merged, overwritten, skipped, unchanged, failed) and a Notice is shown for 10s; '(see console for failed notes)' is appended when failures > 0; 'no changes' shows when all buckets are zero.
- **Edge cases:**
  - Failures are console-only, not in-app beyond the count.
  - An idempotent re-run shows 'N unchanged', not 'no changes'.
  - 10s Notice may be too short for a long summary.
  - apply() is public, callable without the run() safeguards.
- **Risks / test focus:**
  - Failure details (paths, messages) are only in the console; users without dev tools see 'N failed (see console)' with no accessible path, no log file, no retry (bulkMetadataEditor.ts:155-158).
  - recordOutcome does summary[outcome]+=1; if BulkOutcome ever diverges from BulkSummary keys, an undefined key silently becomes NaN.
  - apply() being public bypasses conflict/confirmation safeguards for API callers.

## Public API

### API-01 - autoprop: open the Auto Property value prompt programmatically

- **Story:** As a plugin developer, I want to open the Auto Property value prompt for a named property programmatically so I can drive MetaEdit's value picker from my scripts.
- **Entry point:** api | **Platform:** both
- **Expected behavior:** Calls controller.handleAutoProperties(propertyName). Returns null immediately if AutoProperties is disabled or no entry matches. Otherwise opens AutoPropertyValueModal with isMulti from the property's type and global EditMode. Returns a string for Single, string[] for Multi, or null on cancel. The modal also offers to persist newly typed choices.
- **Edge cases:**
  - Returns null when the feature is disabled, no entry matches, or the user cancels.
  - Returns string[] for Multi; string for Single/undefined type.
- **Risks / test focus:**
  - The three null cases (disabled, no entry, cancelled) are indistinguishable to the caller (MetaEditApi.ts:45).

### API-02 - update: update an existing property's value in a file

- **Story:** As a plugin developer, I want to update an existing property's value in a file programmatically so I can modify metadata without UI.
- **Entry point:** api | **Platform:** both
- **Expected behavior:** Accepts propertyName, propertyValue, and a TFile or path. Unresolved file returns undefined silently. Searches properties for a match, preferring non-virtual, falling back to a virtual YAML property; no match returns undefined silently. Delegates to updatePropertyInFile: YAML via processFrontMatter; nested path (path.length>1) via setYamlPath with validateExpectedValue:true; Dataview by rewriting every matching line. Writes are queued per file.
- **Edge cases:**
  - Unresolved file or not-found property returns undefined silently.
  - Virtual YAML can be targeted as a fallback.
  - Writing tags=[] removes the tags key entirely.
  - Dataview update rewrites EVERY matching line, not just the first.
- **Risks / test focus:**
  - Silent undefined for not-found is indistinguishable from a successful undefined-returning write (MetaEditApi.ts:54-55).
  - Duplicate non-virtual same-key properties: only the first is updated, the rest silently skipped.
  - Dataview inline update splits on '\n' and joins on '\n', converting CRLF to LF (metaController.ts:465).

### API-03 - getFilesWithProperty: list files that have a given frontmatter property

- **Story:** As a plugin developer, I want a list of all markdown files that have a given frontmatter property so I can batch-process notes sharing a key.
- **Entry point:** api | **Platform:** both
- **Expected behavior:** Iterates app.vault.getMarkdownFiles(), reading each file's metadata-cache frontmatter. A file is included only if fileCache.frontmatter[property] is truthy (key exists AND value is non-falsy). Returns a TFile[] synchronously.
- **Edge cases:**
  - Files with no cache excluded.
  - Properties with a falsy value (0, false, '', null) excluded (truthy check, not hasOwnProperty).
  - Only frontmatter is scanned; Dataview inline fields are not considered.
  - Reflects cache state, which may lag disk.
- **Risks / test focus:**
  - The truthy check silently excludes false/0/''/null-valued properties, a false-negative for boolean/numeric fields (main.ts:126).
  - No way to find files declaring the property only as a Dataview inline field.

### API-04 - createYamlProperty and addOrUpdateProperty: create/upsert a property

- **Story:** As a plugin developer, I want to create a new YAML property (or add-if-missing/update-if-present) so I can write metadata without first checking existence.
- **Entry point:** api | **Platform:** both
- **Expected behavior:** createYamlProperty resolves the file and calls addYamlProp: tags/tag values are normalized via splitFrontmatterTags; a non-multi AutoProperty keeps the value scalar, else EditMode may wrap a non-array in an array; if the property already exists a Notice is shown and the file is not modified; returns void in both cases. addOrUpdateProperty searches (non-virtual-first); if found it calls updatePropertyInFile preserving the property's type, else it calls updatePropertyInFile with a synthetic {key, type: YAML}, forcing a YAML create-and-set. Writes are queued per file.
- **Edge cases:**
  - Silently wraps in an array under AllMulti/SomeMulti unless an AutoProperty prevents it.
  - tags/tag normalized to a stripped list.
  - createYamlProperty returns void whether created or skipped (success/no-op indistinguishable).
  - addOrUpdateProperty always creates a missing property as YAML; the synthetic property has no content/path.
- **Risks / test focus:**
  - createYamlProperty returns void so callers cannot tell created from already-exists without a separate read; Notice text has the misplaced-period typo '<key>. Will not add.' (metaController.ts:79).
  - addOrUpdateProperty's synthetic {key, type: YAML} has no path, so a nested-path intent falls through to frontmatter[key]=value, setting the root key to a scalar (MetaEditApi.ts:114-117).
  - If a property exists both as a Dataview field and a same-named YAML property, only the first non-virtual match is updated.

### API-05 - appendDataviewField: append a new inline field instance via API

- **Story:** As a plugin developer, I want to append a new inline Dataview field instance to a file body so I can add metadata that allows multiple values across separate lines.
- **Entry point:** api | **Platform:** both
- **Expected behavior:** Resolves the file and calls controller.appendDataviewField. Array values are joined with ', '; other values stringified. location defaults to 'afterLastMatch' (after the last line declaring the field) and can be 'end'. computeInlineInsertIndex never places the field inside frontmatter or a fence. The file's CRLF/LF ending is detected and preserved. Writes are queued per file.
- **Edge cases:**
  - No existing field + 'afterLastMatch' falls back to 'end'.
  - Empty/frontmatter-only file: placed at start of body.
  - Array values serialized as one comma-joined string field line.
  - Always appends; never updates existing same-named fields.
- **Risks / test focus:**
  - Array input becomes one comma-joined line, not one line per element (metaController.ts:100).
  - Options only expose location; no way to specify a line number or anchor.
  - Trailing-newline split/splice interplay can insert a blank line before the new field (untested).

### API-06 - getYamlPath / updateYamlPath / addOrUpdateYamlPath via API

- **Story:** As a plugin developer, I want to read and write nested YAML values via the public API so I can access and modify deeply nested frontmatter without writing traversal logic.
- **Entry point:** api | **Platform:** both
- **Expected behavior:** getYamlPath accepts a dot-string or segment array, resolves the file, parses frontmatter via parseFrontmatterObject (raw then cache fallback), and returns the value or undefined (YamlPathError caught; other errors re-thrown). updateYamlPath uses createParents:false, createLeaf:false (errors propagate). addOrUpdateYamlPath defaults createParents:true and does not pass createLeaf. All writes are queued per file.
- **Edge cases:**
  - YamlPathError during traversal returns undefined; other errors re-thrown.
  - Null frontmatter returns undefined.
  - Dot-string paths cannot represent keys with literal dots; use the segment array.
  - updateYamlPath errors propagate to the caller unhandled.
- **Risks / test focus:**
  - Return types are Promise<any> (IMetaEditApi.ts:35), giving no type guidance.
  - parseFrontmatterObject's raw-then-cache fallback can return stale cache data with no way for the caller to know the source.
  - updateYamlPath lacks expectedValue exposure; addOrUpdateYamlPath lacks createLeaf exposure; MetaEditYamlPathOptions exposes only createParents, making leaf-creation invisible/uncontrollable.
  - updateYamlPath errors propagate with no Notice or wrapping.

### API-07 - Read APIs: getPropertyValue and getPropertiesInFile

- **Story:** As a plugin developer, I want to read a single named property's value or retrieve all properties of a file as a structured array so I can inspect metadata before deciding whether to update.
- **Entry point:** api | **Platform:** both
- **Expected behavior:** getPropertyValue resolves the file (undefined if not found), searches properties (non-virtual-first), and returns targetProperty.content as-is (string, number, boolean, array, object, or Date) or undefined. getPropertiesInFile returns Promise<Property[]> from controller.getPropertiesInFile (tags, then YAML including nested, then Dataview); properties include key, content, type, and optionally path, rootKey, isNested, isVirtual. If the file is not found it returns undefined despite the declared Property[] type.
- **Edge cases:**
  - getPropertyValue returns undefined for missing file, not-found property, or virtual-only match; content type is whatever the parser produced.
  - Nested YAML appears both as a root container entry and as flat entries with path/rootKey.
  - Tags include the # prefix.
  - A file without frontmatter returns only tags and inline fields.
- **Risks / test focus:**
  - getPropertyValue's return type is any (IMetaEditApi.ts:30) and its identical silent undefined for file-not-found/property-not-found/no-value makes error handling impossible without a separate existence check.
  - getPropertiesInFile declares Promise<Property[]> but returns undefined when the file is not found, violating the type; unguarded callers hit a runtime error (MetaEditApi.ts:170-171).
  - Property is an internal parser type exposed on the public API with no stability guarantee.

### API-08 - onMetadataChange: subscribe to metadata-change diffs

- **Story:** As a plugin developer, I want to subscribe to metadata changes across files and receive structured diffs so I can react to edits without polling.
- **Entry point:** api | **Platform:** both
- **Expected behavior:** Registers metadataCache 'changed' (compute current properties, compare to the previous snapshot via propertiesSignature/JSON.stringify, fire callback only on change), 'deleted' (clean state), and vault 'rename' (migrate state) listeners. On change it invokes the callback with {file, data, cache, properties, previousProperties} (null on first change). Per-file event queueing prevents overlapping invocations. Returns an unsubscribe function also registered with plugin.register.
- **Edge cases:**
  - First change sets previousProperties null.
  - Callback errors are caught and console-logged, not breaking the listener.
  - Deletion clears state; recreation starts fresh.
  - Rename migrates the previous-properties snapshot.
  - An unsubscribed flag is checked before and after the async parse.
- **Risks / test focus:**
  - Two edits within one cache cycle fire a single callback showing the net change, not each edit.
  - getPropertiesFromEvent mixes cache-based frontmatter with raw-parsed inline fields, which can disagree when the cache is stale relative to data (MetaEditApi.ts:350-355).
  - Callback errors are swallowed with only console.error (MetaEditApi.ts:229).
  - propertiesSignature uses JSON.stringify, which is not order-stable; a key-order change without a value change still fires the callback.

## Settings + migration

### SET-01 - Fresh-install default settings

- **Story:** As a new user installing MetaEdit, I want sensible defaults so the plugin works without configuration.
- **Entry point:** automatic | **Platform:** both
- **Expected behavior:** When loadData() returns null/undefined, mergeSettings(null) returns a deep clone of DEFAULT_SETTINGS with all sections present: ProgressProperties {enabled:false, properties:[]}, IgnoredProperties {enabled:false, properties:[], hideFileTags:false}, AutoProperties {enabled:false, properties:[]}, EditMode {mode:'All Single', properties:[]}, KanbanHelper {enabled:false, boards:[]}, UIElements {enabled:true}. The result is writable and does not alias module-level default arrays.
- **Edge cases:**
  - null vs undefined both handled by the ?? coercion.
  - DEFAULT_SETTINGS is shallow-frozen; structuredClone prevents mutation leaking into it.
- **Risks / test focus:**
  - DEFAULT_SETTINGS is only shallowly frozen; inner arrays are mutable, so direct mutation before structuredClone could corrupt defaults (defaultSettings.ts:4).
  - UIElements defaults to enabled:true while all other features default to false, an inconsistency that may surprise opt-in expectations.

### SET-02 - Merge settings on load and avoid spurious saves

- **Story:** As an existing user upgrading, I want new fields backfilled with defaults and no disk write unless a migration is required, so my settings are not broken and no spurious dirty state occurs at startup.
- **Entry point:** automatic | **Platform:** both
- **Expected behavior:** mergeSettings does a one-level-deep merge: for each DEFAULT_SETTINGS key, plain objects are spread {...default, ...stored} (stored wins), backfilling absent fields like hideFileTags. Non-object top-level values fall back to the default wholesale; unknown stored top-level keys are preserved. loadSettings only calls saveSettings when migrateIgnoredProperties returns true, so a fully up-to-date startup is strictly read-only.
- **Edge cases:**
  - A stored object section is spread-merged; a stored scalar/array replaces the default wholesale (no deep/array merge).
  - Entirely missing sections backfilled in full; unknown future keys preserved.
  - null data (fresh install): migration returns false, no save.
  - Post-migration data with hideFileTags present: no save.
- **Risks / test focus:**
  - mergeSettings is one-level-deep only; a future nested sub-field would be overwritten by the shallower stored spread (settingsMigration.ts:29).
  - Stored arrays win wholesale, silently dropping new default array elements.
  - Only migrateIgnoredProperties gates the save; a second future migration must also gate carefully or the read-only invariant breaks.

### SET-03 - Feature toggles (Progress / Auto / Kanban / Edit Meta menu / UI Elements)

- **Story:** As a user, I want each feature toggle to take effect immediately and persist so my preferences survive reload.
- **Entry point:** settings | **Platform:** both
- **Expected behavior:** Each toggle reads its enabled flag and, on a differing value, updates settings and saves. Progress and Kanban toggles call toggleAutomators() to register/unregister automators; UIElements calls linkMenu.registerEvent()/unregisterEvent(); Edit Meta menu (IgnoredProperties) calls this.display() to re-render so its sub-panel shows/hides; Auto Properties does NOT call toggleAutomators. A same-value onChange guard prevents redundant work.
- **Edge cases:**
  - Same-value change is a no-op for every toggle.
  - Edit Meta menu is the only section that calls display() on toggle.
  - UIElements has no gear/sub-panel.
- **Risks / test focus:**
  - The Auto Properties toggle does not call toggleAutomators while Progress/Kanban do; if it ever needed one it would not register until reload (metaEditSettingsTab.ts:96-99).
  - this.display() on the Edit Meta toggle re-mounts ALL Svelte components, risking flicker and lost unsaved state in other panels.
  - Toggling UIElements off->on rapidly can re-register linkMenu without offref-ing the old ref, leaking a listener and duplicating menu items (LinkMenu.ts:13-15).

### SET-04 - Gear-expand configuration panels (collapsible sub-settings)

- **Story:** As a user, I want to expand an inline configuration panel within a settings section to configure it in context without a separate modal.
- **Entry point:** settings | **Platform:** both
- **Expected behavior:** An extra-button (gear) calls toggleHiddenEl(div, hidden), toggling the metaedit-hidden class on a div containing the section's Svelte component (Progress/Auto/Ignored/EditMode/Kanban). toggleHiddenEl returns the new state; the div starts hidden. Components are mounted once at display() and destroyed on hide()/re-display().
- **Edge cases:**
  - Clicking the gear when expanded collapses it.
  - Re-display() unmounts and re-mounts, losing in-progress unblurred typing.
  - Auto/EditMode-SomeMulti panels are mounted even when the feature/mode is inactive (CSS-hidden).
- **Risks / test focus:**
  - toggleHiddenEl returns early when div is undefined (disabled Edit Meta section), so the gear is visible but inert with no feedback (metaEditSettingsTab.ts:15).
  - Several panels (Auto, Progress, SomeMulti list) are mounted unconditionally even when disabled, allowing edits to persist while the feature is off, and adding DOM/Svelte overhead.

### SET-05 - Svelte component lifecycle and settings persistence

- **Story:** As a user, I want the settings tab not to leak memory or duplicate UI when opened/closed repeatedly, and my changes saved to disk immediately.
- **Entry point:** settings | **Platform:** both
- **Expected behavior:** display() calls destroySvelteElements() (unmount each tracked component, reset the array) before rendering; hide() overrides the base method to also destroy. saveSettings() calls saveData(this.settings), serializing the full settings object; every toggle and Svelte save callback awaits it. There is no batching or debouncing.
- **Edge cases:**
  - display() unmounts before containerEl.empty().
  - hide() cleans up even without re-open.
  - saveSettings always writes the full object.
  - No error handling around saveData.
- **Risks / test focus:**
  - saveSettings has no error handling; a saveData failure (disk full/permissions) appears successful but is lost on reload with no notification (main.ts:112-114).
  - No debouncing on saves; rapid toggling triggers multiple concurrent saveData calls.
  - hide() returns super.hide() typed any while PluginSettingTab.hide() is void, a return-type mismatch (metaEditSettingsTab.ts:251).

## Right-click Edit Meta menu + folder/selection bulk

### MENU-01 - Edit Meta right-click on a markdown file, wikilink, or calendar link

- **Story:** As a user, I want to right-click a markdown file in the file explorer (or a wikilink or calendar entry) and choose 'Edit Meta' so I can open the metadata suggester for that file without navigating to it.
- **Entry point:** edit-meta-menu | **Platform:** desktop
- **Expected behavior:** The file-menu workspace event fires with source 'file-explorer-context-menu', 'link-context-menu', or 'calendar-context-menu'. onMenuOpenCallback verifies a TFile with extension 'md', stores it in this.targetFile, and adds an 'Edit Meta' pencil item. Clicking calls plugin.runMetaEditForFile(this.targetFile), which fetches properties and opens MetaEditSuggester. Registration is gated by UIElements.enabled.
- **Edge cases:**
  - Only .md files qualify; non-markdown files (including calendar entries mapping to non-md) are silently excluded.
  - If getPropertiesInFile is falsy, runMetaEditForFile returns early with no error.
  - Any other context-menu source is ignored (bCorrectSource false).
  - The whole menu is absent when UIElements is disabled.
- **Risks / test focus:**
  - this.targetFile is an instance field overwritten per event; rapid or interleaved events (including from different sources) make a click open the suggester for the wrong file (LinkMenu.ts:39).
  - The source comparison uses == for 'file-explorer-context-menu' and === for the other sources, a code smell (LinkMenu.ts:35).

### MENU-02 - Bulk edit from the folder right-click menu

- **Story:** As a user, I want to right-click a folder and choose 'Bulk edit metadata in this folder (and subfolders)' so I can apply a property change across all markdown notes in that folder tree.
- **Entry point:** folder-menu | **Platform:** desktop
- **Expected behavior:** The file-menu event (sources file-explorer/link/calendar context menus) adds the bulk-folder item when the target is a TFolder containing at least one .md file (folderHasMarkdown, recursive). Clicking calls runMetaEditForFolder, which collects markdown files recursively via collectFromFolder and runs bulkEditor.run() with scopeLabel '<folderName> (and subfolders)'. Gated by UIElements.enabled.
- **Edge cases:**
  - Folder must contain at least one .md file at any depth.
  - Empty/markdown-free folders show no item.
  - Absent when UIElements is disabled.
  - scopeLabel uses the folder name, not full path, so same-named folders show identical labels.
- **Risks / test focus:**
  - this.targetFolder is an instance field overwritten per event; rapid right-clicks target the wrong folder (LinkMenu.ts:7).
  - folderHasMarkdown is a synchronous recursive tree walk with no depth/cycle guard, risking UI jank or a stack overflow on large/corrupted trees.
  - Users may not realize disabling UIElements disables bulk editing entirely.

### MENU-03 - Bulk edit from a multi-file/folder selection

- **Story:** As a user, I want to select multiple files and/or folders, right-click, and choose 'Bulk edit metadata in selected notes' so I can apply a property change to a specific selection.
- **Entry point:** folder-menu | **Platform:** desktop
- **Expected behavior:** The files-menu event fires only for source 'file-explorer-context-menu'. The item is added when at least one selected item is a .md file or a folder containing .md files recursively. Clicking calls runBulkEditForSelection with the raw selection; collectFromSelection expands folders, keeps only .md TFiles, and dedupes by path. scopeLabel is the single file's name if exactly one .md results, else '<selection.length> selected items'.
- **Edge cases:**
  - Non-markdown files are dropped; folders expanded recursively.
  - All-non-markdown selection shows no item.
  - files-menu only supports file-explorer source (no link/calendar bulk selection).
- **Risks / test focus:**
  - scopeLabel uses selection.length (raw items including folders/non-md) rather than the resolved .md count, so '3 selected items' can mean 50 edited notes (main.ts:142-143).
  - hasMarkdown triggers a full recursive traversal of every selected folder just to decide menu visibility, before any click (LinkMenu.ts:53-55).

### MENU-04 - UIElements toggle gates and dynamically (un)registers right-click menus

- **Story:** As a user, I want to control whether the 'Edit Meta' right-click menus appear, with the change taking effect immediately without restarting Obsidian.
- **Entry point:** settings | **Platform:** both
- **Expected behavior:** At onload, if UIElements.enabled is true, linkMenu.registerEvent() registers the file-menu and files-menu events; if false, none are registered. The settings toggle's onChange calls registerEvent() when turned on and unregisterEvent() when turned off, then saves; no reload required. unregisterEvent guards with if(this.eventRef). The same-value onChange guard prevents redundant (un)registration.
- **Edge cases:**
  - If the plugin loads while disabled, toggling on must call registerEvent() explicitly (the settings tab does).
  - onunload calls unregisterEvent() unconditionally; the eventRef guard makes it safe.
  - The onChange guard prevents a same-value toggle from double-registering.
- **Risks / test focus:**
  - registerEvent() overwrites eventRef without offref-ing the old one, so an off->on->off->on sequence leaks a dangling listener and duplicates 'Edit Meta' items until restart (LinkMenu.ts:13-15).
  - Any future code path calling registerEvent() without checking current state would double-register.

### MENU-05 - Right-click item absent for non-markdown files and empty folders

- **Story:** As a user, I want the right-click 'Edit Meta' item only for markdown files and folders containing markdown so the menu stays uncluttered.
- **Entry point:** folder-menu | **Platform:** desktop
- **Expected behavior:** onMenuOpenCallback checks file instanceof TFile && extension === 'md' for files, and file instanceof TFolder && folderHasMarkdown(file) for folders. Non-markdown files (canvas, pdf, png) and empty/markdown-free folders produce no item. folderHasMarkdown recurses children for any .md TFile at any depth, returning false via ?? false for empty children.
- **Edge cases:**
  - A folder of only sub-folders of non-markdown files returns false at every level.
  - A 'file.md.canvas' (extension canvas) is excluded.
- **Risks / test focus:**
  - folderHasMarkdown is a synchronous recursive tree walk on the main thread before the menu shows; large deeply nested vaults can cause noticeable UI jank.

