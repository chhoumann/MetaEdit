import type {TFile} from "obsidian";
import type {Property} from "./Parser/parser";

export interface IMetaEditApi {
    autoprop: (propertyName: string) => void;
    update: (propertyName: string, propertyValue: string, file: TFile | string) => Promise<void>;
    getPropertyValue: (propertyName: string, file: (TFile | string)) => Promise<any>;
    getFilesWithProperty: (propertyName: string) => TFile[];
    createYamlProperty: (propertyName: string, propertyValue: string, file: TFile | string) => Promise<void>;
    getPropertiesInFile: (file: TFile | string) => Promise<Property[]>;
}

