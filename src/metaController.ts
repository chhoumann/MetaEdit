import MetaEditParser, {type InlineFieldInsertLocation, type Property} from "./parser";
import type {App, TFile} from "obsidian";
import type MetaEdit from "./main";
import GenericPrompt from "./Modals/GenericPrompt/GenericPrompt";
import {EditMode} from "./Types/editMode";
import GenericSuggester from "./Modals/GenericSuggester/GenericSuggester";
import type {ProgressProperty} from "./Types/progressProperty";
import {ProgressPropertyOptions} from "./Types/progressPropertyOptions";
import {MetaType} from "./Types/metaType";
import {Notice, normalizePath} from "obsidian";
import {log} from "./logger/logManager";
import AutoPropertyValueModal from "./Modals/AutoPropertyValueModal/AutoPropertyValueModal";
import type {AutoProperty} from "./Types/autoProperty";
import {findAutoProperty, isMultiAutoProperty, toValueArray, withChoiceAdded} from "./autoProperties";
import {applyMultiValueEdit, isMultiValueYamlProperty, shouldUseMultiValueEditor, type MultiValueEdit} from "./multiValue";
import {getYamlPath, isYamlParentContainerValue, parseYamlPath, setYamlPath, YamlPathError, type SetYamlPathOptions, type YamlPathSegment} from "./yamlPath";
import {computeTagRewrite, isNestedTag, isTagsKey, isValidTagToken, normalizeTagToken, splitFrontmatterTags, spliceTag, stripHash, tagLeaf, tagParent, canonicalizeFrontmatterTag, type TagEditMode} from "./tagEditing";
import {setPendingValueContext} from "./Modals/GenericPrompt/promptValueContext";

const fileWriteQueues: Map<string, Promise<unknown>> = new Map();
const ADD_FIRST_SELECTION = "metaedit:multi-value:add-first";
const ADD_TO_BEGINNING_SELECTION = "metaedit:multi-value:add-beginning";
const ADD_TO_END_SELECTION = "metaedit:multi-value:add-end";
const VALUE_SELECTION_PREFIX = "metaedit:multi-value:value:";

export default class MetaController {
    private parser: MetaEditParser;
    private readonly app: App;
    private plugin: MetaEdit;
    private readonly hasTrackerPlugin: boolean = false;

    constructor(app: App, plugin: MetaEdit) {
        this.app = app;
        this.parser = new MetaEditParser(app);
        this.plugin = plugin;
        // @ts-expect-error - app.plugins is not part of the public Obsidian API
        this.hasTrackerPlugin = !!this.app.plugins.plugins["obsidian-tracker"];
    }

    public async getPropertiesInFile(file: TFile): Promise<Property[]> {
        const yaml = await this.parser.parseFrontmatter(file);
        const inlineFields = await this.parser.parseInlineFields(file);
        const tags = await this.parser.getTagsForFile(file);

        return [...tags, ...yaml, ...inlineFields];
    }

    public async addYamlProp(propName: string, propValue: unknown, file: TFile): Promise<void> {
        const settings = this.plugin.settings;

        // A new `tags`/`tag` property is stored as a canonical, `#`-free list.
        if (isTagsKey(propName)) {
            propValue = splitFrontmatterTags(propValue);
        }

        const activeAutoProperty = this.getActiveAutoProperty(propName);
        const autoPropertyKeepsScalar = !!activeAutoProperty &&
            !isMultiAutoProperty(activeAutoProperty, settings.EditMode, propName);
        if (!Array.isArray(propValue) &&
            !autoPropertyKeepsScalar &&
            (settings.EditMode.mode === EditMode.AllMulti ||
            (settings.EditMode.mode === EditMode.SomeMulti && settings.EditMode.properties.contains(propName)))) {
            propValue = [propValue];
        }

        let propertyExists = false;
        await this.enqueueFileWrite(file, async () => {
            await this.processFrontMatter(file, (frontmatter) => {
                if (Object.prototype.hasOwnProperty.call(frontmatter, propName)) {
                    propertyExists = true;
                    return;
                }

                frontmatter[propName] = propValue;
            });
        });

        if (propertyExists) {
            new Notice(`Frontmatter in file '${file.name}' already has property '${propName}'. Will not add.`);
        }
    }

