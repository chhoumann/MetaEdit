import type MetaEdit from "./main";
import type {
    IMetaEditApi,
    MetaEditMetadataChangeCallback,
    MetaEditPropertyValue,
    MetaEditUnsubscribe,
} from "./IMetaEditApi";
import type {Property} from "./parser";
import {TFile} from "obsidian";
import {MetaType} from "./Types/metaType";
import type {AutoProperty} from "./Types/autoProperty";

export class MetaEditApi {
    private settingsWriteQueue: Promise<unknown> = Promise.resolve();

    constructor(private plugin: MetaEdit) {
    }

    public make(): IMetaEditApi {
        return {
            autoprop: this.getAutopropFunction(),
            update: this.getUpdateFunction(),
            getPropertyValue: this.getGetPropertyValueFunction(),
            getFilesWithProperty: this.getGetFilesWithPropertyFunction(),
            createYamlProperty: this.getCreateYamlPropertyFunction(),
            addOrUpdateProperty: this.getAddOrUpdatePropertyFunction(),
            deleteProperty: this.getDeletePropertyFunction(),
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

            await this.plugin.controller.addYamlProp(propertyName, propertyValue, targetFile);
        }
    }

    private getDeletePropertyFunction() {
        return async (propertyName: string, file: TFile | string) => {
            const targetFile = this.getFileFromTFileOrPath(file);
            if (!targetFile) return;

            const targetProperty = await this.getPropertyInFile(propertyName, targetFile);
            if (!targetProperty) return;

            if (targetProperty.type === MetaType.YAML) {
                await this.plugin.app.fileManager.processFrontMatter(targetFile, (frontmatter) => {
                    delete frontmatter[targetProperty.key];
                });
                return;
            }

            if (targetProperty.type === MetaType.Dataview) {
                await this.deleteDataviewProperty(targetProperty, targetFile);
            }
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
            const eventRef = this.plugin.app.metadataCache.on("changed", async (file, data, cache) => {
                if (unsubscribed) return;

                const previousProperties = previousPropertiesByPath.get(file.path) ?? null;
                const properties = this.cloneProperties(await this.plugin.controller.getPropertiesInFile(file));

                if (previousProperties && this.propertiesSignature(previousProperties) === this.propertiesSignature(properties)) {
                    return;
                }

                previousPropertiesByPath.set(file.path, this.cloneProperties(properties));

                await callback({
                    file,
                    data,
                    cache,
                    properties: this.cloneProperties(properties),
                    previousProperties: previousProperties ? this.cloneProperties(previousProperties) : null,
                });
            });

            const unsubscribe = () => {
                if (unsubscribed) return;

                unsubscribed = true;
                previousPropertiesByPath.clear();
                this.plugin.app.metadataCache.offref(eventRef);
            };

            this.plugin.register(unsubscribe);
            return unsubscribe;
        }
    }

    private async getPropertyInFile(propertyName: string, file: TFile): Promise<Property | undefined> {
        const propsInFile: Property[] = await this.plugin.controller.getPropertiesInFile(file);
        return propsInFile.find(prop => prop.key === propertyName);
    }

    private async deleteDataviewProperty(property: Property, file: TFile): Promise<void> {
        const fileContent = await this.plugin.app.vault.read(file);
        let deleted = false;

        const newFileContent = fileContent.split("\n")
            .map(line => {
                if (deleted) return line;

                const updatedLine = this.removeDataviewPropertyFromLine(property.key, line);
                if (updatedLine === line) return line;

                deleted = true;
                return updatedLine.trim().length === 0 ? null : updatedLine;
            })
            .filter((line): line is string => line !== null)
            .join("\n");

        await this.plugin.app.vault.modify(file, newFileContent);
    }

    private removeDataviewPropertyFromLine(propertyKey: string, line: string): string {
        const propertyRegex = new RegExp(`(^|[\\s\\[\\(])${this.escapeSpecialCharacters(propertyKey)}::[ ]*[^\\)\\]\\n\\r]*(\\]\\]|[\\]\\)]?)?`);
        return line.replace(propertyRegex, "").replace(/[ \t]{2,}/g, " ").trimEnd();
    }

    private escapeSpecialCharacters(text: string): string {
        return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    }

    private cloneAutoProperties(autoProperties: AutoProperty[]): AutoProperty[] {
        return autoProperties.map(autoProperty => ({
            name: autoProperty.name,
            choices: [...autoProperty.choices],
        }));
    }

    private validateAutoProperties(autoProperties: AutoProperty[]): AutoProperty[] {
        if (!Array.isArray(autoProperties)) {
            throw new TypeError("Auto Properties must be an array.");
        }

        const names = new Set<string>();

        return autoProperties.map((autoProperty, index) => {
            if (!autoProperty || typeof autoProperty !== "object") {
                throw new TypeError(`Auto Property at index ${index} must be an object.`);
            }

            if (typeof autoProperty.name !== "string" || autoProperty.name.length === 0) {
                throw new TypeError(`Auto Property at index ${index} must have a non-empty string name.`);
            }

            if (names.has(autoProperty.name)) {
                throw new Error(`Duplicate Auto Property name: ${autoProperty.name}`);
            }

            names.add(autoProperty.name);

            if (!Array.isArray(autoProperty.choices) || !autoProperty.choices.every(choice => typeof choice === "string")) {
                throw new TypeError(`Auto Property '${autoProperty.name}' choices must be an array of strings.`);
            }

            return {
                name: autoProperty.name,
                choices: [...autoProperty.choices],
            };
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
