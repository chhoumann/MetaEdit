import {Menu, setIcon, setTooltip, type App} from "obsidian";
import {
	NATIVE_TYPE_CHOICES,
	getNativeWidgetForType,
	type StandardNativePropertyType,
} from "../typedProperties/nativePropertyTypes";

const FALLBACK_ICONS: Record<StandardNativePropertyType, string> = {
	text: "text",
	multitext: "list",
	number: "binary",
	checkbox: "check-square",
	date: "calendar",
	datetime: "clock",
	tags: "tags",
	aliases: "text",
	cssclasses: "list",
};

export interface TypePillOptions {
	app: App;
	parentEl: HTMLElement;
	/** Tooltip on the unlocked pill (mention the accelerator and any scope caveat). */
	tooltip: string;
	onPick: (type: StandardNativePropertyType) => void;
	/**
	 * Runs before the menu opens (click or accelerator); return false to keep it
	 * closed. The create modal settles the key here so a reserved key can lock the
	 * pill before the user ever sees the menu.
	 */
	beforeOpen?: () => boolean;
}

/**
 * The type pill + Set-type dropdown shared by the fluid create modal and the
 * native edit prompt: one button showing the current type's icon and label,
 * opening Obsidian's Menu with the user-selectable native types anchored under
 * the pill. Extracted from FluidPropertyCreatePrompt (PR #170) so both modals
 * present type switching identically. The pill is display-only state: callers
 * own the actual widget re-mount in `onPick` and report the outcome back via
 * {@link setState}.
 */
export class TypePill {
	public readonly buttonEl: HTMLButtonElement;
	private readonly iconEl: HTMLElement;
	private readonly labelEl: HTMLElement;
	private readonly opts: TypePillOptions;

	private type: StandardNativePropertyType = "text";
	private locked = false;

	constructor(options: TypePillOptions) {
		this.opts = options;
		this.buttonEl = options.parentEl.createEl("button", {cls: "metaedit-type-pill"});
		this.buttonEl.type = "button";
		this.iconEl = this.buttonEl.createSpan({cls: "metaedit-type-pill-icon"});
		this.labelEl = this.buttonEl.createSpan({cls: "metaedit-type-pill-label"});
		this.buttonEl.addEventListener("click", () => this.openMenu());
	}

	/** Reflect the mounted widget's type on the pill; `locked` disables the menu. */
	public setState(type: StandardNativePropertyType, locked: boolean): void {
		this.type = type;
		this.locked = locked;
		const label = this.labelFor(type);
		setIcon(this.iconEl, this.iconIdFor(type));
		this.labelEl.setText(label);
		this.buttonEl.toggleClass("is-locked", locked);
		this.buttonEl.disabled = locked;
		setTooltip(this.buttonEl, locked ? `${label} (fixed for this property)` : this.opts.tooltip);
	}

	public openMenu(): void {
		if (this.opts.beforeOpen && !this.opts.beforeOpen()) return;
		if (this.locked) return;

		const menu = new Menu();
		for (const choice of NATIVE_TYPE_CHOICES) {
			menu.addItem(item => {
				item.setTitle(choice.label);
				item.setIcon(this.iconIdFor(choice.type));
				item.setChecked(choice.type === this.type);
				item.onClick(() => this.opts.onPick(choice.type));
			});
		}
		// Anchor the menu under the pill like a dropdown (deterministic position,
		// independent of the pointer), so click and Cmd/Ctrl+Y open it the same way.
		const rect = this.buttonEl.getBoundingClientRect();
		menu.showAtPosition({x: rect.left, y: rect.bottom + 4});
	}

	public hide(): void {
		this.buttonEl.hide();
	}

	public show(): void {
		this.buttonEl.show();
	}

	private labelFor(type: StandardNativePropertyType): string {
		const label = NATIVE_TYPE_CHOICES.find(choice => choice.type === type)?.label;
		if (label) return label;
		return type.length === 0 ? type : type[0].toUpperCase() + type.slice(1);
	}

	private iconIdFor(type: StandardNativePropertyType): string {
		const raw = getNativeWidgetForType(this.opts.app, type)?.icon;
		const id = typeof raw === "string" ? raw.replace(/^lucide-/, "") : "";
		return id || FALLBACK_ICONS[type];
	}
}