    /**
     * Append a NEW inline `name:: value` field instance, leaving any existing
     * same-named fields untouched. This is the add-an-instance counterpart to
     * {@link updatePropertyInFile}, which replaces every existing instance.
     *
     * Placement is computed by {@link MetaEditParser.computeInlineInsertIndex} so the
     * field is never inserted inside frontmatter or a fenced code block. The write goes
     * through the per-file queue, so it serializes with other MetaEdit writes instead of
     * racing them (the previous implementation read and wrote outside the queue, and
     * silently no-opped when the chosen line index was 0).
     */
    public async appendDataviewField(
        propName: string,
        propValue: unknown,
        file: TFile,
        options: {location?: InlineFieldInsertLocation} = {},
    ): Promise<void> {
        const valueStr = Array.isArray(propValue) ? propValue.join(", ") : String(propValue);
        const location = options.location ?? "afterLastMatch";

        await this.enqueueFileWrite(file, async () => {
            const content = await this.app.vault.read(file);
            // Preserve the file's existing newline so a CRLF note does not gain a stray LF.
            const newline = content.includes("\r\n") ? "\r\n" : "\n";
            const lines = content.split(/\r?\n/);
            const insertIndex = this.parser.computeInlineInsertIndex(content, propName, location);
            lines.splice(insertIndex, 0, `${propName}:: ${valueStr}`);

            await this.app.vault.modify(file, lines.join(newline));
        });
    }

    public async editMetaElement(property: Property, meta: Property[], file: TFile): Promise<void> {
        if (property.type === MetaType.Tag) {
            await this.editTag(property, file);
            return;
        }

        if (this.isYamlParentContainer(property)) {
            new Notice(`Nested YAML parent '${property.key}' cannot be edited as a text value.`);
            return;
        }

        // Auto Properties own their value-entry UX (description, pick-or-create,
        // single/multi). They take precedence over the global EditMode flow.
        if (this.getActiveAutoProperty(property.key)) {
            await this.editAutoProperty(property, file);
            return;
        }

        // A real YAML list is inherently multi-value, so it always uses the
        // element-aware list editor - editing it as a single text line (the
        // `standardMode` path) would flatten the list and shred elements that
        // contain commas or `[[wikilinks]]`.
        if (shouldUseMultiValueEditor(property, this.plugin.settings.EditMode))
            await this.multiValueMode(property, file);
        else
            await this.standardMode(property, file);
    }

