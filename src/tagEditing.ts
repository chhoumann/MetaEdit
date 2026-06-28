/**
 * Pure, Obsidian-free helpers for editing tags. Kept separate from
 * `metaController` so the token-rewrite and span-splice logic - where a wrong
 * offset means data loss - can be unit-tested in the jsdom-free `node` env.
 *
 * Two distinct tag homes exist (see TAG_EDITING_DESIGN.md):
 *  - Body `#tags`, parsed from `cache.tags` with a document-offset position.
 *  - Frontmatter `tags:` / `tag:`, stored as a YAML list, scalar, or CSV string.
 * These helpers serve both.
 */

/** A body tag's exact span in the note, as document offsets (`[start, end)`). */
export interface TagPosition {
    start: number;
    end: number;
    // 0-based source line of the occurrence, used only to disambiguate duplicate
    // tags in the picker.
    line?: number;
}

/**
 * How a body tag edit reshapes the tag:
 *  - `rename`  : replace the whole tag with what the user typed (the primary,
 *                least-surprising action; a flat tag is renamed, not nested).
 *  - `leaf`    : replace only the last `/`-segment of a nested tag.
 *  - `tracker` : write Obsidian Tracker's `#tag:value` data syntax (body only).
 */
export type TagEditMode = "rename" | "leaf" | "tracker";

