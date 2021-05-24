import type {TFile} from "obsidian";

export interface IMetaEditApi {
    autoprop: (propertyName: string) => void;
    update: (propertyName: string, propertyValue: string, file: TFile | string) => Promise<void>;
}

