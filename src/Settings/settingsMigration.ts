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
 * This relies on every top-level setting being a flat object whose only nested
 * values are scalars or arrays, and on every default array being an empty
 * sentinel (so wholesale array-replacement never drops a default entry). A
 * future nested-object sub-field, or a non-empty default array, would need its
 * own migration. `DEFAULT_SETTINGS` is frozen, so each section is spread into a
 * fresh object rather than mutated.
 */
export function mergeSettings(loaded: Loaded): MetaEditSettings {
    const defaults = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
    const stored = (loaded ?? {}) as Record<string, unknown>;
    const merged: Record<string, unknown> = {};

    for (const key of Object.keys(defaults)) {
        const def = defaults[key];
        const value = stored[key];

        merged[key] = isPlainObject(def) && isPlainObject(value)
            ? {...def, ...value}
            : {...(def as object)};
    }

    return merged as unknown as MetaEditSettings;
}

/**
 * One-time migration of the IgnoredProperties "enabled" flag.
 *
 * Older versions filtered ignored keys regardless of `enabled` (a bug). Now that
 * the toggle is honored, a user who had built up an ignored-key list and then
 * left the feature "off" would silently lose their always-on filtering. Preserve
 * their observed behavior by enabling the feature for them.
 *
 * It runs only for data written before `hideFileTags` existed (detected by its
 * absence in the raw stored section), so once settings are saved with the new
 * field present it never fires again - which means a user can later disable the
 * feature with a non-empty list without it flipping back on. Mutates the passed
 * settings and returns whether anything changed (so the caller can persist).
 */
export function migrateIgnoredEnabled(loaded: Loaded, settings: MetaEditSettings): boolean {
    const rawIgnored = loaded?.IgnoredProperties;
    const isPreVersionData = isPlainObject(rawIgnored) && rawIgnored.hideFileTags === undefined;
    if (!isPreVersionData) return false;

    const ignored = settings.IgnoredProperties;
    if (!ignored.enabled && ignored.properties.length > 0) {
        ignored.enabled = true;
        return true;
    }

    return false;
}