    /**
     * Edit a single body `#tag` occurrence.
     *
     * Decision D: the primary action RENAMES the whole tag (a flat tag is renamed,
     * not turned into a child); "Edit last segment" is offered only for nested
     * tags; Tracker's `#tag:value` data syntax is offered only when the Tracker
     * plugin is present. The chosen action is derived here per edit and baked into
     * the replacement token, so nothing about Tracker survives on the controller
     * (BUG-1). The exact occurrence is rewritten by position (BUG-2/BUG-3).
     */
    private async editTag(property: Property, file: TFile) {
        const tag = property.key;
        const nested = isNestedTag(tag);

        const RENAME = "Rename tag", LEAF = "Edit last segment", TRACKER = "Tracker value (#tag:value)";
        const actions: string[] = [RENAME];
        if (nested) actions.push(LEAF);
        if (this.hasTrackerPlugin) actions.push(TRACKER);

        let action = RENAME;
        if (actions.length > 1) {
            action = await GenericSuggester.Suggest(this.app, actions, actions);
            if (!action) return; // cancelled
        }

        const mode: TagEditMode = action === TRACKER ? "tracker" : action === LEAF ? "leaf" : "rename";

        let input: string | null;
        // Preserve the Auto Property hook for the leaf of a nested tag (the only
        // case it ever matched): an Auto Property named after the parent path -
        // WITH the leading `#`, matching the historical key (`#area` for `#area/x`)
        // - supplies the new leaf value.
        const parentPath = tagParent(tag);
        if (mode === "leaf" && this.getActiveAutoProperty(parentPath)) {
            const autoProp = await this.handleAutoProperties(parentPath);
            if (autoProp === null) return; // cancelled
            input = Array.isArray(autoProp) ? autoProp.join(", ") : autoProp;
        } else if (mode === "tracker") {
            // A Tracker value is free-form data, not a tag name - clear the tag
            // suggestion context the picker seeded so it does not autocomplete.
            setPendingValueContext(null);
            input = await GenericPrompt.Prompt(this.app, `Enter a Tracker value for ${tag}`);
        } else {
            // Source mode-appropriate suggestions through the prompt bridge: full
            // tag names for a rename, leaf segments for a last-segment edit.
            setPendingValueContext({app: this.app, key: tag, type: MetaType.Tag, tagMode: mode});
            const header = mode === "leaf" ? `Change the last segment of ${tag} to` : `Rename ${tag} to`;
            const seed = mode === "leaf" ? tagLeaf(tag) : stripHash(tag);
            input = await GenericPrompt.Prompt(this.app, header, seed, seed);
        }

        if (input === null) return; // cancelled
        const newToken = computeTagRewrite(tag, input, mode);
        if (!newToken || newToken === tag) return; // nothing to change

        if (!isValidTagToken(normalizeTagToken(newToken))) {
            new Notice(`'${input.trim()}' is not a valid tag name. Tags cannot contain spaces or commas.`);
            return;
        }

        await this.updatePropertyFromUi(property, newToken, file);
    }

    public async handleProgressProps(meta: Property[], file: TFile): Promise<void> {
        try {
            const {enabled, properties} = this.plugin.settings.ProgressProperties;
            if (!enabled) return;

            const tasks = this.app.metadataCache.getFileCache(file)?.listItems?.filter(li => li.task);
            if (!tasks) return;
            let total: number = 0, complete: number = 0, incomplete: number = 0;

            total = tasks.length;
            // Only a checked task ([x]/[X]) counts as complete. Custom markers like
            // [/] in-progress, [-] cancelled, [>] forwarded or [?] are NOT complete;
            // counting every non-blank marker as complete over-reported progress.
            complete = tasks.filter(i => (i.task ?? "").toLowerCase() === "x").length;
            incomplete = total - complete;

            const props = await this.progressPropHelper(properties, meta, {total, complete, incomplete});
            await this.updateMultipleInFile(props, file);
        }
        catch (e) {
            log.logError(e);
        }
    }

    public async createNewProperty(suggestValues?: string[]) {
        const propName = await GenericPrompt.Prompt(this.app, "Enter a property name", "Property", "", suggestValues);
        if (!propName) return null;

        let propValue: string | string[];
        if (this.getActiveAutoProperty(propName)) {
            const autoProp = await this.handleAutoProperties(propName);
            if (autoProp === null) return null; // user cancelled the auto property prompt
            propValue = autoProp;
        } else {
            const entered = await GenericPrompt.Prompt(this.app, "Enter a property value", "Value")
                .catch(() => null);
            if (entered === null) return null;
            propValue = entered;
        }

        return {propName, propValue: typeof propValue === "string" ? propValue.trim() : propValue};
    }

