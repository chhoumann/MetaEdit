import { Updater } from './Updater';

export default class DataviewUpdater extends Updater {
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
}
