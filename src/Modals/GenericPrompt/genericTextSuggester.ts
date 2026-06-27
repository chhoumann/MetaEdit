import {AbstractInputSuggest, type App} from "obsidian";
import {filterSuggestions} from "./valueSuggest";

export class GenericTextSuggester extends AbstractInputSuggest<string> {

    constructor(
        app: App,
        private readonly inputEl: HTMLInputElement,
        private items: string[],
    ) {
        super(app, inputEl);
    }

    protected getSuggestions(inputStr: string): string[] {
        return filterSuggestions(this.items, inputStr);
    }

    selectSuggestion(item: string, _evt: MouseEvent | KeyboardEvent): void {
        this.setValue(item);
        this.inputEl.trigger("input");
        this.close();
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        if (value)
            el.setText(value);
    }

    refreshSuggestions(): void {
        this.inputEl.trigger("input");
    }
}