    public async deleteProperty(property: Property, file: TFile): Promise<void> {
        if (property.type === MetaType.YAML && (property.isNested || property.isVirtual)) {
            new Notice(`Nested YAML property '${property.key}' cannot be deleted by MetaEdit yet.`);
            return;
        }

        // Serialize with every other MetaEdit write to this file. The previous
        // implementation read/modified outside the queue and could race a queued
        // write (lost update), and the transform-property flow deletes-then-adds.
        await this.enqueueFileWrite(file, async () => {
            // A top-level YAML key is removed through the frontmatter primitive so
            // a multi-line block value (a block list or map) is deleted whole. The
            // old single-line regex stripped only the `key:` line and orphaned its
            // `- a` / `- b` continuation lines, corrupting the frontmatter.
            if (property.type === MetaType.YAML) {
                await this.processFrontMatter(file, (frontmatter) => {
                    delete frontmatter[property.key];
                });
                return;
            }

            // Inline (Dataview) and other line-based fields: remove the matching
            // line, preserving the file's existing newline so a CRLF note keeps it.
            const fileContent = await this.app.vault.read(file);
            const newline = fileContent.includes("\r\n") ? "\r\n" : "\n";
            const splitContent = fileContent.split(/\r?\n/);
            // Escape the key (so a key like `c++` is not read as regex) and require
            // the inline `::` separator, so deleting an inline `key:: value` never
            // matches a same-named YAML frontmatter `key:` line earlier in the file.
            const regexp = new RegExp(`^\\s*${this.escapeSpecialCharacters(property.key)}\\s*::`);

            const idx = splitContent.findIndex(s => s.match(regexp));
            if (idx === -1) return;
            splitContent.splice(idx, 1);

            await this.app.vault.modify(file, splitContent.join(newline));
        });
    }

    private async progressPropHelper(progressProps: ProgressProperty[], meta: Property[], counts: {total: number, complete: number, incomplete: number}) {
        return progressProps.reduce((obj: Property[], el) => {
            const property = meta.find(prop => prop.key === el.name);
            if (property) {
                switch (el.type) {
                    case ProgressPropertyOptions.TaskComplete:
                        obj.push({...property, content: counts.complete.toString()});
                        break;
                    case ProgressPropertyOptions.TaskIncomplete:
                        obj.push({...property, content: counts.incomplete.toString()});
                        break;
                    case ProgressPropertyOptions.TaskTotal:
                        obj.push({...property, content: counts.total.toString()});
                        break;
                    default: break;
                }
            }

            return obj;
        }, [])
    }

    private async standardMode(property: Property, file: TFile): Promise<void> {
        // Auto Properties are intercepted in editMetaElement, so this path only
        // handles free-text values.
        const newValue = await GenericPrompt.Prompt(this.app, `Enter a new value for ${property.key}`, property.content, property.content);

        if (newValue) {
            await this.updatePropertyFromUi(property, newValue, file);
        }
    }

