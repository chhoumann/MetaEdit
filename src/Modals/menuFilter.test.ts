import {describe, expect, it} from "vitest";
import {canStructureEditProperty, filterMenuItems} from "./menuFilter";
import {MetaType} from "../Types/metaType";
import type {Property} from "../parser";

const tag = (key: string): Property => ({key, content: key, type: MetaType.Tag});
const yaml = (key: string): Property => ({key, content: "v", type: MetaType.YAML});
const dataview = (key: string): Property => ({key, content: "v", type: MetaType.Dataview});

const keysOf = (props: Property[]) => props.map(p => p.key);

describe("filterMenuItems", () => {
    const sample: Property[] = [
        tag("#project"),
        tag("#area/work"),
        yaml("status"),
        yaml("tags"),
        dataview("rating"),
    ];

    it("returns everything untouched when the feature is disabled", () => {
        const result = filterMenuItems(sample, {
            enabled: false,
            ignoredProperties: ["status"],
            hideFileTags: true,
        });

        // Even with an ignored key and hideFileTags set, nothing is filtered:
        // the toggle does exactly what its label promises (regression for the
        // latent bug where ignored keys were filtered while disabled).
        expect(keysOf(result)).toEqual(keysOf(sample));
    });

    it("returns a copy, not the original array", () => {
        const result = filterMenuItems(sample, {enabled: false, ignoredProperties: [], hideFileTags: false});
        expect(result).not.toBe(sample);
        expect(result).toEqual(sample);
    });

    it("drops exact-match ignored keys when enabled", () => {
        const result = filterMenuItems(sample, {
            enabled: true,
            ignoredProperties: ["status", "rating"],
            hideFileTags: false,
        });

        expect(keysOf(result)).toEqual(["#project", "#area/work", "tags"]);
    });

    it("hides only file tags (MetaType.Tag) when hideFileTags is on", () => {
        const result = filterMenuItems(sample, {
            enabled: true,
            ignoredProperties: [],
            hideFileTags: true,
        });

        // Body #tags are gone; the frontmatter `tags` YAML key survives - this is
        // the #46/#90 contract: edit frontmatter, not the file's tags.
        expect(keysOf(result)).toEqual(["status", "tags", "rating"]);
        expect(result.some(p => p.type === MetaType.Tag)).toBe(false);
        expect(result.find(p => p.key === "tags")?.type).toBe(MetaType.YAML);
    });

    it("keeps file tags when hideFileTags is off", () => {
        const result = filterMenuItems(sample, {
            enabled: true,
            ignoredProperties: [],
            hideFileTags: false,
        });

        expect(result.filter(p => p.type === MetaType.Tag)).toHaveLength(2);
    });

    it("applies ignored keys and hideFileTags together", () => {
        const result = filterMenuItems(sample, {
            enabled: true,
            ignoredProperties: ["status"],
            hideFileTags: true,
        });

        expect(keysOf(result)).toEqual(["tags", "rating"]);
    });

    it("can still hide a specific tag by its key", () => {
        const result = filterMenuItems(sample, {
            enabled: true,
            ignoredProperties: ["#project"],
            hideFileTags: false,
        });

        expect(keysOf(result)).toEqual(["#area/work", "status", "tags", "rating"]);
    });

    it("handles an empty input", () => {
        expect(filterMenuItems([], {enabled: true, ignoredProperties: [], hideFileTags: true})).toEqual([]);
    });

    it("returns an empty list when every entry is a hidden file tag", () => {
        const tagsOnly = [tag("#a"), tag("#b")];
        const result = filterMenuItems(tagsOnly, {enabled: true, ignoredProperties: [], hideFileTags: true});
        // The suggester always prepends its action options, so a fully-filtered
        // data list still yields a non-empty menu.
        expect(result).toEqual([]);
    });
});

describe("canStructureEditProperty", () => {
    it("never offers structure edits (delete/transform) on a body tag (BUG-5)", () => {
        expect(canStructureEditProperty(tag("#project"))).toBe(false);
        expect(canStructureEditProperty(tag("#area/work"))).toBe(false);
    });

    it("offers structure edits on plain YAML and Dataview properties", () => {
        expect(canStructureEditProperty(yaml("status"))).toBe(true);
        expect(canStructureEditProperty(dataview("rating"))).toBe(true);
    });

    it("withholds structure edits on nested/virtual YAML rows", () => {
        expect(canStructureEditProperty({key: "a.b", content: "v", type: MetaType.YAML, isNested: true})).toBe(false);
        expect(canStructureEditProperty({key: "a.b", content: "v", type: MetaType.YAML, isVirtual: true})).toBe(false);
    });
});
