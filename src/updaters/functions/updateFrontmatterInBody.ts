import {extractFrontmatterString} from "../../parser/extractFrontmatterString";

export default function updateFrontmatterInBody(
    body: string,
    newFrontmatter: string,
): string {
    const frontmatter = extractFrontmatterString(body);

    if (!frontmatter) {
        return `---\n${newFrontmatter}---${body}`;
    }

    return body.replace(frontmatter, newFrontmatter);
}
