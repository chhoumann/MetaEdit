import type IUpdater from "./IUpdater";
import type {TFile, App} from "obsidian";

export abstract class Updater implements IUpdater {
    protected app: App;
    protected file: TFile;

    constructor(app: App, file: TFile) {
        this.app = app;
        this.file = file;
    }

    abstract add(propertyName: string, value: unknown): string;

    abstract remove(propertyName: string): string;

    abstract update(propertyName: string, newValue: unknown): string;
}