import {describe, expect, it} from "vitest";
import {
    canonicalizeFrontmatterTag,
    computeTagRewrite,
    isNestedTag,
    isTagsKey,
    isTrackerToken,
    isValidTagToken,
    normalizeTagToken,
    splitFrontmatterTags,
    spliceTag,
    stripHash,
    tagLeaf,
    tagParent,
} from "./tagEditing";

describe("tag token helpers", () => {
    it("strips one or more leading hashes", () => {
        expect(stripHash("#a")).toBe("a");
        expect(stripHash("##a")).toBe("a");
        expect(stripHash("a")).toBe("a");
        expect(stripHash("#a/b")).toBe("a/b");
    });

    it("detects nested tags", () => {
        expect(isNestedTag("#a")).toBe(false);
        expect(isNestedTag("#a/b")).toBe(true);
        expect(isNestedTag("a/b/c")).toBe(true);
    });

    it("extracts leaf and parent", () => {
        expect(tagLeaf("#a/b/c")).toBe("c");
        expect(tagLeaf("#flat")).toBe("flat");
        expect(tagParent("#a/b/c")).toBe("#a/b");
        expect(tagParent("#a/b")).toBe("#a");
    });
});

describe("computeTagRewrite", () => {
    it("rename: the typed value becomes the whole tag (flat tag is NOT nested)", () => {
        expect(computeTagRewrite("#epsilon", "renamed", "rename")).toBe("#renamed");
        // The pre-fix bug turned #epsilon into #epsilon/renamed; rename must not.
        expect(computeTagRewrite("#epsilon", "renamed", "rename")).not.toBe("#epsilon/renamed");
    });

    it("rename: strips a leading # the user may type, and honours nested input", () => {
        expect(computeTagRewrite("#old", "#new", "rename")).toBe("#new");
        expect(computeTagRewrite("#old", "area/new", "rename")).toBe("#area/new");
    });

    it("leaf: replaces only the last segment of a nested tag", () => {
        expect(computeTagRewrite("#a/b", "c", "leaf")).toBe("#a/c");
        expect(computeTagRewrite("#a/b/c", "x", "leaf")).toBe("#a/b/x");
        expect(computeTagRewrite("#a/b", "#c", "leaf")).toBe("#a/c");
    });

    it("tracker: writes #tag:value", () => {
        expect(computeTagRewrite("#epsilon", "5", "tracker")).toBe("#epsilon:5");
        expect(computeTagRewrite("#weight", "70.5", "tracker")).toBe("#weight:70.5");
    });

    it("returns empty string for a blank edit so callers can cancel", () => {
        expect(computeTagRewrite("#a", "   ", "rename")).toBe("");
        expect(computeTagRewrite("#a/b", "  ", "leaf")).toBe("");
        expect(computeTagRewrite("#a", "", "tracker")).toBe("");
    });
});

describe("spliceTag", () => {
    const content = "#epsilon at line start with trailing prose.\nMid-line tag #zeta here.\n";
    const epsilon = {start: 0, end: "#epsilon".length};

    it("rewrites only the tag span, preserving surrounding prose (BUG-2)", () => {
        expect(spliceTag(content, epsilon, "#epsilon", "#renamed"))
            .toBe("#renamed at line start with trailing prose.\nMid-line tag #zeta here.\n");
    });

    it("rewrites a mid-line occurrence in place (BUG-3)", () => {
        const start = content.indexOf("#zeta");
        const pos = {start, end: start + "#zeta".length};
        expect(spliceTag(content, pos, "#zeta", "#omega"))
            .toBe("#epsilon at line start with trailing prose.\nMid-line tag #omega here.\n");
    });

    it("targets the exact occurrence when a tag repeats", () => {
        const dup = "#dup here and #dup there";
        const second = dup.lastIndexOf("#dup");
        expect(spliceTag(dup, {start: second, end: second + 4}, "#dup", "#two"))
            .toBe("#dup here and #two there");
    });

    it("refuses to write (returns null) when the span no longer holds the tag", () => {
        expect(spliceTag(content, epsilon, "#WRONG", "#x")).toBeNull();
        expect(spliceTag(content, {start: 0, end: 5}, "#epsilon", "#x")).toBeNull();
    });

    it("refuses to write for missing or out-of-range positions", () => {
        expect(spliceTag(content, undefined, "#epsilon", "#x")).toBeNull();
        expect(spliceTag(content, {start: -1, end: 3}, "#epsilon", "#x")).toBeNull();
        expect(spliceTag(content, {start: 5, end: content.length + 10}, "#epsilon", "#x")).toBeNull();
        expect(spliceTag(content, {start: 5, end: 5}, "#epsilon", "#x")).toBeNull();
    });

    it("replaces an existing Tracker :value suffix instead of stacking it", () => {
        const tracker = "#weight:80 logged today.";
        // Obsidian's tag span covers only "#weight"; a Tracker re-edit must consume ":80".
        expect(spliceTag(tracker, {start: 0, end: 7}, "#weight", "#weight:85"))
            .toBe("#weight:85 logged today.");
    });

    it("does not consume a following :value when the new token is a plain tag", () => {
        const tracker = "#weight:80 logged.";
        // A plain rename keeps the existing Tracker value (renames the series).
        expect(spliceTag(tracker, {start: 0, end: 7}, "#weight", "#mass"))
            .toBe("#mass:80 logged.");
    });

    it("bounds the Tracker suffix so it never eats adjacent tags or markup", () => {
        // The :value must stop at punctuation, not run to the next whitespace.
        expect(spliceTag("#weight:80,#other", {start: 0, end: 7}, "#weight", "#weight:85"))
            .toBe("#weight:85,#other");
        expect(spliceTag("(#weight:80)", {start: 1, end: 8}, "#weight", "#weight:85"))
            .toBe("(#weight:85)");
    });
});

