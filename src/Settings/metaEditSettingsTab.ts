import {
    type App,
    Notice,
    PluginSettingTab,
    type SettingDefinitionItem,
    type SettingDefinitionList,
    SettingPage,
    type TFile,
} from "obsidian";
import type MetaEdit from "../main";
import {EditMode} from "../Types/editMode";
import {ProgressPropertyOptions} from "../Types/progressPropertyOptions";
import type {MetaEditSettings} from "./metaEditSettings";
import AutoPropertiesModalContent from "../Modals/AutoPropertiesSettingModal/AutoPropertiesModalContent.svelte";
import GenericPrompt from "../Modals/GenericPrompt/GenericPrompt";
import GenericSuggester from "../Modals/GenericSuggester/GenericSuggester";
import {type MountedSvelteComponent, mountSvelteComponent, unmountSvelteComponent} from "../svelteMount";
import {applyAutoPropertySettingsOperation, type AutoPropertySettingsOperation} from "../autoProperties";

type Control = {
    get: (settings: MetaEditSettings) => unknown;
    set: (settings: MetaEditSettings, value: unknown) => void;
    // Runtime state that has to follow the stored value.
    apply?: (plugin: MetaEdit) => void;
};

const controls = {
    "UIElements.enabled": {
        get: s => s.UIElements.enabled,
        set: (s, v) => s.UIElements.enabled = v === true,
        apply: plugin => plugin.settings.UIElements.enabled
            ? plugin.linkMenu.registerEvent()
            : plugin.linkMenu.unregisterEvent(),
    },
    "EditMode.mode": {
        get: s => s.EditMode.mode,
        set: (s, v) => s.EditMode.mode = v as EditMode,
    },
    "IgnoredProperties.enabled": {
        get: s => s.IgnoredProperties.enabled,
        set: (s, v) => s.IgnoredProperties.enabled = v === true,
    },
    "IgnoredProperties.hideFileTags": {
        get: s => s.IgnoredProperties.hideFileTags,
        set: (s, v) => s.IgnoredProperties.hideFileTags = v === true,
    },
    "AutoProperties.enabled": {
        get: s => s.AutoProperties.enabled,
        set: (s, v) => s.AutoProperties.enabled = v === true,
    },
    "ProgressProperties.enabled": {
        get: s => s.ProgressProperties.enabled,
        set: (s, v) => s.ProgressProperties.enabled = v === true,
        apply: plugin => plugin.toggleAutomators(),
    },
    "KanbanHelper.enabled": {
        get: s => s.KanbanHelper.enabled,
        set: (s, v) => s.KanbanHelper.enabled = v === true,
        apply: plugin => plugin.toggleAutomators(),
    },
} satisfies Record<string, Control>;

type ControlKey = keyof typeof controls;

function isControlKey(key: string): key is ControlKey {
    return Object.prototype.hasOwnProperty.call(controls, key);
}

const progressTypeLabels: Record<ProgressPropertyOptions, string> = {
    [ProgressPropertyOptions.TaskTotal]: "Total tasks",
    [ProgressPropertyOptions.TaskComplete]: "Completed tasks",
    [ProgressPropertyOptions.TaskIncomplete]: "Incomplete tasks",
};

/** A settings sub-page whose whole body is one Svelte editor. */
class SvelteSettingPage extends SettingPage {
    private mounted: MountedSvelteComponent | null = null;

    constructor(private readonly mountContent: (target: HTMLElement) => MountedSvelteComponent) {
        super();
    }

    display(): void {
        unmountSvelteComponent(this.mounted);
        this.containerEl.empty();
        this.mounted = this.mountContent(this.containerEl);
    }

    hide(): void {
        unmountSvelteComponent(this.mounted);
        this.mounted = null;
        super.hide();
    }
}

export class MetaEditSettingsTab extends PluginSettingTab {
    plugin: MetaEdit;

    constructor(app: App, plugin: MetaEdit) {
        super(app, plugin);
        this.plugin = plugin;
    }

    override getControlValue(key: string): unknown {
        return isControlKey(key) ? controls[key].get(this.plugin.settings) : undefined;
    }

    override async setControlValue(key: string, value: unknown): Promise<void> {
        if (!isControlKey(key)) return;
        const control: Control = controls[key];

        if (await this.persist(settings => control.set(settings, value))) {
            control.apply?.(this.plugin);
        }
        this.refreshDomState();
    }

