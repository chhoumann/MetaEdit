import {type App, FuzzySuggestModal} from "obsidian";

export default class GenericSuggester extends FuzzySuggestModal<string>{
    private resolvePromise: (value: string) => void;
    private promise: Promise<string>;
    private didChoose = false;

    public static Suggest(app: App, displayItems: string[], items: string[]) {
        const newSuggester = new GenericSuggester(app, displayItems, items);
        return newSuggester.promise;
    }

    private constructor(app: App, private displayItems: string[], private items: string[]) {
        super(app);

        this.promise = new Promise<string>(
            (resolve) => (this.resolvePromise = resolve)
        );

        this.open();
    }

    getItemText(item: string): string {
        return this.displayItems[this.items.indexOf(item)];
    }

    getItems(): string[] {
        return this.items;
    }

    onChooseItem(item: string, _evt: MouseEvent | KeyboardEvent): void {
        this.didChoose = true;
        this.resolvePromise(item);
    }

    onClose(): void {
        super.onClose();
        // Escape / click-away without choosing resolves to "" so callers can treat
        // it as a cancel instead of leaving the promise (and the caller's finally
        // cleanup) pending forever. Deferred to a microtask because Obsidian may
        // fire onClose BEFORE onChooseItem when an item is selected; deferring lets
        // a real selection settle the promise first, so this only fires on a true
        // cancel.
        queueMicrotask(() => {
            if (!this.didChoose) this.resolvePromise("");
        });
    }

}
