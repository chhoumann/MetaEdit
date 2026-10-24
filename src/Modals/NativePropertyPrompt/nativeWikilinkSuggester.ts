import {AbstractInputSuggest, type App, type TFile} from "obsidian";

type LinkSuggestion = {
	alias?: string;
	file?: TFile;
	path?: string;
};

const WIKILINK_QUERY = /\[\[([^\]]*)$/;

export class NativeWikilinkSuggester extends AbstractInputSuggest<LinkSuggestion> {
	constructor(
		app: App,
		private readonly inputEl: HTMLDivElement,
		private readonly sourcePath: string,
	) {
		super(app, inputEl);
		this.onSelect((suggestion) => this.acceptSuggestion(suggestion));
	}

	protected getSuggestions(text: string): LinkSuggestion[] {
		const match = text.match(WIKILINK_QUERY);
		if (!match) return [];

		const normalized = (match[1] ?? "").toLowerCase();
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

	private acceptSuggestion(suggestion: LinkSuggestion): void {
		if (!suggestion.file) return;
		const link = this.app.fileManager.generateMarkdownLink(
			suggestion.file,
			this.sourcePath,
			"",
			suggestion.alias,
		);
		this.setValue(link);
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
