import {Updater} from "./Updater";

export default class DataviewUpdater extends Updater {
    add(propertyName: string, value: unknown): string {
        return "";
    }

    remove(propertyName: string): string {
        return "";
    }

    update(propertyName: string, newValue: unknown): string {
        return "";
    }
}