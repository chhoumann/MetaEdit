import {debounce, EventRef, Notice, Plugin, TAbstractFile, TFile} from 'obsidian';
import {MetaEditSettingsTab} from "./Settings/metaEditSettingsTab";
import MEMainSuggester from "./Modals/metaEditSuggester";
import MetaController from "./metaController";
import type {MetaEditSettings} from "./Settings/metaEditSettings";
import {DEFAULT_SETTINGS} from "./Settings/defaultSettings";

export default class MetaEdit extends Plugin {
    public settings: MetaEditSettings;
    private controller: MetaController;
    private updatedFileCache: { [fileName: string]: { content: string, updateTime: number } } = {};
    private onModifyUpdateProgressProperties =
        debounce(async (file: TAbstractFile) => {
            if (file instanceof TFile) {
                const fileContent = await this.app.vault.read(file);

                if (!this.updatedFileCache[file.name] || fileContent !== this.updatedFileCache[file.name].content) {
                    const data = await this.controller.getPropertiesInFile(file);
                    if (!data) return;

                    this.updatedFileCache[file.name] = {
                        content: fileContent,
                        updateTime: Date.now(),
                    };

                    await this.controller.handleProgressProps(data, file);
                }

                this.cleanCache();
            }
        }, 4000, false);

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
                const file: TFile = this.getCurrentFile();
                if (!file) return;
                const data = await this.controller.getPropertiesInFile(file);
                if (!data) return;

                const suggester: MEMainSuggester = new MEMainSuggester(this.app, this, data, file, this.controller);
                suggester.open();
            }
        });

        this.toggleOnFileModifyUpdateProgressProperties(this.settings.ProgressProperties.enabled);

        this.addSettingTab(new MetaEditSettingsTab(this.app, this));
    }

    onunload() {
        console.log('Unloading MetaEdit');
        this.toggleOnFileModifyUpdateProgressProperties(false);
    }

    public getCurrentFile() {
        try {
            return this.app.workspace.getActiveFile();
        }
        catch (e) {
            this.logError("could not get current file content.");
            return null;
        }
    }

    public toggleOnFileModifyUpdateProgressProperties(enable: boolean) {
        if (enable) {
            this.app.vault.on("modify", this.modifyCallback);
        } else if (this.modifyCallback && !enable) {
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

    private modifyCallback: (file: TFile) => void = (file: TAbstractFile) => this.onModifyUpdateProgressProperties(file);

    private cleanCache() {
        const five_minutes = 18000;

        for (let cacheItem in this.updatedFileCache) {
            if (this.updatedFileCache[cacheItem].updateTime < Date.now() - five_minutes) {
                delete this.updatedFileCache[cacheItem];
            }
        }
    }
}

