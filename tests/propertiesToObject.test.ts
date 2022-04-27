import type { Property } from '../src/types/Property';
import propertiesToObject from '../src/updaters/functions/propertiesToObject';
import { MetaType } from '../src/types/metaType';

describe('Properties to object', () => {
    it('should convert properties to object', () => {
        const properties: Property[] = [
            { key: 'obj', content: { key: 'value' }, type: MetaType.YAML },
            { key: 'arr', content: [1, 2, 3], type: MetaType.YAML },
            { key: 'str', content: 'string', type: MetaType.YAML },
            { key: 'num', content: 1, type: MetaType.YAML },
            { key: 'bool', content: true, type: MetaType.YAML },
            { key: 'null', content: null, type: MetaType.YAML },
            { key: 'undefined', content: undefined, type: MetaType.YAML },
            {
                key: 'nobj',
                content: { key: { key2: 'value' } },
                type: MetaType.YAML,
            },
        ];

        const obj = propertiesToObject(properties);

        expect(obj).toEqual({
            obj: { key: 'value' },
            arr: [1, 2, 3],
            str: 'string',
            num: 1,
            bool: true,
            null: null,
            undefined: undefined,
            nobj: { key: { key2: 'value' } },
        });
    });
});
