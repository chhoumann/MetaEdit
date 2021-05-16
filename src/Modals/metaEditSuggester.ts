import {App, FuzzyMatch, FuzzySuggestModal, TFile} from "obsidian";
import type MetaEdit from "../main";
import type MetaController from "../metaController";
import type {SuggestData} from "../Types/suggestData";

const newYaml: string = "New YAML property";
const newDataView: string = "New Dataview field";

export default class MetaEditSuggester extends FuzzySuggestModal<string> {
    public app: App;
    private readonly file: TFile;
    private plugin: MetaEdit;
    private readonly data: SuggestData;
    private readonly options: SuggestData;
    private controller: MetaController;

    constructor(app: App, plugin: MetaEdit, data: SuggestData, file: TFile, controller: MetaController) {
        super(app);
        this.file = file;
        this.app = app;
        this.plugin = plugin;
        this.data = data;
        this.controller = controller;
        this.options = {
            newYaml, newDataView
        }

        this.removeIgnored();
    }

    renderSuggestion(item: FuzzyMatch<string>, el: HTMLElement) {
        super.renderSuggestion(item, el);

        if (Object.values(this.options).find(v => v === item.item)) {
            el.style.fontWeight = "bold";
        }
    }

    getItemText(item: string): string {
        return item;
    }

    getItems(): string[] {
        const dataKeys = Object.keys(this.data);
        const optionKeys = Object.values(this.options);

        return [...optionKeys, ...dataKeys];
    }

    async onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): Promise<void> {
        if (item === newYaml) {
            const {propName, propValue} = await this.controller.createNewProperty();
            await this.controller.addYamlProp(propName, propValue, this.file);
            return;
        }

        if (item === newDataView) {
            const {propName, propValue} = await this.controller.createNewProperty();
            await this.controller.addDataviewField(propName, propValue, this.file);
            return;
        }

        await this.controller.editMetaElement(item, this.data, this.file);
    }

    private removeIgnored(): void {
        const ignored = this.plugin.settings.IgnoredProperties.properties;
        const data = Object.keys(this.data);

        ignored.forEach(prop => {
            if (data.contains(prop))
                delete this.data[prop];
        })
    }

    selectSuggestion(value: FuzzyMatch<string>, evt: MouseEvent | KeyboardEvent) {
        console.log(`select ${value.item}`);
        console.log(evt.srcElement)
        super.selectSuggestion(value, evt);
    }
}