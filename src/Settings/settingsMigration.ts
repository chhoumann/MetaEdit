import {DEFAULT_SETTINGS} from "./defaultSettings";
import type {MetaEditSettings} from "./metaEditSettings";

type Loaded = Partial<Record<keyof MetaEditSettings, unknown>> | null | undefined;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Merge stored settings onto the defaults, one level deep.
 *
 * `Object.assign({}, DEFAULT_SETTINGS, loaded)` (the old approach) is a shallow
 * merge: a stored section object replaces the default section wholesale, so any
 * field added to an existing section (e.g. `IgnoredProperties.hideFileTags`)
 * reads back `undefined` for existing users instead of its default. Merging each
 * section with a spread backfills new fields while letting stored values win.
 *
 * The defaults are deep-cloned first: `DEFAULT_SETTINGS` is only shallowly
 * frozen, and several settings UIs mutate the section arrays (`properties`,
 * `boards`) in place. Sharing those arrays by reference would let edits leak
 * back into the module-level default and poison later merges, so every section
 * the result returns is fully owned. Unknown top-level keys the stored data
 * carried (e.g. settings from a newer version) are preserved, matching the old
 * Object.assign behavior so a later save never silently drops them.
 *
 * This relies on every top-level setting being a flat object whose only nested
 * values are scalars or arrays. A future nested-object sub-field would need its
 * own merge logic.
 */
export function mergeSettings(loaded: Loaded): MetaEditSettings {
    const defaults = structuredClone(DEFAULT_SETTINGS) as unknown as Record<string, unknown>;
    const stored = (loaded ?? {}) as Record<string, unknown>;

    const merged: Record<string, unknown> = {...stored};

    for (const key of Object.keys(defaults)) {
        const def = defaults[key];
        const value = stored[key];

        merged[key] = isPlainObject(def) && isPlainObject(value)
            ? {...def, ...value}
            : def;
    }

    return merged as unknown as MetaEditSettings;
}

/**
 * One-time migration of the IgnoredProperties section.
 *
 * Older versions filtered ignored keys regardless of `enabled` (a bug). Now that
 * the toggle is honored, a user who had built up an ignored-key list and then
 * left the feature "off" would silently lose their always-on filtering. Preserve
 * their observed behavior by enabling the feature for them.
 *
 * Pre-`hideFileTags` data is detected by that field's absence in the raw stored
 * section. For all such data this returns `true` so the caller persists the
 * normalized shape (now including `hideFileTags`) exactly once; afterwards the
 * field is present and this never fires again - so a user can later disable the
 * feature with a non-empty list without it flipping back on. Mutates the passed
 * settings; returns whether the caller should save.
 */
export function migrateIgnoredProperties(loaded: Loaded, settings: MetaEditSettings): boolean {
    const rawIgnored = loaded?.IgnoredProperties;
    const isPreVersionData = isPlainObject(rawIgnored) && rawIgnored.hideFileTags === undefined;
    if (!isPreVersionData) return false;

    const ignored = settings.IgnoredProperties;
    if (!ignored.enabled && ignored.properties.length > 0) {
        ignored.enabled = true;
    }

    return true;
}