    override getSettingDefinitions(): SettingDefinitionItem<ControlKey>[] {
        const settings = this.plugin.settings;
        const count = (items: () => unknown[]) => () => String(items().length);

        return [
            {
                type: "group",
                heading: "Editing",
                items: [
                    {
                        name: "Edit mode",
                        desc: "Whether property values are saved as one value or as a list.",
                        control: {
                            type: "dropdown",
                            key: "EditMode.mode",
                            options: {
                                [EditMode.AllSingle]: "One value",
                                [EditMode.AllMulti]: "List",
                                [EditMode.SomeMulti]: "List for chosen properties",
                            },
                        },
                    },
                    {
                        type: "page",
                        name: "List properties",
                        visible: () => settings.EditMode.mode === EditMode.SomeMulti,
                        displayValue: count(() => settings.EditMode.properties),
                        items: [this.propertyNameList(s => s.EditMode.properties)],
                    },
                    {
                        name: "Auto properties",
                        desc: "Pick from preset values when you edit these properties.",
                        control: {type: "toggle", key: "AutoProperties.enabled"},
                    },
                    {
                        type: "page",
                        name: "Preset values",
                        visible: () => settings.AutoProperties.enabled,
                        displayValue: count(() => settings.AutoProperties.properties),
                        page: () => new SvelteSettingPage(target => mountSvelteComponent(
                            AutoPropertiesModalContent,
                            target,
                            {
                                autoProperties: settings.AutoProperties.properties,
                                save: (operation: AutoPropertySettingsOperation) => this.saveAutoPropertiesOperation(operation),
                            },
                        )),
                    },
                ],
            },
            {
                type: "group",
                heading: "Menu",
                items: [
                    {
                        name: "Right-click menu",
                        desc: "Show Edit Meta when you right-click a note or link.",
                        control: {type: "toggle", key: "UIElements.enabled"},
                    },
                    {
                        name: "Hide properties",
                        desc: "Leave chosen properties out of the property menu.",
                        control: {type: "toggle", key: "IgnoredProperties.enabled"},
                    },
                    {
                        name: "Hide file tags",
                        desc: "A frontmatter tags property stays in the menu.",
                        visible: () => settings.IgnoredProperties.enabled,
                        control: {type: "toggle", key: "IgnoredProperties.hideFileTags"},
                    },
                    {
                        type: "page",
                        name: "Hidden properties",
                        visible: () => settings.IgnoredProperties.enabled,
                        displayValue: count(() => settings.IgnoredProperties.properties),
                        items: [this.propertyNameList(s => s.IgnoredProperties.properties)],
                    },
                ],
            },
            {
                type: "group",
                heading: "Automation",
                items: [
                    {
                        name: "Progress properties",
                        desc: "Keep task counts in a note's properties up to date.",
                        control: {type: "toggle", key: "ProgressProperties.enabled"},
                    },
                    {
                        type: "page",
                        name: "Tracked task counts",
                        visible: () => settings.ProgressProperties.enabled,
                        displayValue: count(() => settings.ProgressProperties.properties),
                        items: [this.progressPropertyList()],
                    },
                    {
                        name: "Kanban board helper",
                        desc: "When a card moves to another lane, update a property in the note it links to.",
                        control: {type: "toggle", key: "KanbanHelper.enabled"},
                    },
                    {
                        type: "page",
                        name: "Boards",
                        visible: () => settings.KanbanHelper.enabled,
                        displayValue: count(() => settings.KanbanHelper.boards),
                        items: [this.kanbanBoardList()],
                    },
                ],
            },
        ];
    }

    private propertyNameList(list: (settings: MetaEditSettings) => string[]): SettingDefinitionList<ControlKey> {
        const names = list(this.plugin.settings);

        return {
            type: "list",
            emptyState: "No properties yet.",
            addItem: {
                name: "Add property",
                action: async () => {
                    const name = (await GenericPrompt.Prompt(this.app, "Property name"))?.trim();
                    if (!name || names.includes(name)) return;
                    await this.persistStructure(settings => list(settings).push(name));
                },
            },
            onDelete: index => void this.persistStructure(settings => list(settings).splice(index, 1)),
            items: names.map(name => ({name})),
        };
    }

