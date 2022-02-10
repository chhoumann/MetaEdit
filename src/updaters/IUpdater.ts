import type {TFile} from "obsidian";

export default interface IUpdater {
    update(propertyName: string, newValue: any): string;
    add(propertyName: string, value: any): string;
    remove(propertyName: string): string;
}