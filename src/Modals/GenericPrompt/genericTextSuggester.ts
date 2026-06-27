import {TextInputSuggest} from "../../suggest";
import {filterSuggestions} from "./valueSuggest";
import type {App} from "obsidian";

export class GenericTextSuggester extends TextInputSuggest<string> {

    constructor(public app: App, public inputEl: HTMLInputElement, private items: string[]) {
        // The prompt seeds the input with the current value, so opening on focus
        // would pre-highlight a suggestion and make a bare Enter overwrite that
        // value. Only open once the user actually types.
        super(app, inputEl, {openOnFocus: false});
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
