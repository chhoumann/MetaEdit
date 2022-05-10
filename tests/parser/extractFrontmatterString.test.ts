import {extractFrontmatterString} from "../../src/parser/extractFrontmatterString";

describe("extractFrontmatterString", () => {
  it("should extract frontmatter string", () => {
    const body = `---\ntitle: "Hello World"\n---\n`;
    const frontmatterString = extractFrontmatterString(body);
    expect(frontmatterString).toEqual(`title: "Hello World"`);
  });

    it('should return empty string on empty frontmatter body', function () {
        const body = `---\n---\n`;
        const frontmatterString = extractFrontmatterString(body);
        expect(frontmatterString).toEqual('');
    });

    it('should return empty string on no frontmatter', function () {
        const body = `Hello World`;
        const frontmatterString = extractFrontmatterString(body);
        expect(frontmatterString).toEqual('');
    });
});