import type MetaEdit from "./main";
import type {
    IMetaEditApi,
    MetaEditMetadataChangeCallback,
    MetaEditPropertyValue,
    MetaEditUnsubscribe,
} from "./IMetaEditApi";
import MetaEditParser, {type Property} from "./parser";
import {TFile} from "obsidian";
import type {CachedMetadata} from "obsidian";
import {MetaType} from "./Types/metaType";
import type {AutoProperty} from "./Types/autoProperty";

export class MetaEditApi {
    private settingsWriteQueue: Promise<unknown> = Promise.resolve();
    private parser: MetaEditParser;

    constructor(private plugin: MetaEdit) {
        this.parser = new MetaEditParser(plugin.app);
    }

    public make(): IMetaEditApi {
        return {
            autoprop: this.getAutopropFunction(),
            update: this.getUpdateFunction(),
            getPropertyValue: this.getGetPropertyValueFunction(),
            getFilesWithProperty: this.getGetFilesWithPropertyFunction(),
            createYamlProperty: this.getCreateYamlPropertyFunction(),
            addOrUpdateProperty: this.getAddOrUpdatePropertyFunction(),
            getPropertiesInFile: this.getGetPropertiesInFile(),
            getAutoProperties: this.getGetAutoPropertiesFunction(),
            setAutoProperties: this.getSetAutoPropertiesFunction(),
            onMetadataChange: this.getOnMetadataChangeFunction(),
        };
    }

    private getAutopropFunction() {
        return (propertyName: string) => this.plugin.controller.handleAutoProperties(propertyName);
     }

    private getUpdateFunction(): (propertyName: string, propertyValue: MetaEditPropertyValue, file: (TFile | string)) => Promise<undefined | void> {
        return async (propertyName: string, propertyValue: MetaEditPropertyValue, file: TFile | string) => {
            const targetFile = this.getFileFromTFileOrPath(file);
            if (!targetFile) return;

            const targetProperty = await this.getPropertyInFile(propertyName, targetFile);
            if (!targetProperty) return;

            return this.plugin.controller.updatePropertyInFile(targetProperty, propertyValue, targetFile);
        }
    }

    private getFileFromTFileOrPath(file: TFile | string) {
        let targetFile: TFile;

        if (file instanceof TFile)
            targetFile = file;

        if (typeof file === "string") {
            const abstractFile = this.plugin.app.vault.getAbstractFileByPath(file);
            if (abstractFile instanceof TFile) {
                targetFile = abstractFile;
            }
        }

        return targetFile;
    }

    private getGetPropertyValueFunction(): (propertyName: string, file: (TFile | string)) => Promise<any> {
        return async (propertyName: string, file: TFile | string) => {
            const targetFile = this.getFileFromTFileOrPath(file);
            if (!targetFile) return;

            const targetProperty = await this.getPropertyInFile(propertyName, targetFile);
            if (!targetProperty) return;

            return targetProperty.content;
        }
    }

    private getGetFilesWithPropertyFunction() {
        return (propertyName: string): TFile[] => {
            return this.plugin.getFilesWithProperty(propertyName);
        }
    }

    private getCreateYamlPropertyFunction() {
        return async (propertyName: string, propertyValue: MetaEditPropertyValue, file: TFile | string) => {
            const targetFile = this.getFileFromTFileOrPath(file);
            if (!targetFile) return;

            await this.plugin.controller.addYamlProp(propertyName, propertyValue, targetFile);
        }
    }

    private getAddOrUpdatePropertyFunction() {
        return async (propertyName: string, propertyValue: MetaEditPropertyValue, file: TFile | string) => {
            const targetFile = this.getFileFromTFileOrPath(file);
            if (!targetFile) return;

            const targetProperty = await this.getPropertyInFile(propertyName, targetFile);
            if (targetProperty) {
                await this.plugin.controller.updatePropertyInFile(targetProperty, propertyValue, targetFile);
                return;
            }

            await this.plugin.controller.updatePropertyInFile({
                key: propertyName,
                type: MetaType.YAML,
            }, propertyValue, targetFile);
        }
    }

    private getGetPropertiesInFile() {
        return async (file: TFile | string): Promise<Property[]>  => {
            const targetFile = this.getFileFromTFileOrPath(file);
            if (!targetFile) return;

            return await this.plugin.controller.getPropertiesInFile(targetFile);
        }
    }

    private getGetAutoPropertiesFunction() {
        return (): AutoProperty[] => {
            return this.cloneAutoProperties(this.plugin.settings.AutoProperties.properties);
        }
    }

    private getSetAutoPropertiesFunction() {
        return async (autoProperties: AutoProperty[]): Promise<void> => {
            await this.enqueueSettingsWrite(async () => {
                const nextAutoProperties = this.validateAutoProperties(autoProperties);
                const previousAutoProperties = this.cloneAutoProperties(this.plugin.settings.AutoProperties.properties);

                this.plugin.settings.AutoProperties.properties = nextAutoProperties;

                try {
                    await this.plugin.saveSettings();
                }
                catch (error) {
                    this.plugin.settings.AutoProperties.properties = previousAutoProperties;
                    throw error;
                }
            });
        }
    }

