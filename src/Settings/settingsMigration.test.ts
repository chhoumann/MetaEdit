import {describe, expect, it} from "vitest";
import {mergeSettings, migrateIgnoredProperties} from "./settingsMigration";
import {DEFAULT_SETTINGS} from "./defaultSettings";
import {EditMode} from "../Types/editMode";

describe("mergeSettings", () => {
    it("returns the defaults for a fresh install (null)", () => {
        expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    });

    it("does not return the frozen default objects by reference", () => {
        const merged = mergeSettings(null);
        expect(merged).not.toBe(DEFAULT_SETTINGS);
        expect(merged.IgnoredProperties).not.toBe(DEFAULT_SETTINGS.IgnoredProperties);
        // Frozen defaults must not leak through: the result must be writable.
        expect(() => {
            merged.IgnoredProperties.hideFileTags = true;
        }).not.toThrow();
    });

    it("never aliases the mutable default arrays (UIs mutate them in place)", () => {
        const merged = mergeSettings(null);
        // A fresh install must not hand back the module-level default arrays;
        // pushing into them via the settings UI would poison DEFAULT_SETTINGS.
        expect(merged.IgnoredProperties.properties).not.toBe(DEFAULT_SETTINGS.IgnoredProperties.properties);
        expect(merged.AutoProperties.properties).not.toBe(DEFAULT_SETTINGS.AutoProperties.properties);
        expect(merged.KanbanHelper.boards).not.toBe(DEFAULT_SETTINGS.KanbanHelper.boards);

        merged.IgnoredProperties.properties.push("status");
        expect(DEFAULT_SETTINGS.IgnoredProperties.properties).toEqual([]);
    });

    it("preserves unknown top-level keys from stored data", () => {
        const loaded = {
            IgnoredProperties: {enabled: true, properties: [], hideFileTags: false},
            SomeFutureSection: {foo: 1},
        };

        const merged = mergeSettings(loaded) as typeof loaded & Record<string, unknown>;
        expect(merged.SomeFutureSection).toEqual({foo: 1});
    });

    it("backfills a new nested field (hideFileTags) absent from stored data", () => {
        const loaded = {
            IgnoredProperties: {enabled: true, properties: ["foo"]},
        };

        const merged = mergeSettings(loaded);

        expect(merged.IgnoredProperties.hideFileTags).toBe(false);
        // Stored values still win.
        expect(merged.IgnoredProperties.enabled).toBe(true);
        expect(merged.IgnoredProperties.properties).toEqual(["foo"]);
    });

    it("backfills an entire section missing from stored data", () => {
        const loaded = {
            IgnoredProperties: {enabled: true, properties: [], hideFileTags: true},
        };

        const merged = mergeSettings(loaded);

        expect(merged.KanbanHelper).toEqual(DEFAULT_SETTINGS.KanbanHelper);
        expect(merged.AutoProperties).toEqual(DEFAULT_SETTINGS.AutoProperties);
    });

    it("lets stored scalars and arrays win wholesale", () => {
        const loaded = {
            EditMode: {mode: EditMode.AllMulti, properties: ["a", "b"]},
        };

        const merged = mergeSettings(loaded);

        expect(merged.EditMode.mode).toBe(EditMode.AllMulti);
        expect(merged.EditMode.properties).toEqual(["a", "b"]);
    });

    it("preserves an explicit hideFileTags value", () => {
        const loaded = {
            IgnoredProperties: {enabled: true, properties: [], hideFileTags: true},
        };

        expect(mergeSettings(loaded).IgnoredProperties.hideFileTags).toBe(true);
    });
});

describe("migrateIgnoredProperties", () => {
    it("enables the feature for pre-version data with a non-empty ignored list", () => {
        const loaded = {IgnoredProperties: {enabled: false, properties: ["foo"]}};
        const settings = mergeSettings(loaded);

        const needsSave = migrateIgnoredProperties(loaded, settings);

        expect(needsSave).toBe(true);
        expect(settings.IgnoredProperties.enabled).toBe(true);
    });

    it("normalizes (saves once) pre-version data with an empty list without flipping enabled", () => {
        const loaded = {IgnoredProperties: {enabled: false, properties: []}};
        const settings = mergeSettings(loaded);

        // Returns true so the normalized shape (now with hideFileTags) is persisted
        // once, but the disabled state is preserved.
        const needsSave = migrateIgnoredProperties(loaded, settings);

        expect(needsSave).toBe(true);
        expect(settings.IgnoredProperties.enabled).toBe(false);
        expect(settings.IgnoredProperties.hideFileTags).toBe(false);
    });

    it("does not flip pre-version data that is already enabled (but still normalizes)", () => {
        const loaded = {IgnoredProperties: {enabled: true, properties: ["foo"]}};
        const settings = mergeSettings(loaded);

        expect(migrateIgnoredProperties(loaded, settings)).toBe(true);
        expect(settings.IgnoredProperties.enabled).toBe(true);
    });

    it("never fires again once data has the hideFileTags field (post-version)", () => {
        // The user migrated, then deliberately disabled the feature while keeping
        // their list. hideFileTags is present, so the migration must NOT re-trigger.
        const loaded = {IgnoredProperties: {enabled: false, properties: ["foo"], hideFileTags: false}};
        const settings = mergeSettings(loaded);

        const needsSave = migrateIgnoredProperties(loaded, settings);

        expect(needsSave).toBe(false);
        expect(settings.IgnoredProperties.enabled).toBe(false);
    });

    it("does nothing for a fresh install (null)", () => {
        const settings = mergeSettings(null);
        expect(migrateIgnoredProperties(null, settings)).toBe(false);
    });
});
