import { stringifyYaml } from 'obsidian';
import type { Property } from './../Types/Property';
import propertiesToObject from './propertiesToObject';
import {Updater} from "./Updater";

export default class YamlUpdater extends Updater {
    /**
     *
     */
    constructor() {
        super(app, app.workspace.getActiveFile());
        
    }

    add(propertyName: string, value: unknown): string {
        return "";
    }

    remove(propertyName: string): string {
        return "";
    }

    update(propertyName: string, newValue: unknown): string {
        return "";
    }

    private getStringifiedYaml(properties: Property[]): string {
        const yamlObj = propertiesToObject(properties);
        return stringifyYaml(yamlObj);
    }
}

