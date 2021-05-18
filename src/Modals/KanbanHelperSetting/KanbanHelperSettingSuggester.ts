import {TextInputSuggest} from "../../suggest";
import type {App} from "obsidian";
import type {TFile} from "obsidian";

export class KanbanHelperSettingSuggester extends TextInputSuggest<TFile> {
    public app: App;
    public inputEl: HTMLInputElement;
    private boards: TFile[];

    constructor(app: App, inputEl: HTMLInputElement, boards: TFile[]) {
        super(app, inputEl);
        this.app = app;
        this.inputEl = inputEl;
        this.boards = boards;
    }

    getSuggestions(inputStr: string): TFile[] {
        const inputLowerCase: string = inputStr.toLowerCase();
        return this.boards.map(board => {
            if (board.basename.toLowerCase().contains(inputLowerCase))
                return board;
        });
    }

    selectSuggestion(item: TFile): void {
        this.inputEl.value = item.basename;
        this.inputEl.trigger("input");
        this.close();
    }

    renderSuggestion(value: TFile, el: HTMLElement): void {
        if (value)
            el.setText(value.basename);
    }
}