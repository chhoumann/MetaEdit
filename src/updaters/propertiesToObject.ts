import type { Property } from '../Types/Property';

export default function propertiesToObject(properties: Property[]): {
    [key: string]: unknown;
} {
    return properties.reduce((obj: { [key: string]: unknown }, prop) => {
        obj[prop.key] = prop.content;
        return obj;
    }, {});
}
