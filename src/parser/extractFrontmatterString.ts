/**
 * Extracts the contents within ---frontmatter--- from a body of text and returns it.
 * @param body text contents to extract frontmatter from
 * @returns the frontmatter contents or an empty string if no frontmatter is found
 */
export function extractFrontmatterString(body: string): string {
  const frontmatter = body.match(/^---\n([\s\S]+?)\n---\n?/);

  if (frontmatter) {
    return frontmatter[1];
  }

  return "";
}