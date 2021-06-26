import {debounce, Notice, Plugin, TAbstractFile, TFile, TFolder} from 'obsidian';
import {MetaEditSettingsTab} from "./Settings/metaEditSettingsTab";
import MEMainSuggester from "./Modals/metaEditSuggester";
import MetaController from "./metaController";
import type {MetaEditSettings} from "./Settings/metaEditSettings";
import {DEFAULT_SETTINGS} from "./Settings/defaultSettings";
import {LinkMenu} from "./Modals/LinkMenu";
import type {Property} from "./parser";
import type {IMetaEditApi} from "./IMetaEditApi";
import {MetaEditApi} from "./MetaEditApi";
import {UniqueQueue} from "./uniqueQueue";
import {UpdatedFileCache} from "./updatedFileCache";
import GenericPrompt from "./Modals/GenericPrompt/GenericPrompt";
import {abstractFileToMarkdownTFile, getActiveMarkdownFile} from "./utility";
import {ConsoleErrorLogger} from "./logger/consoleErrorLogger";
import {GuiLogger} from "./logger/guiLogger";
import {log} from "./logger/logManager";
import {KanbanHelper} from "./kanbanHelper";

export default class MetaEdit extends Plugin {
    public settings: MetaEditSettings;
    public linkMenu: LinkMenu;
    public api: IMetaEditApi;
    public controller: MetaController;

    private updateFileQueue: UniqueQueue<TFile>;
    private updatedFileCache: UpdatedFileCache;
    private update = debounce(async () => {
        while (!this.updateFileQueue.isEmpty()) {
            const file = this.updateFileQueue.dequeue();

            if (this.settings.ProgressProperties.enabled) {
                await this.updateProgressProperties(file);
            }
            if (this.settings.KanbanHelper.enabled) {
                await new KanbanHelper(this).onFileModify(file);
            }
        }
    }, 5000, true);

    async onload() {
        this.controller = new MetaController(this.app, this);
        this.updateFileQueue = new UniqueQueue<TFile>();
        this.updatedFileCache = new UpdatedFileCache();

        console.log('Loading MetaEdit');

        await this.loadSettings();

        /*START.DEVCMD*/
        this.addCommand({
            id: 'reloadMetaEdit',
            name: 'Reload MetaEdit (dev)',
            callback: () => { // @ts-ignore - for this.app.plugins
                const id: string = this.manifest.id, plugins = this.app.plugins;
                plugins.disablePlugin(id).then(() => plugins.enablePlugin(id));
            },
        });
        /*END.DEVCMD*/

        this.addCommand({
            id: 'metaEditRun',
            name: 'Run MetaEdit',
            callback: async () => {
                const file: TFile = getActiveMarkdownFile(this.app);
                if (!file) return;

                await this.runMetaEditForFile(file);
            }
        });

        this.onModifyCallbackToggle(true);

        this.addSettingTab(new MetaEditSettingsTab(this.app, this));
        this.linkMenu = new LinkMenu(this);

        if (this.settings.UIElements.enabled) {
            this.linkMenu.registerEvent();
        }

        this.api = new MetaEditApi(this).make();

        log.register(new ConsoleErrorLogger())
			.register(new GuiLogger(this));
    }

    public async runMetaEditForFile(file: TFile) {
        const data: Property[] = await this.controller.getPropertiesInFile(file);
        if (!data) return;

        const suggester: MEMainSuggester = new MEMainSuggester(this.app, this, data, file, this.controller);
        suggester.open();
    }

    onunload() {
        console.log('Unloading MetaEdit');
        this.onModifyCallbackToggle(false);
        this.linkMenu.unregisterEvent();
    }

    public onModifyCallbackToggle(enable: boolean) {
        if (enable) {
            this.app.vault.on("modify", this.onModifyCallback);
        } else if (this.onModifyCallback && !enable) {
            this.app.vault.off("modify", this.onModifyCallback);
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

    public getFilesWithProperty(property: string): TFile[] {
        const markdownFiles = this.app.vault.getMarkdownFiles();
        let files: TFile[] = [];

        markdownFiles.forEach(file => {
            const fileCache = this.app.metadataCache.getFileCache(file);

            if (fileCache) {
                const fileFrontmatter = fileCache.frontmatter;

                if (fileFrontmatter && fileFrontmatter[property]) {
                    files.push(file);
                }
            }
        });

        return files;
    }

    private onModifyCallback = async (file: TAbstractFile) => await this.onModify(file);

    private async onModify(file: TAbstractFile) {
        const outfile: TFile = abstractFileToMarkdownTFile(file);
        if (!outfile) return;

        const fileContent = await this.app.vault.cachedRead(outfile);
        if (!this.updatedFileCache.set(file.path, fileContent)) return;

        if (this.updateFileQueue.enqueue(outfile)) {
            await this.update();
        }
    }

    private async updateProgressProperties(file: TFile) {
        const data = await this.controller.getPropertiesInFile(file);
        if (!data) return;

        await this.controller.handleProgressProps(data, file);
    }

    public async runMetaEditForFolder(targetFolder: TFolder) {
        const pName = await GenericPrompt.Prompt(this.app, `Add a new property to all files in ${targetFolder.name} (and subfolders)`);
        if (!pName) return;

        const pVal = await GenericPrompt.Prompt(this.app, "Enter a value");
        if (!pVal) return;

        const updateFilesInFolder = async (targetFolder: TFolder, propertyName: string, propertyValue: string) => {
            for (const child of targetFolder.children) {
                if (child instanceof TFile && child.extension == "md")
                    await this.controller.addYamlProp(pName, pVal, child);

                if (child instanceof TFolder)
                    await updateFilesInFolder(child, propertyName, propertyValue);
            }
        }

        await updateFilesInFolder(targetFolder, pName, pVal);
    }
}