    private async multiValueMode(property: Property, file: TFile): Promise<boolean> {
        // A YAML list is edited element-by-element off its ORIGINAL typed array,
        // so every element the user does not touch keeps its exact type, order,
        // and spelling (commas and `[[wikilinks]]` included). An inline field (or
        // a YAML value stored as a comma string) has no real array, so it is
        // split on commas and re-joined.
        // Frontmatter `tags` is always edited as a canonical list: any stored
        // shape (list, scalar, comma/space string) is read with the `#` stripped,
        // and it is written back as a YAML list (Obsidian's canonical form).
        const tagsKey = property.type === MetaType.YAML && isTagsKey(property.key);
        const editsArray = tagsKey || isMultiValueYamlProperty(property);
        const writeBase: unknown[] = tagsKey
            ? splitFrontmatterTags(property.content)
            : editsArray
                ? (property.content as unknown[])
                : this.splitMultiValue(property);
        // The selectable view is always strings, kept 1:1 with `writeBase` so a
        // selection maps back to the correct element.
        const displayValues: string[] = editsArray
            ? writeBase.map(value => (value ?? "").toString())
            : (writeBase as string[]);

        let selectedOption: string;
        const valueSelection = (index: number) => `${VALUE_SELECTION_PREFIX}${index}`;
        if (displayValues.length == 0 || (displayValues.length == 1 && displayValues[0] == "")) {
            const options = ["Add new value"];
            selectedOption = await GenericSuggester.Suggest(this.app, options, [ADD_FIRST_SELECTION]);
        }
        else if (displayValues.length == 1) {
            const options = [displayValues[0], "Add to end", "Add to beginning"];
            selectedOption = await GenericSuggester.Suggest(this.app, options, [valueSelection(0), ADD_TO_END_SELECTION, ADD_TO_BEGINNING_SELECTION]);
        } else {
            const options = ["Add to end", ...displayValues, "Add to beginning"];
            selectedOption = await GenericSuggester.Suggest(
                this.app,
                options,
                [ADD_TO_END_SELECTION, ...displayValues.map((_, index) => valueSelection(index)), ADD_TO_BEGINNING_SELECTION],
            );
        }

        if (!selectedOption) return false;

        let tempValue: string;
        const parsedSelectedIndex = selectedOption.startsWith(VALUE_SELECTION_PREFIX)
            ? Number(selectedOption.substring(VALUE_SELECTION_PREFIX.length))
            : -1;
        const selectedIndex = Number.isInteger(parsedSelectedIndex) ? parsedSelectedIndex : -1;
        // (Auto Properties are intercepted in editMetaElement; this path is free-text.)
        const isAddCommand =
            selectedOption === ADD_FIRST_SELECTION ||
            selectedOption === ADD_TO_BEGINNING_SELECTION ||
            selectedOption === ADD_TO_END_SELECTION;
        if (isAddCommand) {
            tempValue = await GenericPrompt.Prompt(this.app, "Enter a new value");
        } else {
            const selectedValue = displayValues[selectedIndex] ?? "";
            tempValue = await GenericPrompt.Prompt(this.app, `Change ${selectedValue} to`, selectedValue);
        }

        if (!tempValue) return false;

        // A tag entered with a leading `#` (`#area/x`) is stored without it.
        if (tagsKey) tempValue = canonicalizeFrontmatterTag(tempValue);
        if (tagsKey && tempValue === "") return false;

        const edit: MultiValueEdit =
            selectedOption === ADD_FIRST_SELECTION ? {kind: "addFirst", value: tempValue} :
            selectedOption === ADD_TO_BEGINNING_SELECTION ? {kind: "prepend", value: tempValue} :
            selectedOption === ADD_TO_END_SELECTION ? {kind: "append", value: tempValue} :
            {kind: "replace", index: selectedIndex, value: tempValue};

        const newList = applyMultiValueEdit(writeBase, edit);

        // Only values that began as native YAML arrays persist as arrays. YAML
        // scalars routed here by EditMode stay scalar strings.
        const newValue: unknown = editsArray ? newList : newList.join(", ");

        return await this.updatePropertyFromUi(property, newValue, file);
    }

    private getActiveAutoProperty(propertyName: string): AutoProperty | undefined {
        if (!this.plugin.settings.AutoProperties.enabled) return undefined;
        return findAutoProperty(this.plugin.settings.AutoProperties.properties, propertyName);
    }

    /**
     * Open the Auto Property value prompt for `propertyName`, if one is defined and
     * enabled. Returns a string for a Single property, a string[] for a Multi
     * property, or null when there is no auto property or the user cancels.
     */
    public async handleAutoProperties(propertyName: string, currentValue?: unknown): Promise<string | string[] | null> {
        const autoProp = this.getActiveAutoProperty(propertyName);
        if (!autoProp) return null;

        const isMulti = isMultiAutoProperty(autoProp, this.plugin.settings.EditMode, propertyName);

        return await AutoPropertyValueModal.Show(this.app, autoProp, {
            isMulti,
            currentValue,
            onSaveChoices: (values: string[]) => this.persistAutoPropertyChoices(autoProp, values),
        });
    }

    private async editAutoProperty(property: Property, file: TFile): Promise<void> {
        const result = await this.handleAutoProperties(property.key, property.content);
        if (result === null || result === undefined) return;

        // YAML keeps a real list; inline/tag fields store a comma-joined string.
        const newValue: unknown =
            Array.isArray(result) && property.type !== MetaType.YAML ? result.join(", ") : result;

        await this.updatePropertyFromUi(property, newValue, file);
    }

