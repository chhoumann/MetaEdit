import {TextInputSuggest} from "../../suggest";
import {filterSuggestions} from "./valueSuggest";
import type {App} from "obsidian";

export class GenericTextSuggester extends TextInputSuggest<string> {

    constructor(
        public app: App,
        public inputEl: HTMLInputElement,
        private items: string[],
        options?: {openOnFocus?: boolean},
    ) {
        super(app, inputEl, options);
    }

    getSuggestions(inputStr: string): string[] {
        return filterSuggestions(this.items, inputStr);
    }

    selectSuggestion(item: string): void {
        this.inputEl.value = item;
        this.inputEl.trigger("input");
        this.close();
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        if (value)
            el.setText(value);
    }
}
