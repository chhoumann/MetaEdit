import {extractFrontmatterString} from "../../src/parser/extractFrontmatterString";

describe("extractFrontmatterString", () => {
  it("should extract frontmatter string", () => {
    const frontmatterString = `---\ntitle: "Hello World"\n---\n`;
    const result = extractFrontmatterString(frontmatterString);
    expect(result).toEqual(`title: "Hello World"`);
  });

    it('should return empty string on empty frontmatter body', function () {
        const frontmatterString = `---\n---\n`;
        const result = extractFrontmatterString(frontmatterString);
        expect(result).toEqual('');
    });

    it('should return empty string on no frontmatter', function () {
        const frontmatterString = `Hello World`;
        const result = extractFrontmatterString(frontmatterString);
        expect(result).toEqual('');
    });
});