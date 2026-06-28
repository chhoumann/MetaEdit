import type {App} from "obsidian";
import {MetaType} from "../../Types/metaType";
import type {TagEditMode} from "../../tagEditing";

export type DateInputType = "date" | "datetime";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const NATIVE_BUILT_IN_PROPERTY_NAMES = Object.freeze([
    "aliases",
    "cssclass",
    "cssclasses",
    "publish",
    "tags",
]);

// Cap the rendered dropdown so a property with thousands of distinct values
// cannot build an unbounded list. Filtering runs over the full set first, so a
// specific query still finds rare values; the cap only bounds broad queries.
const MAX_RENDERED_SUGGESTIONS = 100;

/**
 * Distinct values already used for a property across the vault, ranked so the
 * most frequently used values surface first.
 *
 * Tags depend on the edit mode (see TagEditMode): a `rename` replaces the whole
 * tag, so full tag names (without `#`) are suggested; a `leaf` edit replaces only
 * the last `/`-segment, so leaf segments are suggested. Both round-trip safely
 * through the span-based tag writer.
 *
 * Inline Dataview (`key:: value`) fields are not in the metadata cache, so
 * sourcing their values would mean a full-text scan that duplicates the parser;
 * that is a deliberate follow-up, so Dataview keys return nothing for now.
 */
export function getValueSuggestions(app: App, key: string, type: MetaType, tagMode?: TagEditMode): string[] {
    if (!key) return [];

    // These read untyped runtime APIs (getTags, metadataCache); never let a
    // sourcing failure break the prompt - degrade to no suggestions.
    try {
        if (type === MetaType.Tag) {
            return tagMode === "leaf"
                ? rankByCount(collectTagLeafCounts(app))
                : rankByCount(collectTagFullCounts(app));
        }

        if (type === MetaType.YAML) {
            return rankByCount(collectFrontmatterValueCounts(app, key));
        }

        return [];
    } catch {
        return [];
    }
}

/**
 * Whether the value input for this property should be a native date/datetime
 * picker, and which one.
 *
 * Obsidian's property types live in `metadataTypeManager`, which is keyed off
 * frontmatter, so only YAML properties can be typed as date/datetime in a way
 * that round-trips natively. The explicit, user-assigned type wins; otherwise we
 * fall back to Obsidian's own inference (the same signal its Properties panel
 * uses). The picker is only offered when the current value is empty or a value
 * the picker can represent, so free-text/non-ISO values are never clobbered.
 */
export function getDateInputType(
    app: App,
    key: string,
    currentValue: unknown,
    type: MetaType,
): DateInputType | null {
    if (type !== MetaType.YAML || !key) return null;

    let obsidianType: string | null;
    try {
        obsidianType = readObsidianType(app, key);
    } catch {
        return null;
    }
    if (obsidianType !== "date" && obsidianType !== "datetime") return null;

    const value = currentValue === null || currentValue === undefined ? "" : String(currentValue).trim();
    if (value === "") return obsidianType;

    if (obsidianType === "date" && ISO_DATE.test(value)) return "date";
    if (obsidianType === "datetime" && ISO_DATETIME.test(value)) return "datetime";

    return null;
}

/**
 * Property names already used anywhere in the vault, so adding a new property
 * can autocomplete known keys instead of free-typing them.
 */
export function getKnownPropertyNames(app: App): string[] {
    const names = new Set<string>();
    for (const name of NATIVE_BUILT_IN_PROPERTY_NAMES) names.add(name);

    try {
        const all = getMetadataTypeManager(app)?.getAllProperties?.();
        if (!all) return [...names];

        for (const [key, info] of Object.entries(all)) {
            addPropertyName(names, key);
            addPropertyName(names, info?.name);
        }
    } catch {
        return [...names];
    }

    return [...names];
}

