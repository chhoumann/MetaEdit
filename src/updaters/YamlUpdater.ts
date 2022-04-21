import { stringifyYaml } from 'obsidian';
import type { Property } from '../Types/Property';
import propertiesToObject from './propertiesToObject';
import { Updater } from './Updater';

export default class YamlUpdater extends Updater {
    // @ts-ignore
    add(propertyName: string, value: unknown): string {
        return '';
    }

    // @ts-ignore
    remove(propertyName: string): string {
        return '';
    }

    // @ts-ignore
    update(propertyName: string, newValue: unknown): string {
        return '';
    }

    // @ts-ignore
    private getStringifiedYaml(properties: Property[]): string {
        const yamlObj = propertiesToObject(properties);
        return stringifyYaml(yamlObj);
    }
}