    private getOnMetadataChangeFunction() {
        return (callback: MetaEditMetadataChangeCallback): MetaEditUnsubscribe => {
            let unsubscribed = false;
            const previousPropertiesByPath = new Map<string, Property[]>();
            const eventQueues = new Map<string, Promise<void>>();
            const handleChange = async (file: TFile, data: string, cache: CachedMetadata) => {
                if (unsubscribed) return;

                const previousProperties = previousPropertiesByPath.get(file.path) ?? null;
                const properties = this.cloneProperties(this.getPropertiesFromEvent(data, cache));
                if (unsubscribed) return;

                if (previousProperties && this.propertiesSignature(previousProperties) === this.propertiesSignature(properties)) {
                    return;
                }

                previousPropertiesByPath.set(file.path, this.cloneProperties(properties));

                try {
                    await callback({
                        file,
                        data,
                        cache,
                        properties: this.cloneProperties(properties),
                        previousProperties: previousProperties ? this.cloneProperties(previousProperties) : null,
                    });
                }
                catch (error) {
                    console.error("MetaEdit metadata change callback failed.", error);
                }
            };
            const eventRef = this.plugin.app.metadataCache.on("changed", (file, data, cache) => {
                const previousTask = eventQueues.get(file.path) ?? Promise.resolve();
                const queuedTask = previousTask.catch(() => undefined).then(() => handleChange(file, data, cache));

                eventQueues.set(file.path, queuedTask);
                void queuedTask.finally(() => {
                    if (eventQueues.get(file.path) === queuedTask) {
                        eventQueues.delete(file.path);
                    }
                });
            });
            const deletedEventRef = this.plugin.app.metadataCache.on("deleted", (file) => {
                previousPropertiesByPath.delete(file.path);
                eventQueues.delete(file.path);
            });
            const renameEventRef = this.plugin.app.vault.on("rename", (file, oldPath) => {
                if (!(file instanceof TFile)) return;

                const previousProperties = previousPropertiesByPath.get(oldPath);
                previousPropertiesByPath.delete(oldPath);

                if (previousProperties) {
                    previousPropertiesByPath.set(file.path, previousProperties);
                }
            });

            const unsubscribe = () => {
                if (unsubscribed) return;

                unsubscribed = true;
                previousPropertiesByPath.clear();
                eventQueues.clear();
                this.plugin.app.metadataCache.offref(eventRef);
                this.plugin.app.metadataCache.offref(deletedEventRef);
                this.plugin.app.vault.offref(renameEventRef);
            };

            this.plugin.register(unsubscribe);
            return unsubscribe;
        }
    }

    private async getPropertyInFile(propertyName: string, file: TFile): Promise<Property | undefined> {
        const propsInFile: Property[] = await this.plugin.controller.getPropertiesInFile(file);
        return propsInFile.find(prop => prop.key === propertyName);
    }

    private cloneAutoProperties(autoProperties: AutoProperty[]): AutoProperty[] {
        return autoProperties.map(autoProperty => {
            const clone: AutoProperty = {
                name: autoProperty.name,
                choices: [...autoProperty.choices],
            };
            if (autoProperty.description !== undefined) clone.description = autoProperty.description;
            if (autoProperty.type !== undefined) clone.type = autoProperty.type;
            return clone;
        });
    }

    private validateAutoProperties(autoProperties: AutoProperty[]): AutoProperty[] {
        if (!Array.isArray(autoProperties)) {
            throw new TypeError("Auto Properties must be an array.");
        }

        return autoProperties.map((autoProperty, index) => {
            if (!autoProperty || typeof autoProperty !== "object") {
                throw new TypeError(`Auto Property at index ${index} must be an object.`);
            }

            if (!Array.isArray(autoProperty.choices) || !autoProperty.choices.every(choice => typeof choice === "string")) {
                throw new TypeError(`Auto Property at index ${index} choices must be an array of strings.`);
            }

            if (typeof autoProperty.name !== "string") {
                throw new TypeError(`Auto Property at index ${index} must have a string name.`);
            }

            if (autoProperty.description !== undefined && typeof autoProperty.description !== "string") {
                throw new TypeError(`Auto Property at index ${index} description must be a string.`);
            }

            if (autoProperty.type !== undefined && autoProperty.type !== "Single" && autoProperty.type !== "Multi") {
                throw new TypeError(`Auto Property at index ${index} type must be "Single" or "Multi".`);
            }

            const validated: AutoProperty = {
                name: autoProperty.name,
                choices: [...autoProperty.choices],
            };
            if (autoProperty.description !== undefined) validated.description = autoProperty.description;
            if (autoProperty.type !== undefined) validated.type = autoProperty.type;
            return validated;
        });
    }

    private enqueueSettingsWrite<T>(task: () => Promise<T>): Promise<T> {
        const queued = this.settingsWriteQueue.catch(() => undefined).then(task);
        this.settingsWriteQueue = queued.catch(() => undefined);
        return queued;
    }

    private cloneProperties(properties: Property[]): Property[] {
        return properties.map(property => ({
            key: property.key,
            type: property.type,
            content: this.cloneValue(property.content),
        }));
    }

    private getPropertiesFromEvent(data: string, cache: CachedMetadata): Property[] {
        return [
            ...this.getTagsFromCache(cache),
            ...this.parser.parseFrontmatterCache(cache),
            ...this.parser.parseInlineContent(data, this.parser.getFrontmatterPosition(cache)),
        ];
    }

    private getTagsFromCache(cache: CachedMetadata): Property[] {
        return (cache.tags ?? []).map(tag => ({
            key: tag.tag,
            content: tag.tag,
            type: MetaType.Tag,
        }));
    }

    private cloneValue(value: unknown): unknown {
        if (value instanceof Date) {
            return new Date(value.getTime());
        }

        if (Array.isArray(value)) {
            return value.map(item => this.cloneValue(item));
        }

        if (value && typeof value === "object") {
            return Object.entries(value as Record<string, unknown>).reduce((clone, [key, item]) => {
                clone[key] = this.cloneValue(item);
                return clone;
            }, {} as Record<string, unknown>);
        }

        return value;
    }

    private propertiesSignature(properties: Property[]): string {
        return JSON.stringify(properties.map(property => ({
            key: property.key,
            type: property.type,
            content: property.content,
        })));
    }
}
