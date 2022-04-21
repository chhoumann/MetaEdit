import updateFrontmatterInBody from '../updateFrontmatterInBody';

describe('update frontmatter in body string', () => { 
    it('adds frontmatter to empty body', () => {
        const body = '';
        const newFrontmatter = `title: test\ndescription: test`;

        const result = updateFrontmatterInBody(body, newFrontmatter);
        expect(result).toBe(`---\n${newFrontmatter}---\n`);
    });
 })