import {ListType} from "../../types/listType";
import {
    convertToCommaSeparatedNotation,
    convertToSquareBracketNotation,
    convertToWhitespaceSeparatedNotation
} from "./convertToNotationFns";
const ALIAS_SYNTAX = ["alias", "aliases"];
const CSS_CLASS_SYNTAX = ["cssclass", "cssclasses"];
const TAG_SYNTAX = ["tag", "tags"];

type valueType = string | number | unknown[];

/**
 * This function is used to handle the special syntax for the Obsidian frontmatter.
 * Aliases, CSS classes and tags are supported.
 * @param key The key of the property.
 * @param value The value of the property.
 * @param mode The syntax mode.
 * @returns The new value for the property with the special syntax handled.
 */
export default function obsidianFrontmatterSpecialSyntaxFormatter(key: string, value: valueType, mode: ListType): unknown {
    const isAlias = ALIAS_SYNTAX.includes(key.toLowerCase());
    const isCssClass = CSS_CLASS_SYNTAX.includes(key.toLowerCase());
    const isTag = TAG_SYNTAX.includes(key.toLowerCase());

    if (!isAlias && !isCssClass && !isTag) {
        return value;
    }

    if (isAlias && mode === ListType.WhitespaceSeparated) {
        // This is an alias. It does not support whitespace notation for arrays, as it would just be a single alias.
        throw new Error(`Aliases do not support whitespace separation.`);
    }

    switch (mode) {
        case ListType.SquareBracket:
            return convertToSquareBracketNotation(value);
        case ListType.List:
            return value;
        case ListType.WhitespaceSeparated:
            return convertToWhitespaceSeparatedNotation(value);
        case ListType.CommaSeparated:
            return convertToCommaSeparatedNotation(value);
        default:
            throw new Error(`Unknown syntax mode: '${mode}' for updating special Obsidian frontmatter.`);
    }
}