/** Drop any leading `#` (Obsidian tolerates one; frontmatter omits it). */
export function stripHash(tag: string): string {
    return tag.replace(/^#+/, "");
}

/** A tag is nested when it has a `/` separator after the leading `#`. */
export function isNestedTag(tag: string): boolean {
    return stripHash(tag).includes("/");
}

/** Last `/`-segment of a tag (the "leaf"), without the `#`. */
export function tagLeaf(tag: string): string {
    const body = stripHash(tag);
    return body.split("/").pop() ?? "";
}

/** Everything before the leaf, with the leading `#` kept: `#a/b/c` -> `#a/b`. */
export function tagParent(tag: string): string {
    const segments = stripHash(tag).split("/");
    segments.pop();
    return `#${segments.join("/")}`;
}

/**
 * Compute the full replacement token for a body-tag edit. The result is the
 * literal text that will occupy the tag's span - the writer never re-derives it,
 * so the rename-vs-leaf-vs-tracker decision lives here, once.
 *
 * Returns an empty string when there is nothing meaningful to write (so callers
 * can treat it as a cancel), e.g. a rename to blank.
 */
export function computeTagRewrite(oldTag: string, input: string, mode: TagEditMode): string {
    const value = input.trim();

    if (mode === "tracker") {
        // Tracker reads `#tag:value`; an empty value is not a useful series point.
        return value === "" ? "" : `${oldTag}:${value}`;
    }

    const normalized = stripHash(value);
    if (normalized === "") return "";

    if (mode === "leaf") {
        return `${tagParent(oldTag)}/${normalized}`;
    }

    // rename: the typed value becomes the whole tag (nested input is honoured).
    return `#${normalized}`;
}

// A Tracker value is a simple, space-free token (typically numeric). Bounded so
// a suffix splice never reaches into adjacent punctuation/markup (`,` `)` `#`).
const TRACKER_VALUE = "[A-Za-z0-9._+-]+";

/** A Tracker token is `#tag:value` - a tag, then a bounded `:value` suffix. */
export function isTrackerToken(token: string): boolean {
    return new RegExp(`^#[^\\s:]+:${TRACKER_VALUE}$`).test(token);
}

/**
 * Coerce arbitrary input into a tag token: trim, collapse leading hashes to one
 * `#`. The result still has to pass {@link isValidTagToken}; this only guarantees
 * a single leading `#` so a bare value from the API (`"done"`) becomes `#done`.
 */
export function normalizeTagToken(value: string): string {
    const trimmed = value.trim();
    if (trimmed === "") return "";
    return `#${trimmed.replace(/^#+/, "")}`;
}

/**
 * Whether `token` is a single, writable tag that Obsidian indexes as ONE tag:
 * one leading `#`, then only tag characters (Unicode letters, digits, `_`, `-`,
 * `/`), with at least one non-digit so a purely numeric `#2024` (which Obsidian
 * renders as text) is rejected. Punctuation like `.`/`!`/space/comma ends a tag
 * in Obsidian, so it is rejected here rather than spliced in as a broken tag. An
 * optional Tracker `:value` suffix is allowed.
 */
export function isValidTagToken(token: string): boolean {
    if (!token.startsWith("#")) return false;

    // Peel off an optional Tracker `:value` suffix; validate the tag part only.
    const tracker = token.match(new RegExp(`^(#.+?):${TRACKER_VALUE}$`, "u"));
    const body = (tracker ? tracker[1] : token).slice(1);

    if (!/^[\p{L}\p{N}_/-]+$/u.test(body)) return false;
    return /[^\d/]/u.test(body);
}

/**
 * Replace the tag occupying `position` with `newToken`, but only when the span
 * still holds the expected tag text. Returns the rewritten content, or `null`
 * when the span no longer matches (the note changed since it was parsed) so the
 * caller refuses to write rather than corrupt unrelated prose.
 *
 * This is the body-tag counterpart to the inline-field splice in
 * `parser.replaceInlineFieldValue`: it rewrites one exact occurrence and leaves
 * everything else - other tags, surrounding text - byte-for-byte intact. When
 * writing a Tracker token over a tag that already carries a `:value` suffix, the
 * old suffix is replaced too, so re-editing a value never stacks
 * (`#weight:80` -> `#weight:85`, not `#weight:85:80`).
 */
export function spliceTag(
    content: string,
    position: TagPosition | undefined,
    expectedTag: string,
    newToken: string,
): string | null {
    if (!position) return null;

    const {start, end} = position;
    if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
    if (start < 0 || end > content.length || start >= end) return null;
    if (content.slice(start, end) !== expectedTag) return null;

    let cutEnd = end;
    if (isTrackerToken(newToken)) {
        // Only consume a bounded Tracker value, never adjacent punctuation/markup:
        // `#weight:80,#other` keeps `,#other`; `(#weight:80)` keeps `)`.
        const existingSuffix = content.slice(end).match(new RegExp(`^:${TRACKER_VALUE}`));
        if (existingSuffix) cutEnd = end + existingSuffix[0].length;
    }

    return content.slice(0, start) + newToken + content.slice(cutEnd);
}

const TAG_FRONTMATTER_KEYS: ReadonlySet<string> = new Set(["tags", "tag"]);

/** Whether a frontmatter key holds tags (Obsidian treats `tags`/`tag` specially). */
export function isTagsKey(key: string | undefined): boolean {
    return !!key && TAG_FRONTMATTER_KEYS.has(key.toLowerCase());
}

/** Canonical frontmatter form of a single tag: trimmed, no leading `#`. */
export function canonicalizeFrontmatterTag(value: string): string {
    return stripHash(value.trim()).trim();
}

/**
 * Split a frontmatter `tags` value into individual tags. Obsidian accepts a YAML
 * list, a single scalar, or a comma/whitespace-separated string - all collapse
 * to the same set of canonical (no-`#`, trimmed, non-empty) tags. Every element
 * (list item or scalar) is itself split on whitespace/comma, so a stray
 * `"alpha beta"` becomes two tags rather than one invalid one. Non-primitive
 * items (objects, nested arrays) are skipped, so a garbage value like `{x:1}`
 * never stringifies into `"[object Object]"`.
 */
export function splitFrontmatterTags(content: unknown): string[] {
    const items = Array.isArray(content) ? content : [content];

    const out: string[] = [];
    for (const item of items) {
        if (item === null || item === undefined || typeof item === "object") continue;
        for (const token of String(item).split(/[\s,]+/)) {
            const tag = canonicalizeFrontmatterTag(token);
            if (tag) out.push(tag);
        }
    }
    return out;
}
