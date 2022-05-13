import type { EditMode } from '../types/editMode';
import type { ProgressProperty } from '../types/progressProperty';
import type { AutoProperty } from '../types/autoProperty';
import type { KanbanProperty } from '../types/kanbanProperty';
import type {ListType} from "../types/listType";

export interface MetaEditSettings {
    PropertyTypes: {
        aliases: ListType;
        cssClasses: ListType;
        tags: ListType;
        userDefined: Map<string, ListType>;
    }
    ProgressProperties: {
        enabled: boolean;
        properties: ProgressProperty[];
    };
    IgnoredProperties: {
        enabled: boolean;
        properties: string[];
    };
    AutoProperties: {
        enabled: boolean;
        properties: AutoProperty[];
    };
    EditMode: {
        mode: EditMode;
        properties: string[];
    };
    KanbanHelper: {
        enabled: boolean;
        boards: KanbanProperty[];
    };
    UIElements: {
        enabled: boolean;
    };
}
