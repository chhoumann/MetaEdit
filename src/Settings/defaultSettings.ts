import { EditMode } from '../types/editMode';
import type { MetaEditSettings } from './metaEditSettings';

export const DEFAULT_SETTINGS: MetaEditSettings = Object.freeze({
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