    private async persistAutoPropertyChoices(autoProp: AutoProperty, values: string[]): Promise<void> {
        // Serialize this read-modify-write with every other settings write (the public
        // API's setAutoProperties, the settings tab) so two concurrent choice-adds can't
        // lost-update each other. The mutation runs at the head of the write queue, so it
        // re-reads the freshest list and resolves the entry there.
        try {
            await this.plugin.updateSettings(() => {
                const list = this.plugin.settings.AutoProperties.properties;
                // Prefer the exact object, but fall back to name so we still resolve if a
                // concurrent write replaced the entry while the prompt was open.
                const idx = list.indexOf(autoProp) !== -1 ? list.indexOf(autoProp) : list.findIndex(a => a.name === autoProp.name);
                if (idx === -1) return false;

                // Append to the LIVE entry's current choices so a concurrent edit is
                // preserved rather than overwritten with a stale snapshot.
                let updated = list[idx];
                for (const value of values) {
                    updated = withChoiceAdded(updated, value);
                }
                if (updated === list[idx]) return false; // nothing new

                const previous = list[idx];
                list[idx] = updated;
                return () => { list[idx] = previous; }; // roll back if the save fails
            });
        } catch (error) {
            // The prompt's value is still valid for the note; only the choice-list save
            // failed. updateSettings already rolled the in-memory list back, so surface
            // the failure rather than letting the choice silently vanish on reload.
            const reason = error instanceof Error ? error.message : String(error);
            new Notice(`MetaEdit could not save the Auto Property choice: ${reason}`);
            log.logMessage(`MetaEdit could not save Auto Property choices for '${autoProp.name}': ${reason}`);
        }
    }

    public async updatePropertyInFile(property: Partial<Property>, newValue: unknown, file: TFile): Promise<void> {
        if (!property.key) return;

        await this.enqueueFileWrite(file, async () => {
            if (property.type === MetaType.YAML) {
                await this.processFrontMatter(file, (frontmatter) => {
                    if (property.path && property.path.length > 1) {
                        setYamlPath(frontmatter, property.path, newValue, {
                            createParents: false,
                            createLeaf: false,
                            expectedValue: property.content,
                            validateExpectedValue: true,
                        });
                    } else if (isTagsKey(property.key)) {
                        // Canonicalise `tags`: strip `#`, drop blanks, store a list.
                        // When the last tag is gone, remove the key (Decision E)
                        // rather than leave a dangling `tags:` / `tags: []`.
                        const tags = splitFrontmatterTags(newValue);
                        if (tags.length === 0) delete frontmatter[property.key!];
                        else frontmatter[property.key!] = tags;
                    } else {
                        frontmatter[property.key!] = newValue;
                    }
                });
                return;
            }

            if (property.type === MetaType.Tag) {
                await this.writeTagOccurrence(property, newValue, file);
                return;
            }

            const fileContent = await this.app.vault.read(file);

            const newFileContent = fileContent.split("\n").map(line => {
                if (this.lineMatch(property, line)) {
                    return this.updatePropertyLine(property, newValue, line);
                }

                return line;
            }).join("\n");

            await this.app.vault.modify(file, newFileContent);
        });
    }

    /**
     * Rewrite one body-tag occurrence in place, by its parsed span. The span is
     * re-validated against current file content first, so an edit that raced a
     * change to the note refuses to write (with a Notice) rather than corrupt
     * unrelated text. `newValue` is the full replacement token computed by the UI.
     */
    private async writeTagOccurrence(property: Partial<Property>, newValue: unknown, file: TFile): Promise<void> {
        // The UI passes a full token (`#new`, `#a/leaf`, `#tag:value`); a bare
        // value from the API (`"done"`) is normalised to `#done`. Reject anything
        // that is not a single valid tag rather than splice invalid text into the
        // note (e.g. `#meeting notes`, which Obsidian would parse as `#meeting`).
        const newToken = normalizeTagToken(String(newValue));
        if (!isValidTagToken(newToken)) {
            throw new Error(`'${String(newValue)}' is not a valid tag name.`);
        }

        const content = await this.app.vault.read(file);
        const updated = spliceTag(content, property.position, property.key ?? "", newToken);

        if (updated === null) {
            throw new Error(
                `could not locate the tag '${property.key}' to edit - the note may have changed since it was opened. Reopen and try again.`,
            );
        }

        await this.app.vault.modify(file, updated);
    }

