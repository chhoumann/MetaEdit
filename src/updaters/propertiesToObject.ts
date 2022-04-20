import type { Property } from './../Types/Property';

export default function propertiesToObject(properties: Partial<Property>[]): { [key: string]: unknown; } {
    return properties.reduce((obj, prop) => {
        obj[prop.key] = prop.content;
        return obj;
    }, {});
}
