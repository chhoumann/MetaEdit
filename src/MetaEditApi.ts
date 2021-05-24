import type MetaEdit from "./main";
import MetaController from "./metaController";
import type {IMetaEditApi} from "./IMetaEditApi";
import type {Property} from "./parser";
import {TFile} from "obsidian";

export class MetaEditApi {
    constructor(private plugin: MetaEdit) {
    }

    public make(): IMetaEditApi {
        return {
            autoprop: this.getAutopropFunction(),
            update: this.getUpdateFunction(),
        };
    }

    private getAutopropFunction() {
        return (propertyName: string) => new MetaController(this.plugin.app, this.plugin).handleAutoProperties(propertyName);
    }

    private getUpdateFunction(): (propertyName: string, propertyValue: string, file: (TFile | string)) => Promise<undefined | void> {
        return async (propertyName: string, propertyValue: string, file: TFile | string) => {
            const targetFile = this.getFileFromTFileOrPath(file);
            if (!targetFile) return;

            const controller: MetaController = new MetaController(this.plugin.app, this.plugin);
            const propsInFile: Property[] = await controller.getPropertiesInFile(targetFile);

            const targetProperty = propsInFile.find(prop => prop.key === propertyName);
            if (!targetProperty) return;

            return controller.updatePropertyInFile(targetProperty, propertyValue, targetFile);
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
}