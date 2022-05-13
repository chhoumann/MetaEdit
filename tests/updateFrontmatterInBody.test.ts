import updateFrontmatterInBody from '../src/updaters/functions/updateFrontmatterInBody';

describe('update frontmatter in body string', () => {
    it('adds frontmatter to empty body', () => {
        const body = '';
        const newFrontmatter = 'title: test\ndescription: test';

        const result = updateFrontmatterInBody(body, newFrontmatter);
        expect(result).toBe(`---\n${newFrontmatter}---`);
    });

    it('adds frontmatter to body with frontmatter', () => {
        const body = `---\ntitle: test\ndescription: test\n---\n`;
        const newFrontmatter = 'title: bee\ndescription: battle';

        const result = updateFrontmatterInBody(body, newFrontmatter);
        expect(result).toBe(`---\n${newFrontmatter}\n---\n`);
    });
});
