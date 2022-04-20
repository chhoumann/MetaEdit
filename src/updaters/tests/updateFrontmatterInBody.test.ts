import { stringifyYaml } from 'obsidian';
import updateFrontmatterInBody from '../updateFrontmatterInBody';

describe('update frontmatter in body string', () => { 
    it('adds frontmatter to empty body', () => {
        const body = '';
        const newFrontmatter = stringifyYaml({
            title: 'test',
            description: 'test',
        });

        const result = updateFrontmatterInBody(body, newFrontmatter);
        expect(result).toBe(`---\n${newFrontmatter}---\n`);
    });
 })