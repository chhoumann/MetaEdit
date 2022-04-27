import type { TFile } from 'obsidian';
import type IUpdater from './IUpdater';

export abstract class Updater implements IUpdater {
    protected file: TFile;

    constructor(file: TFile) {
        this.file = file;
    }

    abstract add(propertyName: string, value: unknown): string;

    abstract remove(propertyName: string): string;

    abstract update(propertyName: string, newValue: unknown): string;
}
