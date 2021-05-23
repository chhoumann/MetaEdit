import type {Property} from "./parser";
import {MetaType} from "./Types/metaType";

export const ADD_FIRST_ELEMENT: string = "cmd:addfirst";
export const ADD_TO_BEGINNING: string = "cmd:beg";
export const ADD_TO_END: string = "cmd:end";

export const newDataView: string = "New Dataview field";
export const newYaml: string = "New YAML property";
export const MAIN_SUGGESTER_OPTIONS: Property[] = [
    {key: newYaml, content: newYaml, type: MetaType.Option},
    {key: newDataView, content: newDataView, type: MetaType.Option}
]