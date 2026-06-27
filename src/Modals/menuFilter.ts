import type {Property} from "../parser";
import {MetaType} from "../Types/metaType";

/**
 * The controls that decide what the "Edit Meta" menu lists, mirrored from
 * `settings.IgnoredProperties` but kept as a plain shape so this stays a pure,
 * Obsidian-free function that unit tests can drive directly.
 */
export interface MenuFilterOptions {
    /** Master toggle for the whole "Edit Meta menu" filtering feature. */
    enabled: boolean;
    /** Property keys to hide by exact match. */
    ignoredProperties: string[];
    /** Hide body `#tag` occurrences (MetaType.Tag) as a category. */
    hideFileTags: boolean;
}

/**
 * Decide which parsed properties the Edit Meta menu should show.
 *
 * When the feature is disabled, nothing is filtered - so the toggle does exactly
 * what its label promises (the previous implementation filtered ignored keys
 * even when the feature was off). When enabled, drop exact-match ignored keys
 * and, if `hideFileTags` is on, the entire file-tag category.
 *
 * `hideFileTags` only removes `MetaType.Tag` entries (body `#tags`); a frontmatter
 * `tags:` key is a `MetaType.YAML` property and stays editable - exactly what
 * #46/#90 ask for ("I only want to edit frontmatter, not the file's tags").
 */
export function filterMenuItems(data: Property[], opts: MenuFilterOptions): Property[] {
    if (!opts.enabled) return [...data];

    const ignored = new Set(opts.ignoredProperties);
    return data.filter(item => {
        if (ignored.has(item.key)) return false;
        if (opts.hideFileTags && item.type === MetaType.Tag) return false;
        return true;
    });
}
