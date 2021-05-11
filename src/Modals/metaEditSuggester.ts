import {App, FuzzyMatch, FuzzySuggestModal} from "obsidian";
import type MetaEdit from "../main";

type SuggestData = {[key: string]: string};

export default class MetaEditSuggester extends FuzzySuggestModal<string> {
    public app: App;
    private plugin: MetaEdit;
    private readonly data: SuggestData;
    private options: SuggestData;

    constructor(app: App, plugin: MetaEdit, data: SuggestData) {
        super(app);
        this.app = app;
        this.plugin = plugin;
        this.data = data;

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

    onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
        console.log(item, this.data[item]);
    }

    private getMetaOptions(): void {
        const settings = this.plugin.settings;

        this.options = {
            newYaml: "New YAML property",
            newDataView: "New Dataview field"
        }

        if (settings.ProgressProperties.enabled)
            this.options["progressProps"] = "Update Progress Properties";
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