    private progressPropertyList(): SettingDefinitionList<ControlKey> {
        const properties = this.plugin.settings.ProgressProperties.properties;
        const find = (settings: MetaEditSettings, name: string) =>
            settings.ProgressProperties.properties.find(property => property.name === name);

        return {
            type: "list",
            emptyState: "No task counts yet.",
            addItem: {
                name: "Add property",
                action: async () => {
                    const name = (await GenericPrompt.Prompt(this.app, "Property name"))?.trim();
                    if (!name || properties.some(property => property.name === name)) return;
                    await this.persistStructure(settings => settings.ProgressProperties.properties.push({
                        name,
                        type: ProgressPropertyOptions.TaskTotal,
                    }));
                },
            },
            onDelete: index => void this.persistStructure(settings => settings.ProgressProperties.properties.splice(index, 1)),
            items: properties.map(property => ({
                name: property.name,
                render: setting => {
                    setting.addDropdown(dropdown => dropdown
                        .addOptions(progressTypeLabels)
                        .setValue(property.type)
                        .onChange(value => void this.persist(settings => {
                            const stored = find(settings, property.name);
                            if (stored) stored.type = value as ProgressPropertyOptions;
                        })));
                },
            })),
        };
    }

    private kanbanBoardList(): SettingDefinitionList<ControlKey> {
        const boards = this.plugin.settings.KanbanHelper.boards;
        const find = (settings: MetaEditSettings, boardName: string) =>
            settings.KanbanHelper.boards.find(board => board.boardName === boardName);

        return {
            type: "list",
            emptyState: "No boards yet.",
            addItem: {
                name: "Add board",
                action: async () => {
                    const candidates = this.plugin.getFilesWithProperty("kanban-plugin")
                        .map(file => file.basename)
                        .filter(name => !boards.some(board => board.boardName === name));
                    if (candidates.length === 0) {
                        new Notice("MetaEdit found no other Kanban boards in this vault.");
                        return;
                    }
                    const boardName = await GenericSuggester.Suggest(this.app, candidates, candidates);
                    if (!boardName) return;
                    await this.persistStructure(settings => settings.KanbanHelper.boards.push({boardName, property: ""}));
                },
            },
            onDelete: index => void this.persistStructure(settings => settings.KanbanHelper.boards.splice(index, 1)),
            items: boards.map(board => ({
                name: board.boardName,
                desc: this.kanbanLanes(board.boardName),
                render: setting => {
                    setting.addText(text => text
                        .setPlaceholder("Property in linked notes")
                        .setValue(board.property)
                        .onChange(value => void this.persist(settings => {
                            const stored = find(settings, board.boardName);
                            if (stored) stored.property = value.trim();
                        })));
                },
            })),
        };
    }

    private kanbanLanes(boardName: string): string {
        const file: TFile | undefined = this.plugin.getFilesWithProperty("kanban-plugin")
            .find(board => board.basename === boardName);
        if (!file) return "Board not found.";

        const lanes = this.app.metadataCache.getFileCache(file)?.headings?.map(heading => heading.heading) ?? [];
        return lanes.length > 0 ? `Lanes: ${lanes.join(", ")}` : "No lanes yet.";
    }

    /** Save a settings change. Returns whether it reached disk. */
    private async persist(mutate: (settings: MetaEditSettings) => void): Promise<boolean> {
        try {
            await this.plugin.updateSettings(() => {
                mutate(this.plugin.settings);
            });
            return true;
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            new Notice(`MetaEdit could not save the setting: ${reason}`);
            return false;
        }
    }

    /** Save a change that adds or removes rows, then rebuild the definitions. */
    private async persistStructure(mutate: (settings: MetaEditSettings) => void): Promise<void> {
        await this.persist(mutate);
        this.update();
    }

    private async saveAutoPropertiesOperation(operation: AutoPropertySettingsOperation) {
        try {
            await this.plugin.updateSettings(() => {
                const previousAutoProperties = this.plugin.settings.AutoProperties.properties;
                const nextAutoProperties = applyAutoPropertySettingsOperation(previousAutoProperties, operation);
                if (nextAutoProperties === false) return false;

                this.plugin.settings.AutoProperties.properties = nextAutoProperties;

                // Compare-and-restore: only undo this settings-tab operation if the
                // failed flush still points at the array this operation assigned.
                return () => {
                    if (this.plugin.settings.AutoProperties.properties === nextAutoProperties) {
                        this.plugin.settings.AutoProperties.properties = previousAutoProperties;
                    }
                };
            });
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            new Notice(`MetaEdit could not save the Auto Properties setting: ${reason}`);
        }
    }
}
