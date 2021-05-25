import {TextInputSuggest} from "../../suggest";
import type {App} from "obsidian";

export class GenericTextSuggester extends TextInputSuggest<string> {

    constructor(public app: App, public inputEl: HTMLInputElement, private items: string[]) {
        super(app, inputEl);
    }

    getSuggestions(inputStr: string): string[] {
        const inputLowerCase: string = inputStr.toLowerCase();
        return this.items.map(item => {
            if (item.toLowerCase().contains(inputLowerCase))
                return item;
        });
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