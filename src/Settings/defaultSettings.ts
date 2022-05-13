import { EditMode } from '../types/editMode';
import type { MetaEditSettings } from './metaEditSettings';
import {ListType} from "../types/listType";

export const DEFAULT_SETTINGS: MetaEditSettings = Object.freeze({
    PropertyTypes: {
        aliases: ListType.List,
        cssClasses: ListType.WhitespaceSeparated,
        tags: ListType.WhitespaceSeparated,
        userDefined: new Map<string, ListType>(),
    },
    ProgressProperties: {
        enabled: false,
        properties: [],
    },
    IgnoredProperties: {
        enabled: false,
        properties: [],
    },
    AutoProperties: {
        enabled: false,
        properties: [],
    },
    EditMode: {
        mode: EditMode.AllSingle,
        properties: [],
    },
    KanbanHelper: {
        enabled: false,
        boards: [],
    },
    UIElements: {
        enabled: true,
    },
});
