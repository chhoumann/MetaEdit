import type {EditMode} from "../Types/editMode";
import type {ProgressProperty} from "../Types/progressProperty";
import type {AutoProperty} from "../Types/autoProperty";
import type {KanbanProperty} from "../Types/kanbanProperty";

export interface MetaEditSettings {
    ProgressProperties: {
        enabled: boolean,
        properties: ProgressProperty[]
    },
    IgnoredProperties: {
        enabled: boolean,
        properties: string[]
    },
    AutoProperties: {
        enabled: boolean,
        properties: AutoProperty[]
    },
    EditMode: {
        mode: EditMode,
        properties: string[],
    },
    KanbanHelper: {
        enabled: boolean,
        boards: KanbanProperty[]
    }
    UIElements: {
        enabled: boolean
    }
}