import type {EditMode} from "../Types/editMode";
import type {ProgressProperty} from "../Types/progressProperty";

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
        properties: {[key: string]: string[]}
    },
    EditMode: {
        mode: EditMode,
        multiProperties: string[],
        singleProperties: string[],
    }
}