type ConvertToNotationFunction = (value: string | number | unknown[]) => string;

export const convertToSquareBracketNotation: ConvertToNotationFunction = (value) => {
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

export const convertToWhitespaceSeparatedNotation: ConvertToNotationFunction = (value) => {
    if (typeof value === "string" || typeof value === "number") {
        return value.toString();
    }

    if (Array.isArray(value)) {
        return value.join(" ");
    }

    throw new Error(`Unknown value type: '${typeof value}' for updating special Obsidian frontmatter.`);
}

export const convertToCommaSeparatedNotation: ConvertToNotationFunction = (value) => {
    if (typeof value === "string" || typeof value === "number") {
        return value.toString();
    }

    if (Array.isArray(value)) {
        return value.join(", ");
    }

    throw new Error(`Unknown value type: '${typeof value}' for updating special Obsidian frontmatter.`);
}
