import type {App} from "obsidian";
import {MetaType} from "../../Types/metaType";

export type DateInputType = "date" | "datetime";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Distinct values already used for a property across the vault, ranked so the
 * most frequently used values surface first.
 *
 * Tags resolve to their leaf segment (the part after the last `/`) because
 * MetaEdit rewrites a tag by replacing only that last segment - suggesting a
 * full `topic/science` path while editing `#topic/science` would write
 * `#topic/topic/science`. Leaf segments are the only values that round-trip
 * safely through the tag writer.
 */
export function getValueSuggestions(app: App, key: string, type: MetaType): string[] {
    if (!key) return [];

    if (type === MetaType.Tag) {
        return rankByCount(collectTagLeafCounts(app));
    }

    return rankByCount(collectFrontmatterValueCounts(app, key));
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

    const obsidianType = readObsidianType(app, key);
    if (obsidianType !== "date" && obsidianType !== "datetime") return null;

    const value = currentValue === null || currentValue === undefined ? "" : String(currentValue).trim();
    if (value === "") return obsidianType;

    if (obsidianType === "date" && ISO_DATE.test(value)) return "date";
    if (obsidianType === "datetime" && ISO_DATETIME.test(value)) return "datetime";

    return null;
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

    return filtered;
}

function collectTagLeafCounts(app: App): Map<string, number> {
    const counts = new Map<string, number>();
    // getTags() is present at runtime but missing from the pinned obsidian typings.
    const metadataCache = app.metadataCache as unknown as {getTags?: () => Record<string, number>};
    const tags: Record<string, number> = metadataCache.getTags?.() ?? {};

    for (const [tag, count] of Object.entries(tags)) {
        const leaf = tag.replace(/^#/, "").split("/").pop()?.trim();
        if (!leaf) continue;
        counts.set(leaf, (counts.get(leaf) ?? 0) + (count ?? 1));
    }

    return counts;
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
    const typeManager = (app as unknown as {
        metadataTypeManager?: {
            getAssignedWidget?: (key: string) => string | null;
            getTypeInfo?: (key: string) => {expected?: {type?: string}} | undefined;
        };
    }).metadataTypeManager;
    if (!typeManager) return null;

    const assigned = typeManager.getAssignedWidget?.(key);
    if (typeof assigned === "string") return assigned;

    const inferred = typeManager.getTypeInfo?.(key)?.expected?.type;
    return typeof inferred === "string" ? inferred : null;
}
