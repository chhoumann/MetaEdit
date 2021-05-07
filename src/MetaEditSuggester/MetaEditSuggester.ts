import {App, FuzzySuggestModal} from "obsidian";
import MetaEdit from "../main";

export default class MetaEditSuggester extends FuzzySuggestModal<string> {
    public app: App;
    private plugin: MetaEdit;

    constructor(app: App, plugin: MetaEdit) {
        super(app);
        this.app = app;
        this.plugin = plugin;
    }


    getItemText(item: string): string {
        return "Some item";
    }

    getItems(): string[] {
        return ["Item 1", "Item 2"];
    }

    onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
    }

}