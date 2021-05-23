import type MetaEdit from "./main";
import MetaController from "./metaController";
import type {IMetaEditApi} from "./IMetaEditApi";

export class MetaEditApi {
    constructor(private plugin: MetaEdit) {
    }

    public make(): IMetaEditApi {
        return {
            autoprop: propertyName => new MetaController(this.plugin.app, this.plugin).handleAutoProperties(propertyName)
        };
    }
}