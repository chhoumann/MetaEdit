import {debounce, EventRef, Notice, Plugin, TAbstractFile, TFile} from 'obsidian';
import {MetaEditSettingsTab} from "./Settings/metaEditSettingsTab";
import MEMainSuggester from "./Modals/metaEditSuggester";
import MetaController from "./metaController";
import type {MetaEditSettings} from "./Settings/metaEditSettings";
import {DEFAULT_SETTINGS} from "./Settings/defaultSettings";

export default class MetaEdit extends Plugin {
    public settings: MetaEditSettings;
    private controller: MetaController;
    private prevModFileContent: string;
    private modifyCallback: (file: TFile) => void;

    async onload() {
        this.controller = new MetaController(this.app, this);
        console.log('Loading MetaEdit');

        await this.loadSettings();

        if (process.env.BUILD !== 'production') {
            this.addCommand({
                id: 'reloadMetaEdit',
                name: 'Reload MetaEdit (dev)',
                callback: () => { // @ts-ignore - for this.app.plugins
                    const id: string = this.manifest.id, plugins = this.app.plugins;
                    plugins.disablePlugin(id).then(() => plugins.enablePlugin(id));
                },
            });
        }

        this.addCommand({
            id: 'metaEditRun',
            name: 'Run MetaEdit',
            callback: async () => {
                const data = await this.controller.getForCurrentFile();
                if (!data) return;

                const suggester: MEMainSuggester = new MEMainSuggester(this.app, this, data, this.controller);
                suggester.open();
            }
        });

        if (this.settings.ProgressProperties.enabled) {
            this.modifyCallback = (file: TAbstractFile) => this.onModifyUpdateProgressProperties(file)
            this.app.vault.on("modify", this.modifyCallback);
        }

        this.addSettingTab(new MetaEditSettingsTab(this.app, this));
    }

    private onModifyUpdateProgressProperties =
        debounce(async (file: TAbstractFile) => {
            if (file instanceof TFile) {
                const fileContent = await this.app.vault.read(file);

                if (fileContent !== this.prevModFileContent) {
                    console.log("Hello", file.name)
                    const data = await this.controller.get(file);
                    if (!data) return;

                    this.prevModFileContent = fileContent;

                    await this.controller.handleProgressProps(data, file);
                }
            }
        }, 4000, false);

    onunload() {
        console.log('Unloading MetaEdit');
        if (this.modifyCallback) {
            this.app.vault.off("modify", this.modifyCallback);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
    public logError(error: string) {
        new Notice(`MetaEdit: ${error}`);
    }
}

