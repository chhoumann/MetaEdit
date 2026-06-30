import {AbstractInputSuggest, type App, type TFile} from "obsidian";

type LinkSuggestion = {
	alias?: string;
	file?: TFile;
	path?: string;
};

const WIKILINK_QUERY = /\[\[([^\]]*)$/;

export class NativeWikilinkSuggester extends AbstractInputSuggest<LinkSuggestion> {
	private readonly mirrorEl: HTMLInputElement;
	private readonly onInput = () => this.refreshFromContent();

	constructor(
		app: App,
		private readonly inputEl: HTMLElement,
		private readonly sourcePath: string,
	) {
		const mirrorHost = inputEl.parentElement ?? inputEl;
		const mirrorEl = mirrorHost.createEl("input", {
			cls: "metaedit-native-wikilink-suggest-mirror",
			type: "text",
		});
		super(app, mirrorEl);
		this.mirrorEl = mirrorEl;
		this.mirrorEl.tabIndex = -1;
		this.mirrorEl.setAttribute("aria-hidden", "true");
		this.inputEl.addEventListener("input", this.onInput);
		this.inputEl.addEventListener("keyup", this.onInput);
		this.onSelect((suggestion) => this.acceptSuggestion(suggestion));
	}

	protected getSuggestions(query: string): LinkSuggestion[] {
		const normalized = query.toLowerCase();
		return this.readLinkSuggestions()
			.filter(suggestion => {
				const path = suggestion.path ?? suggestion.file?.basename ?? "";
				const alias = suggestion.alias ?? "";
				return path.toLowerCase().includes(normalized) ||
					alias.toLowerCase().includes(normalized);
			})
			.slice(0, 50);
	}

	renderSuggestion(value: LinkSuggestion, el: HTMLElement): void {
		const label = value.alias ?? value.path ?? value.file?.basename ?? value.file?.path ?? "";
		el.setText(label);
	}

	selectSuggestion(value: LinkSuggestion, _evt: MouseEvent | KeyboardEvent): void {
		this.acceptSuggestion(value);
	}

	destroy(): void {
		this.inputEl.removeEventListener("input", this.onInput);
		this.inputEl.removeEventListener("keyup", this.onInput);
		this.close();
		this.mirrorEl.remove();
	}

	private refreshFromContent(): void {
		const match = this.currentQuery();
		if (!match) {
			this.close();
			return;
		}

		this.mirrorEl.value = match.query;
		this.mirrorEl.focus();
		this.mirrorEl.trigger("input");
	}

	private currentQuery(): {query: string} | null {
		const text = this.inputEl.textContent ?? "";
		const match = text.match(WIKILINK_QUERY);
		if (!match) return null;
		return {query: match[1] ?? ""};
	}

	private acceptSuggestion(suggestion: LinkSuggestion): void {
		if (!suggestion.file) return;
		const link = this.app.fileManager.generateMarkdownLink(
			suggestion.file,
			this.sourcePath,
			"",
			suggestion.alias,
		);
		this.inputEl.textContent = link;
		this.inputEl.focus();
		this.inputEl.trigger("input");
		this.close();
	}

	private readLinkSuggestions(): LinkSuggestion[] {
		const metadataCache = this.app.metadataCache as unknown as {
			getLinkSuggestions?: () => LinkSuggestion[];
		};
		const suggestions = metadataCache.getLinkSuggestions?.() ?? [];
		return suggestions.filter(suggestion => suggestion.file);
	}
}
