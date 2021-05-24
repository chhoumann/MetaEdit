import type MetaEdit from "./main";
import MetaController from "./metaController";
import type {IMetaEditApi} from "./IMetaEditApi";
import type {Property} from "./parser";

export class MetaEditApi {
    constructor(private plugin: MetaEdit) {
    }

    public make(): IMetaEditApi {
        return {
            autoprop: propertyName => new MetaController(this.plugin.app, this.plugin).handleAutoProperties(propertyName),
            update: async (propertyName, propertyValue, file) => {
                const controller: MetaController = new MetaController(this.plugin.app, this.plugin);
                const propsInFile: Property[] = await controller.getPropertiesInFile(file);

                const targetProperty = propsInFile.find(prop => prop.key === propertyName);
                if (!targetProperty) return;

                return controller.updatePropertyInFile(targetProperty, propertyValue, file)
            },
        };
    }
}