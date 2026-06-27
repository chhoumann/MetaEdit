import type {Property} from "./parser";
import {MetaType} from "./Types/metaType";

export const newDataView: string = "New Dataview field";
export const newYaml: string = "New YAML property";
export const MAIN_SUGGESTER_OPTIONS: Property[] = [
    {key: newYaml, content: newYaml, type: MetaType.Option},
    {key: newDataView, content: newDataView, type: MetaType.Option}
]
