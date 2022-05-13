import {stringifyYaml, TFile} from 'obsidian';
import type {Property} from '../types/Property';
import propertiesToObject from './functions/propertiesToObject';
import {Updater} from './Updater';
import {MetaType} from "../types/metaType";

export default class YamlUpdater extends Updater {
    private readonly properties: Property[];

    constructor(properties: Property[], file: TFile) {
        super(file);
        this.properties = properties;
    }

    add(propertyName: string, value: unknown): string {
        const newProperties = [...this.properties, {key: propertyName, content: value, type: MetaType.YAML}];

        return this.getStringifiedYaml(newProperties);
    }

    remove(propertyName: string): string {
        const newProperties = this.properties.filter(property => property.key !== propertyName);

        return this.getStringifiedYaml(newProperties);
    }

    update(propertyName: string, newValue: unknown): string {
        const propertyIndex = this.properties.findIndex(property => property.key === propertyName);
        const newProperties = [...this.properties];
        newProperties[propertyIndex].content = newValue;

        return this.getStringifiedYaml(newProperties);
    }

    private getStringifiedYaml(properties: Property[]): string {
        const yamlObj = propertiesToObject(properties);
        return stringifyYaml(yamlObj).trim();
    }
}
