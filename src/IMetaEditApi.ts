import type {CachedMetadata, TFile} from "obsidian";
import type {Property} from "./parser";
import type {AutoProperty} from "./Types/autoProperty";

export type MetaEditPropertyValue = unknown;
export type MetaEditUnsubscribe = () => void;

export interface MetaEditMetadataChange {
    file: TFile;
    data: string;
    cache: CachedMetadata;
    properties: Property[];
    previousProperties: Property[] | null;
}

export type MetaEditMetadataChangeCallback = (change: MetaEditMetadataChange) => void | Promise<void>;

export interface IMetaEditApi {
    autoprop: (propertyName: string) => Promise<string | string[] | null>;
    update: (propertyName: string, propertyValue: MetaEditPropertyValue, file: TFile | string) => Promise<void>;
    getPropertyValue: (propertyName: string, file: (TFile | string)) => Promise<any>;
    getFilesWithProperty: (propertyName: string) => TFile[];
    createYamlProperty: (propertyName: string, propertyValue: MetaEditPropertyValue, file: TFile | string) => Promise<void>;
    addOrUpdateProperty: (propertyName: string, propertyValue: MetaEditPropertyValue, file: TFile | string) => Promise<void>;
    getPropertiesInFile: (file: TFile | string) => Promise<Property[]>;
    getAutoProperties: () => AutoProperty[];
    setAutoProperties: (autoProperties: AutoProperty[]) => Promise<void>;
    onMetadataChange: (callback: MetaEditMetadataChangeCallback) => MetaEditUnsubscribe;
}
