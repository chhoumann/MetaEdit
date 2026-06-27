import {describe, expect, it} from "vitest";
import {mergeSettings, migrateIgnoredEnabled} from "./settingsMigration";
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

describe("migrateIgnoredEnabled", () => {
    it("enables the feature for pre-version data with a non-empty ignored list", () => {
        const loaded = {IgnoredProperties: {enabled: false, properties: ["foo"]}};
        const settings = mergeSettings(loaded);

        const changed = migrateIgnoredEnabled(loaded, settings);

        expect(changed).toBe(true);
        expect(settings.IgnoredProperties.enabled).toBe(true);
    });

    it("does not change pre-version data with an empty ignored list", () => {
        const loaded = {IgnoredProperties: {enabled: false, properties: []}};
        const settings = mergeSettings(loaded);

        const changed = migrateIgnoredEnabled(loaded, settings);

        expect(changed).toBe(false);
        expect(settings.IgnoredProperties.enabled).toBe(false);
    });

    it("does not change pre-version data that is already enabled", () => {
        const loaded = {IgnoredProperties: {enabled: true, properties: ["foo"]}};
        const settings = mergeSettings(loaded);

        expect(migrateIgnoredEnabled(loaded, settings)).toBe(false);
        expect(settings.IgnoredProperties.enabled).toBe(true);
    });

    it("never fires again once data has the hideFileTags field (post-version)", () => {
        // The user migrated, then deliberately disabled the feature while keeping
        // their list. hideFileTags is present, so the flip must NOT re-trigger.
        const loaded = {IgnoredProperties: {enabled: false, properties: ["foo"], hideFileTags: false}};
        const settings = mergeSettings(loaded);

        const changed = migrateIgnoredEnabled(loaded, settings);

        expect(changed).toBe(false);
        expect(settings.IgnoredProperties.enabled).toBe(false);
    });

    it("does nothing for a fresh install (null)", () => {
        const settings = mergeSettings(null);
        expect(migrateIgnoredEnabled(null, settings)).toBe(false);
    });
});
