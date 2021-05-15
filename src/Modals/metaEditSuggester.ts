import {App, FuzzyMatch, FuzzySuggestModal, TFile} from "obsidian";
import type MetaEdit from "../main";
import type MetaController from "../metaController";

export type SuggestData = {[key: string]: string};

export default class MetaEditSuggester extends FuzzySuggestModal<string> {
    public app: App;
    private readonly file: TFile;
    private plugin: MetaEdit;
    private readonly data: SuggestData;
    private options: SuggestData;
    private controller: MetaController;

    constructor(app: App, plugin: MetaEdit, data: SuggestData, file: TFile, controller: MetaController) {
        super(app);
        this.file = file;
        this.app = app;
        this.plugin = plugin;
        this.data = data;
        this.controller = controller;

        this.getMetaOptions();
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
        switch (item) {
            case "New YAML property":
                await this.controller.addYamlProp(this.file);
                break;
            case "New Dataview field":
                await this.controller.addDataviewField(this.file);
                break;
            default:
                await this.controller.editMetaElement(item, this.data, this.file);
                break;
        }
    }

    private getMetaOptions(): void {
        this.options = {
            newYaml: "New YAML property",
            newDataView: "New Dataview field"
        }
    }

    private removeIgnored(): void {
        const ignored = this.plugin.settings.IgnoredProperties.properties;
        const data = Object.keys(this.data);

        ignored.forEach(prop => {
            if (data.contains(prop))
                delete this.data[prop];
        })
    }
}