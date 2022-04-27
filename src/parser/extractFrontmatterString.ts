export function extractFrontmatterString(body: string): string {
  const frontmatter = body.match(/^---\n([\s\S]+?)\n---\n?/);

  if (frontmatter) {
    return frontmatter[1];
  }

  return "";
}