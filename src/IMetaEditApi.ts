import type {TFile} from "obsidian";
import type {Property} from "./parser";

export type MetaEditPropertyValue = unknown;

export interface IMetaEditApi {
    autoprop: (propertyName: string) => Promise<string | null>;
    update: (propertyName: string, propertyValue: MetaEditPropertyValue, file: TFile | string) => Promise<void>;
    getPropertyValue: (propertyName: string, file: (TFile | string)) => Promise<any>;
    getFilesWithProperty: (propertyName: string) => TFile[];
    createYamlProperty: (propertyName: string, propertyValue: MetaEditPropertyValue, file: TFile | string) => Promise<void>;
    addOrUpdateProperty: (propertyName: string, propertyValue: MetaEditPropertyValue, file: TFile | string) => Promise<void>;
    deleteProperty: (propertyName: string, file: TFile | string) => Promise<void>;
    getPropertiesInFile: (file: TFile | string) => Promise<Property[]>;
}