    private escapeSpecialCharacters(text: string): string{
        return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    }

    private lineMatch(property: Partial<Property>, line: string): boolean {
        if (!property.key) return false;

        const tagRegex = new RegExp(`^\\s*${this.escapeSpecialCharacters(property.key)}`);

        if (property.key.contains('#')) {
            return tagRegex.test(line);
        }

        if (property.type === MetaType.Dataview) {
            return this.dataviewPropertyRegex(property.key).test(line);
        }

        const propertyRegex = new RegExp(`^\\s*${this.escapeSpecialCharacters(property.key)}\\s*:`);
        return propertyRegex.test(line);
    }

    private updatePropertyLine(property: Partial<Property>, newValue: unknown, line: string) {
        if (!property.key) return line;

        let newLine: string;
        switch (property.type) {
            case MetaType.Dataview:
                newLine = this.parser.replaceInlineFieldValue(line, property.key, String(newValue));
                break;
            case MetaType.YAML:
                newLine = `${property.key}: ${newValue}`;
                break;
            // Body tags are rewritten by span in writeTagOccurrence, never here.
            default:
                // Never collapse a matched line to just the key - leave it untouched.
                newLine = line;
                break;
        }

        return newLine;
    }

    private async updateMultipleInFile(properties: Property[], file: TFile): Promise<void> {
        await this.enqueueFileWrite(file, async () => {
            const yamlProperties = properties.filter(prop => prop.type === MetaType.YAML && !prop.path);
            const yamlPathProperties = properties.filter(prop => prop.type === MetaType.YAML && prop.path);
            const tagProperties = properties.filter(prop => prop.type === MetaType.Tag);
            const textProperties = properties.filter(prop => prop.type !== MetaType.YAML && prop.type !== MetaType.Tag);

            // Splice body tags FIRST, while their parsed offsets still match the
            // file. A later processFrontMatter write only touches the frontmatter,
            // so it preserves these body edits; doing it the other way round would
            // shift every body offset and stale the tag spans. Highest-offset-first
            // keeps earlier spans valid as later ones change length; a stale span
            // is skipped, never forced, so a batch never corrupts prose.
            if (tagProperties.length > 0) {
                let content = await this.app.vault.read(file);
                for (const prop of [...tagProperties].sort((a, b) => (b.position?.start ?? 0) - (a.position?.start ?? 0))) {
                    const token = normalizeTagToken(String(prop.content));
                    if (!isValidTagToken(token)) {
                        log.logMessage(`MetaEdit skipped tag '${prop.key}': '${String(prop.content)}' is not a valid tag.`);
                        continue;
                    }
                    const updated = spliceTag(content, prop.position, prop.key, token);
                    if (updated === null) {
                        log.logMessage(`MetaEdit skipped tag '${prop.key}': its position no longer matches the note.`);
                        continue;
                    }
                    content = updated;
                }
                await this.app.vault.modify(file, content);
            }

            if (yamlProperties.length > 0 || yamlPathProperties.length > 0) {
                await this.processFrontMatter(file, (frontmatter) => {
                    for (const prop of yamlProperties) {
                        frontmatter[prop.key] = prop.content;
                    }
                    for (const prop of yamlPathProperties) {
                        setYamlPath(frontmatter, prop.path, prop.content, {createParents: false, createLeaf: false});
                    }
                });
            }

            if (textProperties.length > 0) {
                let lines = (await this.app.vault.read(file)).split("\n");
                for (const prop of textProperties) {
                    lines = lines.map(line => this.lineMatch(prop, line) ? this.updatePropertyLine(prop, prop.content, line) : line);
                }
                await this.app.vault.modify(file, lines.join("\n"));
            }
        });
    }

