import type MetaEdit from "./main";
import type {IMetaEditApi, MetaEditPropertyValue} from "./IMetaEditApi";
import type {Property} from "./parser";
import {TFile} from "obsidian";
import {MetaType} from "./Types/metaType";

export class MetaEditApi {
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
}
