import type {EditMode} from "../Types/editMode";
import type {ProgressProperty} from "../Types/progressProperty";
import type {AutoProperty} from "../Types/autoProperty";
import type {KanbanProperty} from "../Types/kanbanProperty";

export interface MetaEditSettings {
    ProgressProperties: {
        enabled: boolean,
        properties: ProgressProperty[]
    },
    // Storage key for the "Edit Meta menu" settings section (its displayed name).
    // `enabled` gates both controls: `properties` (hide keys by exact match) and
    // `hideFileTags` (hide the whole body-#tag category).
    IgnoredProperties: {
        enabled: boolean,
        properties: string[],
        hideFileTags: boolean
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