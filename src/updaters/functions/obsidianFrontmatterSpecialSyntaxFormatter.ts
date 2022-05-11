import {ObsidianFrontmatterSyntaxMode} from "../../types/obsidianFrontmatterSyntaxMode";
const ALIAS_SYNTAX = ["alias", "aliases"];
const CSS_CLASS_SYNTAX = ["cssclass", "cssclasses"];
const TAG_SYNTAX = ["tag", "tags"];

/**
 * This function is used to handle the special syntax for the Obsidian frontmatter.
 * Aliases, CSS classes and tags are supported.
 * @param key The key of the property.
 * @param value The value of the property.
 * @param mode The syntax mode.
 * @returns The new value for the property with the special syntax handled.
 */
export default function obsidianFrontmatterSpecialSyntaxFormatter(key: string, value: unknown, mode: ObsidianFrontmatterSyntaxMode): unknown {
    const isAlias = ALIAS_SYNTAX.includes(key.toLowerCase());
    const isCssClass = CSS_CLASS_SYNTAX.includes(key.toLowerCase());
    const isTag = TAG_SYNTAX.includes(key.toLowerCase());

    if (!isAlias && !isCssClass && !isTag) {
        return value;
    }

    if (isAlias && mode === ObsidianFrontmatterSyntaxMode.WhitespaceSeparated) {
        // This is an alias. It does not support whitespace notation for arrays, as it would just be a single alias.
        throw new Error(`Aliases do not support whitespace separation.`);
    }

    switch (mode) {
        case ObsidianFrontmatterSyntaxMode.SquareBracket:
            return convertToSquareBracketNotation(value);
        case ObsidianFrontmatterSyntaxMode.List:
            return value;
        case ObsidianFrontmatterSyntaxMode.WhitespaceSeparated:
            return convertToWhitespaceSeparatedNotation(value);
        case ObsidianFrontmatterSyntaxMode.CommaSeparated:
            return convertToCommaSeparatedNotation(value);
        default:
            throw new Error(`Unknown syntax mode: '${mode}' for updating special Obsidian frontmatter.`);
    }
}

function convertToSquareBracketNotation(value: unknown): string {
    if (typeof value === "string" || typeof value === "number") {
        return `[${value}]`;
    }

    if (Array.isArray(value)) {
        return `[${value.join(", ")}]`;
    }

    throw new Error(`Unknown value type: '${typeof value}' for updating special Obsidian frontmatter.`);
}

// UNUSED: this case is automatically handled by the YAML stringifier.
// function convertToListNotation(value: unknown): string {
//     if (typeof value === "string" || typeof value === "number") {
//         return `- ${value}`;
//     }
//
//     if (Array.isArray(value)) {
//         return `- ${value.join("\n- ")}`;
//     }
//
//     throw new Error(`Unknown value type: '${typeof value}' for updating special Obsidian frontmatter.`);
// }

function convertToWhitespaceSeparatedNotation(value: unknown): string {
    if (typeof value === "string" || typeof value === "number") {
        return value.toString();
    }

    if (Array.isArray(value)) {
        return value.join(" ");
    }

    throw new Error(`Unknown value type: '${typeof value}' for updating special Obsidian frontmatter.`);
}

function convertToCommaSeparatedNotation(value: unknown): string {
    if (typeof value === "string" || typeof value === "number") {
        return value.toString();
    }

    if (Array.isArray(value)) {
        return value.join(", ");
    }

    throw new Error(`Unknown value type: '${typeof value}' for updating special Obsidian frontmatter.`);
}
