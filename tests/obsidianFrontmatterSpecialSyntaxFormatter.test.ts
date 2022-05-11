import obsidianFrontmatterSpecialSyntaxFormatter from "../src/updaters/functions/obsidianFrontmatterSpecialSyntaxFormatter";
import {ObsidianFrontmatterSyntaxMode} from "../src/types/obsidianFrontmatterSyntaxMode";

describe('Obsidian Frontmatter Syntax Formatter', function () {
    it('should return a single value when in comma separated mode and a single value is given', function () {
        const value = 'this is just a single value';
        const resultAlias = obsidianFrontmatterSpecialSyntaxFormatter("alias", value, ObsidianFrontmatterSyntaxMode.CommaSeparated);
        expect(resultAlias).toBe(value);
    });

    it('should allow whitespace separation for tags and cssclasses', function () {
        const tags = ['tag1', 'tag2', 'tag3'];
        const cssClasses = ['css1', 'css2', 'css3'];
        const resultTags = obsidianFrontmatterSpecialSyntaxFormatter("tags", tags, ObsidianFrontmatterSyntaxMode.WhitespaceSeparated);
        const resultCssClasses = obsidianFrontmatterSpecialSyntaxFormatter("cssClasses", cssClasses, ObsidianFrontmatterSyntaxMode.WhitespaceSeparated);
        expect(resultTags).toBe('tag1 tag2 tag3');
        expect(resultCssClasses).toBe('css1 css2 css3');
    });

    it('should disallow whitespace separation for aliases', function () {
        const aliases = ['alias1', 'alias2', 'alias3'];
        const fn = () => obsidianFrontmatterSpecialSyntaxFormatter("aliases", aliases, ObsidianFrontmatterSyntaxMode.WhitespaceSeparated);
        expect(fn).toThrow();
    });

    it('should return an array of items when in square bracket mode', function () {
        const values = ['value1', 'value2', 'value3'];
        const expected = `[value1, value2, value3]`;
        const result = obsidianFrontmatterSpecialSyntaxFormatter("alias", values, ObsidianFrontmatterSyntaxMode.SquareBracket);
        expect(result).toBe(expected);
    });
});