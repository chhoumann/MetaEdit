import {App, FuzzySuggestModal} from "obsidian";
import type MetaEdit from "../main";

const options = {
    progressProps: "Update Progress Properties",
    newYaml: "New YAML property",
    newDataView: "New Dataview field"
}

type SuggestData = {[key: string]: string};

export default class MetaEditSuggester extends FuzzySuggestModal<string> {
    public app: App;
    private plugin: MetaEdit;
    private readonly data: SuggestData;

    constructor(app: App, plugin: MetaEdit, data: SuggestData) {
        super(app);
        this.app = app;
        this.plugin = plugin;
        this.data = data;
    }

    getItemText(item: string): string {
        return item;
    }

    getItems(): string[] {
        const dataKeys = Object.keys(this.data);
        const optionKeys = Object.values(options);
        return [...optionKeys, ...dataKeys];
    }

    onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
        console.log(item, this.data[item]);
    }
}