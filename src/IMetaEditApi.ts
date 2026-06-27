import type {CachedMetadata, TFile} from "obsidian";
import type {Property} from "./parser";
import type {AutoProperty} from "./Types/autoProperty";
import type {YamlPathSegment} from "./yamlPath";

export type MetaEditPropertyValue = unknown;
export type MetaEditUnsubscribe = () => void;
export type MetaEditYamlPath = string | readonly YamlPathSegment[];
export type MetaEditYamlPathOptions = {
    createParents?: boolean;
};

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
    getYamlPath: (path: MetaEditYamlPath, file: TFile | string) => Promise<any>;
    updateYamlPath: (path: MetaEditYamlPath, propertyValue: MetaEditPropertyValue, file: TFile | string) => Promise<void>;
    addOrUpdateYamlPath: (path: MetaEditYamlPath, propertyValue: MetaEditPropertyValue, file: TFile | string, options?: MetaEditYamlPathOptions) => Promise<void>;
    getPropertiesInFile: (file: TFile | string) => Promise<Property[]>;
    getAutoProperties: () => AutoProperty[];
    setAutoProperties: (autoProperties: AutoProperty[]) => Promise<void>;
    onMetadataChange: (callback: MetaEditMetadataChangeCallback) => MetaEditUnsubscribe;
}
