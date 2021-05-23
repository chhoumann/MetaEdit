import type {MetaEditSettings} from "./metaEditSettings";
import {EditMode} from "../Types/editMode";

export const DEFAULT_SETTINGS: MetaEditSettings = Object.freeze({
    ProgressProperties: {
        enabled: false,
        properties: []
    },
    IgnoredProperties: {
        enabled: false,
        properties: []
    },
    AutoProperties: {
        enabled: false,
        properties: []
    },
    EditMode: {
        mode: EditMode.AllSingle,
        properties: [],
    },
    KanbanHelper: {
        enabled: false,
        boards: []
    },
    UIElements: {
        enabled: true
    }
});