    private dataviewPropertyRegex(propertyKey: string): RegExp {
        return new RegExp(`(^|[\\s\\[\\(])(${this.escapeSpecialCharacters(propertyKey)})::[ ]*([^\\)\\]\\n\\r]*)(\\]\\]|[\\]\\)]?)`, "g");
    }

    private splitMultiValue(property: Partial<Property>): string[] {
        return toValueArray(property.content);
    }

    private async updatePropertyFromUi(property: Property, newValue: unknown, file: TFile): Promise<boolean> {
        try {
            await this.updatePropertyInFile(property, newValue, file);
            return true;
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            new Notice(`MetaEdit could not update '${property.key}': ${reason}`);
            log.logMessage(`MetaEdit could not update '${property.key}': ${reason}`);
            return false;
        }
    }

    private isYamlParentContainer(property: Property): boolean {
        if (property.type !== MetaType.YAML || property.isVirtual) return false;
        return isYamlParentContainerValue(property.content);
    }

    public async getYamlPath(path: string | readonly YamlPathSegment[], file: TFile): Promise<unknown> {
        const resolvedPath = parseYamlPath(path);
        const frontmatter = await this.parser.parseFrontmatterObject(file);
        if (!frontmatter) return undefined;

        try {
            return getYamlPath(frontmatter, resolvedPath);
        } catch (error) {
            if (error instanceof YamlPathError) return undefined;
            throw error;
        }
    }

    public async updateYamlPath(path: string | readonly YamlPathSegment[], value: unknown, file: TFile): Promise<void> {
        const resolvedPath = parseYamlPath(path);

        await this.enqueueFileWrite(file, async () => {
            await this.processFrontMatter(file, (frontmatter) => {
                setYamlPath(frontmatter, resolvedPath, value, {createParents: false, createLeaf: false});
            });
        });
    }

    public async addOrUpdateYamlPath(
        path: string | readonly YamlPathSegment[],
        value: unknown,
        file: TFile,
        options: SetYamlPathOptions = {},
    ): Promise<void> {
        const resolvedPath = parseYamlPath(path);
        const createParents = options.createParents ?? true;

        await this.enqueueFileWrite(file, async () => {
            await this.processFrontMatter(file, (frontmatter) => {
                setYamlPath(frontmatter, resolvedPath, value, {createParents});
            });
        });
    }

    /**
     * Run a `processFrontMatter` mutation serialized through this file's write
     * queue, so it interleaves safely with every other MetaEdit write to the same
     * file (the inline/tag `vault.read`+`vault.modify` paths in particular, which
     * Obsidian does NOT serialize against a bare `processFrontMatter`). This is the
     * queue-aware entry point for collaborators that compute and apply a frontmatter
     * change in one callback - e.g. the bulk editor - rather than reimplementing the
     * queue.
     *
     * Internal: reachable via the public `plugin.controller` but NOT part of the
     * `IMetaEditApi` contract; treat it as a controller-internal escape hatch. The
     * `update` callback runs at the top of the queue and MUST NOT itself enqueue
     * another write to the same file (e.g. call back into a queued controller
     * method), because that inner write would chain behind this one's still-pending
     * promise and deadlock.
     */
    public async enqueueFrontmatterWrite(file: TFile, update: (frontmatter: Record<string, unknown>) => void): Promise<void> {
        await this.enqueueFileWrite(file, () => this.processFrontMatter(file, update));
    }

    private async processFrontMatter(file: TFile, update: (frontmatter: Record<string, unknown>) => void): Promise<void> {
        await this.app.fileManager.processFrontMatter(file, update);
    }

    private async enqueueFileWrite<T>(file: TFile, task: () => Promise<T>): Promise<T> {
        const key = normalizePath(file.path);
        const previous = fileWriteQueues.get(key) ?? Promise.resolve();
        const queued = previous.catch(() => undefined).then(task);

        fileWriteQueues.set(key, queued);

        try {
            return await queued;
        }
        finally {
            if (fileWriteQueues.get(key) === queued) {
                fileWriteQueues.delete(key);
            }
        }
    }
}
