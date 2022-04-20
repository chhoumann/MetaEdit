import type { Property } from './../../Types/Property';
import propertiesToObject from "../propertiesToObject";

describe('Properties to object', () => { 
    it('should convert properties to object', () => {
        const properties: Partial<Property>[] = [
            { key: 'obj', content: { key: 'value' } },
            { key: 'nobj', content: { key: {key2: 'value'} } },
            { key: 'arr', content: ['value', 'value2'] },
            { key: 'key', content: 'value' },
        ];

        const obj = propertiesToObject(properties);

        expect(obj).toEqual({
            obj: { key: 'value' },
            nobj: { key: {key2: 'value'} },
            arr: ['value', 'value2'],
            key: 'value',
        });
    });
 })