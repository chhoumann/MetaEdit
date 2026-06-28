import {AbstractInputSuggest, type App} from "obsidian";
import type {TFile} from "obsidian";

export class KanbanHelperSettingSuggester extends AbstractInputSuggest<TFile> {

    constructor(app: App, private readonly inputEl: HTMLInputElement, private readonly boards: TFile[]) {
        super(app, inputEl);
        this.onSelect((item) => this.acceptSuggestion(item));
    }

    protected getSuggestions(inputStr: string): TFile[] {
        const inputLowerCase: string = inputStr.toLowerCase();
        return this.boards.filter(board => board.basename.toLowerCase().includes(inputLowerCase));
    }

    private acceptSuggestion(item: TFile): void {
        this.setValue(item.basename);
        this.inputEl.trigger("input");
        this.close();
    }

    renderSuggestion(value: TFile, el: HTMLElement): void {
        if (value)
            el.setText(value.basename);
    }
}
