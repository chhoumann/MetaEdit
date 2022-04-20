const FRONTMATTER_REGEXP = new RegExp(/^-{3}\s*\n*\r*-{3}/);

export default function updateFrontmatterInBody(body: string, newFrontmatter: string): string {
    const isFrontmatterEmpty = FRONTMATTER_REGEXP.test(body);

    let linesInBody = body.split("\n");
    if (isFrontmatterEmpty) {
        linesInBody.unshift("---");
        linesInBody.unshift(newFrontmatter);
        linesInBody.unshift("---");
    }
    else {
        linesInBody.splice(1, 0, newFrontmatter);
    }

    return linesInBody.join("\n");
}
