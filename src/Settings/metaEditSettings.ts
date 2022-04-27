import type { EditMode } from '../types/editMode';
import type { ProgressProperty } from '../types/progressProperty';
import type { AutoProperty } from '../types/autoProperty';
import type { KanbanProperty } from '../types/kanbanProperty';

export interface MetaEditSettings {
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