describe("tag token validation/normalization", () => {
    it("detects Tracker tokens", () => {
        expect(isTrackerToken("#weight:85")).toBe(true);
        expect(isTrackerToken("#a/b:1")).toBe(true);
        expect(isTrackerToken("#plain")).toBe(false);
        expect(isTrackerToken("#has space:1")).toBe(false);
    });

    it("normalizes a bare value to a single-# token", () => {
        expect(normalizeTagToken("done")).toBe("#done");
        expect(normalizeTagToken("#done")).toBe("#done");
        expect(normalizeTagToken("##done")).toBe("#done");
        expect(normalizeTagToken("  done  ")).toBe("#done");
        expect(normalizeTagToken("")).toBe("");
    });

    it("accepts valid tag tokens and rejects ones Obsidian would split", () => {
        expect(isValidTagToken("#done")).toBe(true);
        expect(isValidTagToken("#a/b/c")).toBe(true);
        expect(isValidTagToken("#in-progress")).toBe(true);
        expect(isValidTagToken("#year_2024")).toBe(true);
        expect(isValidTagToken("#café")).toBe(true); // unicode letters
        expect(isValidTagToken("#weight:85")).toBe(true); // Tracker
        expect(isValidTagToken("#meeting notes")).toBe(false); // space
        expect(isValidTagToken("#a,b")).toBe(false); // comma
        expect(isValidTagToken("#a#b")).toBe(false); // extra #
        expect(isValidTagToken("#")).toBe(false); // empty body
        expect(isValidTagToken("plain")).toBe(false); // no #
    });

    it("rejects tokens Obsidian does not index as a single tag", () => {
        expect(isValidTagToken("#v1.2")).toBe(false); // dot ends the tag
        expect(isValidTagToken("#done!")).toBe(false); // punctuation
        expect(isValidTagToken("#2024")).toBe(false); // purely numeric -> text
        expect(isValidTagToken("#12/34")).toBe(false); // numeric segments only
    });
});

describe("frontmatter tag helpers", () => {
    it("recognises the tags / tag keys case-insensitively", () => {
        expect(isTagsKey("tags")).toBe(true);
        expect(isTagsKey("tag")).toBe(true);
        expect(isTagsKey("Tags")).toBe(true);
        expect(isTagsKey("status")).toBe(false);
        expect(isTagsKey(undefined)).toBe(false);
    });

    it("canonicalises a single tag to no-# trimmed form", () => {
        expect(canonicalizeFrontmatterTag("  #alpha ")).toBe("alpha");
        expect(canonicalizeFrontmatterTag("nested/beta")).toBe("nested/beta");
    });

    it("splits a YAML list, scalar, or comma/space string into canonical tags", () => {
        expect(splitFrontmatterTags(["#alpha", "nested/beta"])).toEqual(["alpha", "nested/beta"]);
        expect(splitFrontmatterTags("alpha")).toEqual(["alpha"]);
        expect(splitFrontmatterTags("alpha, beta")).toEqual(["alpha", "beta"]);
        expect(splitFrontmatterTags("alpha beta")).toEqual(["alpha", "beta"]);
        expect(splitFrontmatterTags("#alpha,  #beta nested/gamma")).toEqual(["alpha", "beta", "nested/gamma"]);
    });

    it("drops blanks and null/undefined", () => {
        expect(splitFrontmatterTags("")).toEqual([]);
        expect(splitFrontmatterTags(null)).toEqual([]);
        expect(splitFrontmatterTags(undefined)).toEqual([]);
        expect(splitFrontmatterTags(["", "  ", "ok"])).toEqual(["ok"]);
    });

    it("splits each list element and skips non-primitive garbage", () => {
        // A stray multi-word list item becomes two tags, not one invalid tag.
        expect(splitFrontmatterTags(["alpha beta", "gamma"])).toEqual(["alpha", "beta", "gamma"]);
        // Objects / nested arrays are skipped instead of stringified to garbage.
        expect(splitFrontmatterTags([{x: 1}, "ok"])).toEqual(["ok"]);
        expect(splitFrontmatterTags({x: 1})).toEqual([]);
        // Numbers/booleans stringify to a single token.
        expect(splitFrontmatterTags([1, true, "ok"])).toEqual(["1", "true", "ok"]);
    });
});