/**
 * Filter known values against the current input for the dropdown. Hides the
 * dropdown when it has nothing useful to add: no matches, or a single match
 * identical to what the user already typed.
 */
export function filterSuggestions(items: string[], inputStr: string): string[] {
    const query = inputStr.toLowerCase();
    const filtered = items.filter(item => item.toLowerCase().includes(query));

    if (filtered.length === 0) return [];
    if (filtered.length === 1 && filtered[0] === inputStr) return [];

    return filtered.slice(0, MAX_RENDERED_SUGGESTIONS);
}

function collectTagLeafCounts(app: App): Map<string, number> {
    const counts = new Map<string, number>();

    for (const [tag, count] of Object.entries(readVaultTags(app))) {
        const leaf = tag.replace(/^#/, "").split("/").pop()?.trim();
        if (!leaf) continue;
        counts.set(leaf, (counts.get(leaf) ?? 0) + (count ?? 1));
    }

    return counts;
}

function collectTagFullCounts(app: App): Map<string, number> {
    const counts = new Map<string, number>();

    for (const [tag, count] of Object.entries(readVaultTags(app))) {
        const full = tag.replace(/^#/, "").trim();
        if (!full) continue;
        counts.set(full, (counts.get(full) ?? 0) + (count ?? 1));
    }

    return counts;
}

function readVaultTags(app: App): Record<string, number> {
    // getTags() is present at runtime but missing from the pinned obsidian typings.
    const metadataCache = app.metadataCache as unknown as {getTags?: () => Record<string, number>};
    return metadataCache.getTags?.() ?? {};
}

function collectFrontmatterValueCounts(app: App, key: string): Map<string, number> {
    const counts = new Map<string, number>();

    for (const file of app.vault.getMarkdownFiles()) {
        const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
        if (!frontmatter || !Object.prototype.hasOwnProperty.call(frontmatter, key)) continue;

        for (const value of flattenValues(frontmatter[key])) {
            counts.set(value, (counts.get(value) ?? 0) + 1);
        }
    }

    return counts;
}

function flattenValues(raw: unknown): string[] {
    const values = Array.isArray(raw) ? raw : [raw];
    const out: string[] = [];

    for (const value of values) {
        if (value === null || value === undefined) continue;
        if (typeof value === "object") continue;
        const text = String(value).trim();
        if (text) out.push(text);
    }

    return out;
}

function rankByCount(counts: Map<string, number>): string[] {
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([value]) => value);
}

function readObsidianType(app: App, key: string): string | null {
    // metadataTypeManager is not in the pinned obsidian typings but is present at
    // runtime (Obsidian >= 1.4). Feature-detect and degrade to plain text.
    const typeManager = getMetadataTypeManager(app);
    if (!typeManager) return null;

    const assigned = typeManager.getAssignedWidget?.(key);
    if (typeof assigned === "string") return assigned;

    const registered = typeManager.getAllProperties?.()?.[key]?.widget;
    if (typeof registered === "string") return registered;

    const inferred = typeManager.getTypeInfo?.(key)?.expected?.type;
    return typeof inferred === "string" ? inferred : null;
}

function addPropertyName(names: Set<string>, value: unknown): void {
    if (typeof value !== "string") return;

    const trimmed = value.trim();
    if (trimmed) names.add(trimmed);
}

function getMetadataTypeManager(app: App): {
    getAllProperties?: () => Record<string, {name?: unknown, widget?: unknown} | undefined>;
    getAssignedWidget?: (key: string) => string | null;
    getTypeInfo?: (key: string) => {expected?: {type?: string}} | undefined;
} | null {
    return (app as unknown as {
        metadataTypeManager?: {
            getAllProperties?: () => Record<string, {name?: unknown, widget?: unknown} | undefined>;
            getAssignedWidget?: (key: string) => string | null;
            getTypeInfo?: (key: string) => {expected?: {type?: string}} | undefined;
        };
    }).metadataTypeManager ?? null;
}
